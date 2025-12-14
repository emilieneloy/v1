# Shopify A/B Price Testing

A DIY A/B testing system for Shopify price optimization. Built on Midday v1 starter kit with self-hosted Supabase.

## Features

- **Price Testing**: Test different prices for your products
- **Visitor Bucketing**: Persistent assignment of visitors to test variants
- **Statistical Analysis**: Two-proportion z-test for conversion rates
- **Revenue Tracking**: Track revenue per visitor by variant
- **Shopify Integration**: Auto-apply discounts at checkout
- **Dark Theme UI**: Oxide-inspired dashboard design

## Tech Stack

- **Framework**: Next.js 15 + TypeScript
- **Database**: Self-hosted Supabase (PostgreSQL)
- **UI**: Tailwind CSS + Shadcn components
- **Monorepo**: Turborepo
- **Validation**: Zod

## Project Structure

```
shopify-ab-testing/
├── apps/
│   └── app/                     # Next.js dashboard
│       └── src/
│           ├── app/
│           │   ├── api/
│           │   │   ├── bucket/[testId]/   # Visitor bucketing
│           │   │   ├── track/             # Event tracking
│           │   │   ├── tests/             # Test CRUD
│           │   │   └── webhooks/shopify/  # Order attribution
│           │   └── [locale]/(dashboard)/
│           │       ├── tests/             # Test management pages
│           │       └── page.tsx           # Dashboard
│           └── components/
│               └── tests/                 # Test components
├── packages/
│   ├── lib/                     # A/B testing utilities
│   │   └── src/
│   │       ├── stats.ts         # Statistical calculations
│   │       ├── schemas.ts       # Zod validation schemas
│   │       └── shopify.ts       # Shopify Admin API client
│   ├── supabase/                # Database package
│   │   └── src/
│   │       ├── queries/         # DB query functions
│   │       └── types/           # TypeScript types
│   └── ui/                      # UI components
├── supabase/                    # Self-hosted Supabase
│   ├── docker-compose.yml
│   ├── kong.yml
│   └── migrations/
│       └── 20241214000000_ab_testing.sql
└── shopify/                     # Theme integration
    ├── snippets/ab-test.liquid
    └── assets/ab-test.js
```

## Quick Start

### 1. Start Supabase

```bash
cd supabase
cp .env.example .env
# Edit .env with your secrets (generate JWT keys)
docker-compose up -d
```

Supabase will be available at:
- API: http://localhost:8000
- Studio: http://localhost:3001

### 2. Start the App

```bash
# Install dependencies
bun install

# Copy environment file
cp apps/app/.env.example apps/app/.env
# Edit with your Supabase and Shopify credentials

# Start development server
bun dev
```

Dashboard: http://localhost:3000

### 3. Install Shopify Theme Snippet

Copy the files from `shopify/` to your Shopify theme:
- `snippets/ab-test.liquid` -> Theme snippets
- `assets/ab-test.js` -> Theme assets

Add to `theme.liquid` before `</head>`:
```liquid
{% render 'ab-test' %}
```

### 4. Set Up Shopify Webhook

In Shopify Admin:
1. Settings > Notifications > Webhooks
2. Create webhook for `orders/paid`
3. URL: `https://your-domain.com/api/webhooks/shopify`

## Environment Variables

### Supabase (supabase/.env)

```bash
POSTGRES_PASSWORD=your-super-secret-password
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters
ANON_KEY=eyJ...  # Generate from JWT secret
SERVICE_ROLE_KEY=eyJ...  # Generate from JWT secret
```

### App (apps/app/.env)

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
SHOPIFY_STORE=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_WEBHOOK_SECRET=your-webhook-secret
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bucket/{testId}` | Get/assign visitor to variant |
| POST | `/api/track` | Record events (view, cart, purchase) |
| GET | `/api/tests` | List all tests |
| POST | `/api/tests` | Create new test |
| GET | `/api/tests/{id}` | Get test with results |
| PATCH | `/api/tests/{id}` | Update test (status, etc.) |
| DELETE | `/api/tests/{id}` | Delete test |
| POST | `/api/webhooks/shopify` | Handle order webhooks |

## How It Works

1. **Visitor arrives** on your Shopify store
2. **Theme snippet** calls `/api/bucket/{testId}` to get variant assignment
3. **Price is modified** based on variant's `price_modifier_cents`
4. **Discount is applied** automatically at checkout
5. **Events tracked** (view, add_to_cart)
6. **Purchase webhook** attributes revenue to variant
7. **Dashboard shows** statistical analysis

## Statistical Analysis

The system uses:
- **Two-proportion z-test** for conversion rate comparison
- **Welch's t-test** for revenue per visitor comparison
- **95% confidence** level (configurable)
- **Sample size recommendations** for reaching significance

## Development

```bash
# Run all services
bun dev

# Run specific app
bun dev --filter=app

# Type check
bun typecheck

# Lint
bun lint
```

## Production Deployment

1. Deploy Supabase (Docker or managed)
2. Deploy Next.js app (Vercel, Railway, etc.)
3. Update environment variables
4. Configure Shopify webhook with production URL

## Cost Comparison

| Solution | Monthly Cost |
|----------|-------------|
| This DIY | $10-20 hosting |
| Trident AB | $19.99 |
| Split A/B | $19-49 |
| Intelligems | $49-999 |

## Based On

This project is built on [Midday v1](https://github.com/midday-ai/v1), an open-source starter kit.

## License

MIT
