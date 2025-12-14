# Development Setup Guide

## Prerequisites

- Node.js 18+ or Bun 1.1+
- Docker & Docker Compose
- A Shopify store with Admin API access

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd shopify-ab-testing
bun install
```

### 2. Start Supabase

```bash
cd supabase
cp .env.example .env
```

Edit `.env` with secure values:

```bash
# Generate a secure password
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Generate JWT secret (must be at least 32 characters)
JWT_SECRET=$(openssl rand -base64 64)

# Generate ANON and SERVICE keys using jwt.io
# Header: {"alg":"HS256","typ":"JWT"}
# Payload: {"role":"anon","iss":"supabase","iat":...,"exp":...}
# Sign with your JWT_SECRET
```

Start the services:

```bash
docker-compose up -d
```

Wait for services to be ready (~30 seconds). Access:
- **API**: http://localhost:8000
- **Studio**: http://localhost:3001

### 3. Configure the App

```bash
cd ../apps/app
cp .env.example .env
```

Edit `.env`:

```bash
# Supabase (from your .env in supabase/)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>

# Shopify
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_WEBHOOK_SECRET=<generate-random-string>
```

### 4. Run the App

```bash
cd ../..  # Back to root
bun dev
```

Dashboard: http://localhost:3000

---

## Shopify Setup

### Create a Private App

1. Go to Shopify Admin > Apps > Develop apps
2. Create a new app
3. Configure Admin API scopes:
   - `read_products`
   - `write_products`
   - `read_price_rules`
   - `write_price_rules`
   - `read_discounts`
   - `write_discounts`
4. Install the app and copy the Admin API access token

### Install Theme Snippet

Copy files to your Shopify theme:

```bash
# From the shopify/ directory:
snippets/ab-test.liquid -> Online Store > Themes > Edit code > Snippets
assets/ab-test.js -> Online Store > Themes > Edit code > Assets
```

Add to `theme.liquid` before `</head>`:

```liquid
{% render 'ab-test' %}
```

Configure in `ab-test.liquid`:

```liquid
{% assign ab_api_url = 'https://your-domain.com/api' %}
```

### Configure Webhook

1. Go to Settings > Notifications > Webhooks
2. Create webhook:
   - Event: `orders/paid`
   - URL: `https://your-domain.com/api/webhooks/shopify`
   - Format: JSON
3. Copy the webhook secret to your `.env`

---

## Database Schema

The migration creates these tables:

### `tests`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Test name |
| description | text | Optional description |
| status | text | draft, active, paused, completed |
| product_ids | text[] | Shopify product IDs |
| created_at | timestamptz | Creation timestamp |

### `variants`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| test_id | uuid | Foreign key to tests |
| name | text | Variant name |
| weight | integer | Traffic weight (0-100) |
| discount_code | text | Shopify discount code |
| price_modifier_cents | integer | Price adjustment |

### `assignments`
| Column | Type | Description |
|--------|------|-------------|
| test_id | uuid | Foreign key to tests |
| visitor_id | text | Visitor cookie ID |
| variant_id | uuid | Assigned variant |
| created_at | timestamptz | Assignment timestamp |

### `events`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| test_id | uuid | Foreign key to tests |
| variant_id | uuid | Foreign key to variants |
| visitor_id | text | Visitor cookie ID |
| event_type | text | view, add_to_cart, purchase |
| product_id | text | Shopify product ID |
| order_id | text | Shopify order ID |
| revenue_cents | integer | Revenue in cents |
| created_at | timestamptz | Event timestamp |

---

## Running Tests

```bash
# Run all tests
bun test

# Run lib package tests
cd packages/lib
bun test

# Run with coverage
bun test:coverage
```

---

## Production Deployment

### Option 1: Vercel + Managed Supabase

1. Push to GitHub
2. Connect to Vercel
3. Create Supabase project at supabase.com
4. Run migration in Supabase SQL editor
5. Configure environment variables

### Option 2: Docker + Self-hosted

1. Deploy Supabase docker-compose to a server
2. Build Next.js: `bun run build`
3. Deploy with PM2, Docker, or similar
4. Configure reverse proxy (nginx/Caddy)

### Environment Variables for Production

```bash
# Use real Supabase URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co

# Or your self-hosted URL
NEXT_PUBLIC_SUPABASE_URL=https://supabase.your-domain.com
```

---

## Troubleshooting

### "Cannot find module" errors
```bash
bun install
```

### Supabase connection errors
1. Check if containers are running: `docker ps`
2. Check logs: `docker-compose logs -f`
3. Verify API URL and keys in `.env`

### Webhook not receiving events
1. Verify webhook URL is accessible (use ngrok for local dev)
2. Check webhook secret matches
3. Look at Shopify webhook logs in Admin

### Stats not updating
The materialized view refreshes manually. Run:
```sql
SELECT refresh_test_stats();
```
Or call the API endpoint that triggers this.
