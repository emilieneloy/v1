# Security Documentation

This document describes the security architecture and best practices for the Shopify A/B Testing application.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Webhook Security](#webhook-security)
3. [API Security](#api-security)
4. [Data Protection](#data-protection)
5. [Rate Limiting](#rate-limiting)
6. [CORS Policy](#cors-policy)
7. [Security Headers](#security-headers)
8. [Secret Management](#secret-management)
9. [GDPR Compliance](#gdpr-compliance)
10. [Security Checklist](#security-checklist)

---

## Authentication & Authorization

### OAuth 2.0 Flow

The application uses Shopify's OAuth 2.0 flow for merchant authentication:

```
1. Merchant clicks "Install" on App Store
2. App redirects to Shopify authorization page
3. Merchant grants permissions
4. Shopify redirects back with authorization code
5. App exchanges code for access token
6. Access token stored securely (encrypted in database)
```

### HMAC Verification

All OAuth callbacks are verified using HMAC-SHA256:

```typescript
import crypto from "crypto";

function verifyHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get("hmac");
  if (!hmac) return false;

  // Remove hmac from params for verification
  const params = new URLSearchParams(query);
  params.delete("hmac");
  params.sort();

  const message = params.toString();
  const generatedHmac = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(generatedHmac, "hex")
  );
}
```

### Access Token Security

- Access tokens are stored encrypted in the database
- Tokens are never logged or exposed in error messages
- Tokens are scoped to minimum required permissions
- Token refresh is handled automatically

### Required Scopes

The app requests only the minimum necessary scopes:

| Scope | Purpose |
|-------|---------|
| `read_products` | Fetch product information for tests |
| `write_price_rules` | Create discount codes for variants |
| `read_orders` | Process purchase webhooks for attribution |

---

## Webhook Security

### HMAC Signature Verification

All incoming webhooks from Shopify are verified using HMAC-SHA256:

```typescript
import crypto from "crypto";

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    throw new Error("SHOPIFY_WEBHOOK_SECRET is required");
  }

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(generatedSignature)
  );
}
```

### Fail-Closed Design

The webhook handler follows a fail-closed security model:

```typescript
// If webhook secret is not configured, reject all webhooks
if (!process.env.SHOPIFY_WEBHOOK_SECRET) {
  console.error("SHOPIFY_WEBHOOK_SECRET not configured");
  return new Response("Webhook verification not configured", { status: 500 });
}
```

### Idempotency

Webhooks implement idempotent handling to prevent duplicate processing:

```sql
-- Unique constraint on order_id prevents duplicate purchases
ALTER TABLE events ADD CONSTRAINT events_order_id_unique UNIQUE (order_id);
```

```typescript
// Upsert instead of insert for order webhooks
const { error } = await supabase.from("events").upsert(
  { order_id: orderId, ...eventData },
  { onConflict: "order_id", ignoreDuplicates: true }
);
```

---

## API Security

### Public API Authentication

Public APIs (bucket, track, tests/active) use shop domain validation:

```typescript
// Validate shop domain format
const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
if (!shop || !shopRegex.test(shop)) {
  return NextResponse.json(
    { error: "Invalid or missing shop parameter" },
    { status: 400 }
  );
}

// Verify request origin matches claimed shop
const shopHeader = request.headers.get("x-shopify-shop-domain");
if (shopHeader && shop !== shopHeader) {
  return NextResponse.json(
    { error: "Shop mismatch" },
    { status: 401 }
  );
}
```

### Request Validation

All API inputs are validated using Zod schemas:

```typescript
import { z } from "zod";

export const trackEventSchema = z.object({
  test_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  visitor_id: z.string().min(1).max(255),
  event_type: z.enum(["view", "add_to_cart", "purchase"]),
  product_id: z.string().optional(),
  order_id: z.string().optional(),
  revenue_cents: z.number().int().nonnegative().optional(),
});

// Usage
const validation = trackEventSchema.safeParse(body);
if (!validation.success) {
  return NextResponse.json(
    { error: "Invalid request", details: validation.error.flatten() },
    { status: 400 }
  );
}
```

### Request Body Size Limits

POST endpoints enforce body size limits to prevent DoS:

```typescript
const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const MAX_BATCH_SIZE = 100; // events per batch

const contentLength = request.headers.get("content-length");
if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
  return NextResponse.json(
    { error: "Request body too large" },
    { status: 413 }
  );
}
```

---

## Data Protection

### Row Level Security (RLS)

Supabase RLS policies ensure data isolation between shops:

```sql
-- Users can only read their own shop's tests
CREATE POLICY "shop_isolation" ON tests
  FOR ALL
  USING (shop = current_setting('app.current_shop'));

-- Events are read-only for the dashboard
CREATE POLICY "events_read_own_tests" ON events
  FOR SELECT
  USING (test_id IN (
    SELECT id FROM tests WHERE shop = current_setting('app.current_shop')
  ));
```

### Data Encryption

- Database connections use TLS encryption
- Sensitive data (access tokens) are encrypted at rest
- Environment variables are used for all secrets

### Data Retention

| Data Type | Retention Period | Notes |
|-----------|------------------|-------|
| Test data | Indefinite | Until deleted by merchant |
| Events | 90 days | Automatic cleanup job |
| Assignments | 90 days | Matches event retention |
| Access tokens | Until uninstall | Deleted on app uninstall |

---

## Rate Limiting

### Implementation

Rate limiting uses Upstash Redis with sliding window algorithm:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Public API rate limit: 100 requests per minute per IP
export const publicApiRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1m"),
  prefix: "ratelimit:public",
});

// Authenticated API rate limit: 200 requests per minute per user
export const authenticatedApiRatelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(200, "1m"),
  prefix: "ratelimit:auth",
});
```

### Rate Limit Response

```typescript
if (!rateLimitResult.success) {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter: rateLimitResult.reset },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(rateLimitResult.remaining),
      },
    }
  );
}
```

### Fail-Open Design

Rate limiting fails open to maintain availability:

```typescript
try {
  const { success, remaining, reset } = await limiter.limit(identifier);
  return { success, remaining, reset };
} catch (error) {
  // If Redis is unavailable, allow request
  console.warn("Rate limiting unavailable:", error);
  return null;
}
```

---

## CORS Policy

### Dynamic CORS Headers

CORS is dynamically configured based on the request origin:

```typescript
function getCorsHeaders(request: Request): Record<string, string> {
  const shopDomain = getShopDomainFromRequest(request);

  // Restrict to specific shop when possible
  const allowOrigin = shopDomain
    ? `https://${shopDomain}`
    : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
    "Access-Control-Max-Age": "86400",
    ...(shopDomain && { Vary: "Origin" }),
  };
}
```

### Shop Domain Validation

```typescript
const SHOPIFY_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

function isValidShopifyDomain(domain: string): boolean {
  return SHOPIFY_DOMAIN_REGEX.test(domain);
}
```

---

## Security Headers

The application sets security headers via Next.js config:

```javascript
// next.config.mjs
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-XSS-Protection", value: "1; mode=block" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
    {
      source: "/:locale/(dashboard)/:path*",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...",
        },
      ],
    },
  ];
}
```

---

## Secret Management

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SHOPIFY_API_KEY` | Shopify app API key | Yes |
| `SHOPIFY_API_SECRET` | Shopify app secret | Yes |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook signature verification | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_KEY` | Supabase service role key | Yes |
| `UPSTASH_REDIS_REST_URL` | Redis URL for rate limiting | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Redis token | Yes |

### Best Practices

1. **Never commit secrets** - Use environment variables only
2. **Rotate secrets regularly** - Especially after team changes
3. **Use different secrets per environment** - Dev, staging, production
4. **Limit access** - Only deployment systems should have production secrets
5. **Audit access** - Log who accesses what secrets

---

## GDPR Compliance

### Data Subject Rights

The app supports GDPR data subject rights via webhooks:

| Webhook | Purpose | Implementation |
|---------|---------|----------------|
| `customers/data_request` | Export customer data | `/api/webhooks/shopify/gdpr` |
| `customers/redact` | Delete customer data | `/api/webhooks/shopify/gdpr` |
| `shop/redact` | Delete all shop data | `/api/webhooks/shopify/gdpr` |

### Data Minimization

- Only collect data necessary for A/B testing
- Visitor IDs are anonymous (no PII)
- No customer personal data stored
- Order data limited to ID and revenue

### Consent

A/B test tracking requires no additional consent as:
- Tests are business operations (legitimate interest)
- No personal data is collected
- Visitors are not identified

---

## Security Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] SHOPIFY_WEBHOOK_SECRET is set
- [ ] Database RLS policies enabled
- [ ] Rate limiting configured
- [ ] HTTPS enforced
- [ ] Security headers configured

### Ongoing

- [ ] Monitor rate limiting metrics
- [ ] Review access logs regularly
- [ ] Update dependencies monthly
- [ ] Rotate secrets quarterly
- [ ] Test webhook signature verification
- [ ] Audit database access patterns

### Incident Response

1. **Detection** - Monitor logs and alerts
2. **Containment** - Revoke compromised credentials
3. **Investigation** - Analyze logs and impact
4. **Remediation** - Fix vulnerability
5. **Communication** - Notify affected merchants
6. **Review** - Update security practices

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security concerns to the maintainers
3. Provide detailed reproduction steps
4. Allow time for patch before disclosure

We will respond within 48 hours and provide a timeline for fixes.
