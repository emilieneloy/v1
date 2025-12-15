# Deployment Guide

This guide covers deploying the Shopify A/B Testing application to production.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Vercel Deployment](#vercel-deployment)
4. [Supabase Setup](#supabase-setup)
5. [Upstash Redis Setup](#upstash-redis-setup)
6. [Shopify App Configuration](#shopify-app-configuration)
7. [Domain & SSL](#domain--ssl)
8. [Monitoring Setup](#monitoring-setup)
9. [Production Checklist](#production-checklist)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] Shopify Partner account
- [ ] Vercel account (or alternative hosting)
- [ ] Supabase account
- [ ] Upstash account
- [ ] Custom domain (optional but recommended)
- [ ] Sentry account (optional, for error tracking)

---

## Environment Setup

### Required Environment Variables

Create a `.env.production` file (never commit this):

```bash
# Shopify Configuration
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret
SHOPIFY_APP_URL=https://your-app-domain.com

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Upstash Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Sentry (Optional)
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=your_sentry_auth_token

# Application
NODE_ENV=production
```

---

## Vercel Deployment

### Option 1: Deploy via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy from project root
vercel

# Deploy to production
vercel --prod
```

### Option 2: GitHub Integration

1. Connect repository to Vercel
2. Configure project settings:
   - Framework Preset: Next.js
   - Root Directory: `apps/app`
   - Build Command: `turbo build --filter=@v1/app`
   - Output Directory: `.next`

3. Add environment variables in Vercel dashboard
4. Deploy

### Vercel Project Settings

```json
{
  "buildCommand": "turbo build --filter=@v1/app",
  "outputDirectory": "apps/app/.next",
  "installCommand": "bun install",
  "framework": "nextjs"
}
```

### Monorepo Configuration

Create `vercel.json` in project root:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "apps/app/package.json",
      "use": "@vercel/next"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "apps/app/$1"
    }
  ]
}
```

---

## Supabase Setup

### 1. Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note your project URL and keys

### 2. Run Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 3. Database Schema

The migrations create the following tables:

```sql
-- Core tables
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  product_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER DEFAULT 50,
  discount_code TEXT,
  price_modifier_cents INTEGER DEFAULT 0
);

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(test_id, visitor_id)
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  product_id TEXT,
  order_id TEXT UNIQUE,
  revenue_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Enable Row Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create policies (see migrations for full policies)
```

### 5. Create Indexes

```sql
-- Performance indexes
CREATE INDEX idx_tests_shop_status ON tests(shop, status);
CREATE INDEX idx_assignments_test_visitor ON assignments(test_id, visitor_id);
CREATE INDEX idx_events_test_type ON events(test_id, event_type);
CREATE INDEX idx_events_order_id ON events(order_id) WHERE order_id IS NOT NULL;
```

---

## Upstash Redis Setup

### 1. Create Database

1. Go to [upstash.com](https://upstash.com)
2. Create new Redis database
3. Choose region closest to your Vercel deployment
4. Note the REST URL and token

### 2. Configure Rate Limiting

The app automatically uses these environment variables:

```bash
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx
```

### 3. Verify Connection

```typescript
// Test script
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const result = await redis.ping();
console.log("Redis connection:", result); // Should print "PONG"
```

---

## Shopify App Configuration

### 1. Create App in Partner Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Create new app
3. Configure app settings:
   - App URL: `https://your-app-domain.com`
   - Allowed redirection URLs:
     - `https://your-app-domain.com/api/auth/shopify/callback`

### 2. Configure shopify.app.toml

```toml
# apps/app/shopify.app.toml
name = "A/B Price Testing"
client_id = "your_client_id"
application_url = "https://your-app-domain.com"

[access_scopes]
scopes = "read_products,write_price_rules,read_orders"

[auth]
redirect_urls = [
  "https://your-app-domain.com/api/auth/shopify/callback"
]

[webhooks]
api_version = "2024-01"

[[webhooks.subscriptions]]
topics = ["orders/paid"]
uri = "/api/webhooks/shopify"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/api/webhooks/shopify"

[app_proxy]
url = "https://your-app-domain.com/api/proxy"
subpath = "ab-testing"
prefix = "apps"

[pos]
embedded = false
```

### 3. Deploy Theme Extension

```bash
cd apps/app

# Deploy extension
shopify app deploy --extension-only

# Or push to Shopify
shopify extension push
```

### 4. Register Webhooks

Webhooks are registered automatically via the TOML config, but you can verify:

```bash
shopify app webhooks list
```

---

## Domain & SSL

### Custom Domain Setup

1. **Add domain in Vercel:**
   - Go to Project Settings > Domains
   - Add your custom domain
   - Configure DNS records

2. **DNS Configuration:**
   ```
   Type: CNAME
   Name: your-subdomain
   Value: cname.vercel-dns.com
   ```

3. **SSL Certificate:**
   - Vercel automatically provisions SSL
   - Verify HTTPS works after DNS propagation

### Update Shopify App URLs

After domain setup, update:
1. App URL in Partner Dashboard
2. Redirect URLs
3. Webhook URLs
4. `SHOPIFY_APP_URL` environment variable

---

## Monitoring Setup

### Sentry Integration

1. Create Sentry project
2. Add environment variables:
   ```bash
   SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   SENTRY_AUTH_TOKEN=xxx
   ```

3. Configure in `sentry.server.config.ts`:
   ```typescript
   import * as Sentry from "@sentry/nextjs";

   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     tracesSampleRate: 0.1,
     environment: process.env.NODE_ENV,
   });
   ```

### Health Check Endpoint

The app includes a health check at `/api/health`:

```bash
curl https://your-app-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "latency_ms": 45
}
```

### Uptime Monitoring

Configure external monitoring (e.g., Better Uptime, Pingdom):
- Monitor `/api/health` endpoint
- Alert on 5xx responses
- Check every 1-5 minutes

---

## Production Checklist

### Pre-Launch

- [ ] All environment variables set in production
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Rate limiting configured
- [ ] Webhooks registered
- [ ] Theme extension deployed
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Health check passing

### Security

- [ ] `SHOPIFY_WEBHOOK_SECRET` is set
- [ ] No secrets in code or logs
- [ ] CORS properly configured
- [ ] Security headers enabled
- [ ] Rate limiting tested

### Performance

- [ ] Database indexes created
- [ ] Redis caching working
- [ ] CDN configured (Vercel Edge)
- [ ] Response times < 500ms

### Monitoring

- [ ] Error tracking enabled (Sentry)
- [ ] Uptime monitoring configured
- [ ] Log aggregation set up
- [ ] Alerts configured

---

## Troubleshooting

### Common Issues

#### 1. Webhook Signature Verification Fails

**Cause:** Wrong webhook secret or body parsing issues.

**Solution:**
```bash
# Verify webhook secret matches
shopify app webhook verify

# Check secret is set
echo $SHOPIFY_WEBHOOK_SECRET
```

#### 2. Rate Limiting Not Working

**Cause:** Redis connection issues.

**Solution:**
```bash
# Test Redis connection
curl -X POST $UPSTASH_REDIS_REST_URL/ping \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

#### 3. Database Connection Errors

**Cause:** Wrong credentials or network issues.

**Solution:**
```bash
# Verify Supabase URL
curl $NEXT_PUBLIC_SUPABASE_URL/rest/v1/

# Check service role key
supabase db execute "SELECT 1"
```

#### 4. Theme Extension Not Loading

**Cause:** Extension not deployed or wrong block type.

**Solution:**
```bash
# Check extension status
shopify app extension list

# Redeploy
shopify app deploy --extension-only
```

#### 5. CORS Errors

**Cause:** Origin not allowed.

**Solution:**
- Verify shop domain in `X-Shopify-Shop-Domain` header
- Check CORS headers in response
- Ensure OPTIONS preflight handled

### Getting Help

1. Check application logs in Vercel
2. Review Sentry error reports
3. Check Supabase logs
4. Review Shopify webhook delivery logs
5. Open issue on GitHub repository

---

## Rollback Procedure

If issues occur after deployment:

### 1. Vercel Rollback

```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback <deployment-url>
```

### 2. Database Rollback

```bash
# Revert last migration
supabase db reset --version <previous-version>
```

### 3. Emergency Procedures

1. **Disable webhooks** - Pause in Shopify Partner Dashboard
2. **Enable maintenance mode** - Deploy maintenance page
3. **Scale down** - Reduce traffic handling
4. **Investigate** - Review logs and errors
5. **Fix and redeploy** - Test in staging first
