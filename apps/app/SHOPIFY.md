# Shopify A/B Price Testing Integration

This app enables A/B testing of product prices on Shopify stores. It uses Theme App Extensions for automatic installation and proper App Store compliance.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App (Dashboard)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Dashboard  │  │  Shopify    │  │  APIs               │  │
│  │  /tests     │  │  OAuth      │  │  /api/bucket        │  │
│  │  /          │  │             │  │  /api/track         │  │
│  │             │  │             │  │  /api/webhooks      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    Cloudflare Tunnel (dev)
                              │
┌─────────────────────────────────────────────────────────────┐
│              Theme App Extension (Storefront)               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  App Embed Block                                    │    │
│  │  - Loads ab-test.js                                 │    │
│  │  - Assigns visitors to variants                     │    │
│  │  - Modifies price displays                          │    │
│  │  - Tracks events                                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Setup Guide

### 1. Prerequisites

- Node.js 18+
- Shopify Partners account (free): https://partners.shopify.com
- Supabase running locally (via Docker)

### 2. Create Shopify App

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com)
2. Click **Apps** → **Create app** → **Create app manually**
3. Name your app (e.g., "AB Price Testing")
4. Copy the **Client ID** and **Client Secret**

### 3. Create Development Store

1. In Partners Dashboard: **Stores** → **Add store**
2. Select **Create development store**
3. Choose **Create a store to test and build**
4. Name it (e.g., "ab-test-dev")

### 4. Configure Environment

Update `apps/app/.env`:

```bash
# Shopify Integration
SHOPIFY_CLIENT_ID=your_client_id_here
SHOPIFY_CLIENT_SECRET=your_client_secret_here
SHOPIFY_SCOPES=read_products,read_orders
SHOPIFY_WEBHOOK_SECRET=  # Set after creating webhook

# App URL (update when using tunnel)
NEXT_PUBLIC_APP_URL=http://localhost:3002
```

### 5. Run Database Migration

Open Supabase Studio (http://localhost:8000) → SQL Editor:

```sql
-- Run the migration from:
-- apps/app/supabase/migrations/20241214_add_shopify_stores.sql
```

### 6. Start Development

```bash
# Terminal 1: Start Next.js
cd apps/app
bun dev

# Terminal 2: Start Cloudflare tunnel
npx cloudflared tunnel --url http://localhost:3002
```

Copy the tunnel URL (e.g., `https://random-words.trycloudflare.com`)

### 7. Update App URLs

1. In Shopify Partners Dashboard → Your App → **App setup**
2. Set **App URL**: `https://your-tunnel-url.trycloudflare.com`
3. Set **Allowed redirection URL(s)**:
   - `https://your-tunnel-url.trycloudflare.com/api/auth/shopify/callback`

### 8. Install App on Dev Store

1. In Partners Dashboard → Your App
2. Click **Select store** → Choose your dev store
3. Click **Install app**
4. This triggers OAuth flow and stores credentials

### 9. Enable Theme Extension

1. In your dev store admin: **Online Store** → **Themes**
2. Click **Customize**
3. Click **App embeds** (left sidebar)
4. Enable **AB Price Testing**
5. Configure the **API URL** setting with your tunnel URL

## Creating Tests

### Via Dashboard

1. Go to `http://localhost:3002/tests`
2. Click **Create Test**
3. Configure:
   - **Name**: Test name
   - **Product IDs**: Shopify product IDs to test
   - **Shop**: Your store domain (e.g., `ab-test-dev.myshopify.com`)
4. Add variants:
   - **Control**: 50% weight, no price change
   - **Discount**: 50% weight, -500 cents ($5 off)
5. Set status to **Active**

### Via API

```bash
# Create test
curl -X POST http://localhost:3002/api/tests \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Price Test",
    "shop": "your-store.myshopify.com",
    "product_ids": ["123456789"],
    "status": "active"
  }'

# Add variants
curl -X POST http://localhost:3002/api/tests/{testId}/variants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Control",
    "weight": 50,
    "price_modifier_cents": 0
  }'
```

## How It Works

### Visitor Flow

1. **Page Load**: Theme extension loads `ab-test.js`
2. **Visitor ID**: Script generates/retrieves persistent visitor ID
3. **Bucket Assignment**: Calls `/api/bucket/{testId}` to get variant
4. **Price Modification**: Updates price displays based on variant
5. **Event Tracking**: Sends view event to `/api/track`
6. **Add to Cart**: Intercepts and tracks add-to-cart events
7. **Checkout**: Sets cart attributes for attribution

### Purchase Attribution

Orders are attributed via:
1. **Cart attributes**: `ab_test_id`, `ab_variant_id`, `ab_visitor_id`
2. **Webhook**: `orders/paid` webhook records purchase events

## File Structure

```
apps/app/
├── shopify.app.toml              # Shopify app configuration
├── extensions/
│   └── theme-ab-testing/
│       ├── shopify.extension.toml
│       ├── assets/
│       │   └── ab-test.js        # Client-side script (~300 lines)
│       └── blocks/
│           └── ab-test-embed.liquid
├── src/app/api/
│   ├── auth/shopify/             # OAuth routes
│   ├── bucket/[testId]/          # Variant assignment
│   ├── track/                    # Event tracking
│   ├── tests/                    # Test CRUD
│   │   └── active/               # Get active test for shop
│   └── webhooks/shopify/         # Order webhooks
└── supabase/
    └── migrations/               # Database schema
```

## API Reference

### GET /api/bucket/{testId}

Assigns visitor to a variant.

**Query params:**
- `visitor_id` (required): Unique visitor identifier
- `product_id` (optional): Shopify product ID

**Response:**
```json
{
  "variant_id": "uuid",
  "variant_name": "Control",
  "discount_code": "SAVE10",
  "price_modifier_cents": -500,
  "is_new_assignment": true
}
```

### POST /api/track

Records an event.

**Body:**
```json
{
  "test_id": "uuid",
  "variant_id": "uuid",
  "visitor_id": "v_xxx",
  "event_type": "view|add_to_cart|purchase",
  "product_id": "123",
  "revenue_cents": 5000
}
```

### GET /api/tests/active

Get active test for a shop.

**Query params:**
- `shop` (required): Shop domain

### POST /api/webhooks/shopify

Receives Shopify order webhooks.

**Headers:**
- `x-shopify-hmac-sha256`: HMAC signature
- `x-shopify-topic`: Webhook topic

## Troubleshooting

### No price changes visible
- Check browser console for errors
- Verify API URL in theme extension settings
- Ensure test status is "active"
- Check that shop domain matches

### OAuth fails
- Verify SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env
- Check redirect URL in Shopify app settings matches
- Ensure tunnel URL is up to date

### Webhook not receiving
- Create webhook in Shopify admin: Settings → Notifications → Webhooks
- Topic: `orders/paid`
- URL: `https://your-tunnel-url/api/webhooks/shopify`
- Copy webhook secret to SHOPIFY_WEBHOOK_SECRET

## Production Deployment

For production, you'll need to:

1. Deploy Next.js app (Vercel recommended)
2. Update Shopify app URLs to production domain
3. Run migrations on production Supabase
4. Submit for App Store review (if public)

### Theme App Extension Requirements

For App Store approval:
- ✅ Using Theme App Extensions (not manual snippets)
- ✅ Auto-cleanup on uninstall
- ✅ OAuth authentication
- ✅ HTTPS everywhere
