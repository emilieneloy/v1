# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the Shopify A/B Testing application.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Authentication Errors](#authentication-errors)
3. [Webhook Problems](#webhook-problems)
4. [Theme Extension Issues](#theme-extension-issues)
5. [API Errors](#api-errors)
6. [Database Issues](#database-issues)
7. [Statistics Problems](#statistics-problems)
8. [Performance Issues](#performance-issues)
9. [Debug Mode](#debug-mode)
10. [Getting Help](#getting-help)

---

## Installation Issues

### App Won't Install

**Symptoms:**
- Installation fails with "Something went wrong"
- OAuth redirect doesn't complete
- Blank screen after authorization

**Solutions:**

1. **Check App URL configuration:**
   ```
   Partner Dashboard > Apps > Your App > App setup
   - App URL must be HTTPS
   - Redirect URLs must include /api/auth/shopify/callback
   ```

2. **Verify environment variables:**
   ```bash
   # Required for OAuth
   SHOPIFY_API_KEY=your_api_key
   SHOPIFY_API_SECRET=your_api_secret
   ```

3. **Check server logs:**
   ```bash
   vercel logs --follow
   # Look for OAuth errors
   ```

4. **Test redirect URL:**
   ```bash
   curl -I https://your-app.com/api/auth/shopify/callback
   # Should return 400 (no code param), not 404
   ```

### "Invalid API Key" Error

**Cause:** Mismatch between Partner Dashboard and environment.

**Solution:**
```bash
# Compare these values:
echo $SHOPIFY_API_KEY
# Must match: Partner Dashboard > Apps > Client credentials > Client ID
```

---

## Authentication Errors

### "Invalid Signature" on Install

**Error:** `HMAC verification failed`

**Causes:**
1. Wrong API secret
2. URL encoding issues
3. Tampered request

**Solution:**
```typescript
// Debug HMAC verification
const query = new URL(request.url).searchParams;
console.log('Query params:', Object.fromEntries(query));
console.log('HMAC from Shopify:', query.get('hmac'));

// Verify calculation
const params = new URLSearchParams(query);
params.delete('hmac');
params.sort();
console.log('Message to hash:', params.toString());
```

### "Access Token Expired"

**Error:** `401 Unauthorized` on API calls

**Solution:**
1. Tokens don't expire unless revoked
2. Check if app was uninstalled
3. Verify token in database:
   ```sql
   SELECT access_token FROM shops WHERE domain = 'store.myshopify.com';
   ```

### Session Not Found

**Error:** Dashboard shows login screen repeatedly

**Solutions:**
1. Clear browser cookies
2. Check session storage:
   ```typescript
   console.log('Session:', await getSession());
   ```
3. Verify Supabase auth configuration

---

## Webhook Problems

### Webhooks Not Arriving

**Debug Steps:**

1. **Check webhook registration:**
   ```bash
   shopify app webhook list
   # Should show: orders/paid, app/uninstalled
   ```

2. **Verify endpoint accessibility:**
   ```bash
   curl -X POST https://your-app.com/api/webhooks/shopify \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   # Should return 401 (signature required)
   ```

3. **Check Shopify webhook logs:**
   ```
   Partner Dashboard > Apps > Webhooks > Webhook logs
   ```

4. **Test with ngrok (development):**
   ```bash
   ngrok http 3000
   # Update webhook URL in shopify.app.toml
   ```

### "Invalid Webhook Signature"

**Error:** `401 - Invalid webhook signature`

**Solutions:**

1. **Verify secret is set:**
   ```bash
   echo $SHOPIFY_WEBHOOK_SECRET
   # Should not be empty
   ```

2. **Check raw body parsing:**
   ```typescript
   // Webhook handler must use raw body
   export async function POST(request: Request) {
     const rawBody = await request.text(); // Not .json()
     const signature = request.headers.get('x-shopify-hmac-sha256');
     // Verify with raw body
   }
   ```

3. **Regenerate webhook secret:**
   - Partner Dashboard > Apps > Webhook subscriptions
   - Copy new secret to environment

### Duplicate Events

**Error:** Same order processed multiple times

**Solutions:**

1. **Check idempotency:**
   ```sql
   -- Should have unique constraint
   SELECT * FROM events WHERE order_id = 'order-123';
   ```

2. **Verify upsert logic:**
   ```typescript
   // Should use upsert, not insert
   await supabase.from('events').upsert(
     { order_id: orderId, ...data },
     { onConflict: 'order_id' }
   );
   ```

---

## Theme Extension Issues

### Extension Not Showing

**Debug Steps:**

1. **Verify deployment:**
   ```bash
   shopify app deploy --extension-only
   # Check for errors
   ```

2. **Enable app embed:**
   ```
   Store Admin > Online Store > Themes > Customize > App embeds
   Enable "A/B Price Testing"
   ```

3. **Check theme compatibility:**
   - Extension requires Theme 2.0
   - Online Store 2.0 compatible themes only

4. **Inspect browser console:**
   ```javascript
   // Should see script loaded
   console.log('AB Test config:', window.__AB_TEST__);
   ```

### Prices Not Changing

**Debug Steps:**

1. **Check API response:**
   ```javascript
   // Browser console
   fetch('/apps/ab-testing/api/bucket/test-id?visitor_id=xxx')
     .then(r => r.json())
     .then(console.log);
   ```

2. **Verify product is in test:**
   ```sql
   SELECT product_ids FROM tests WHERE id = 'test-id';
   -- Product ID must be in array
   ```

3. **Check visitor assignment:**
   ```sql
   SELECT * FROM assignments
   WHERE test_id = 'test-id'
   AND visitor_id = 'visitor-xxx';
   ```

4. **Verify discount code:**
   ```
   Store Admin > Discounts
   - Code must exist
   - Code must be active
   - Code must apply to product
   ```

### Tracking Events Not Recording

**Debug Steps:**

1. **Check network requests:**
   ```
   Browser DevTools > Network > Filter: "track"
   - Should see POST to /api/track
   - Response should be 200
   ```

2. **Verify CORS:**
   ```javascript
   // Should not see CORS errors
   fetch('https://your-app.com/api/track', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ test_id: 'xxx', variant_id: 'xxx', ... })
   });
   ```

3. **Check event in database:**
   ```sql
   SELECT * FROM events
   WHERE test_id = 'test-id'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

---

## API Errors

### Error Code Reference

| Code | Status | Meaning | Solution |
|------|--------|---------|----------|
| `AUTH_REQUIRED` | 401 | Missing authentication | Add auth header |
| `SHOP_INVALID_DOMAIN` | 400 | Bad shop format | Use store.myshopify.com |
| `TEST_NOT_FOUND` | 404 | Test doesn't exist | Check test ID |
| `TEST_NOT_ACTIVE` | 400 | Test is paused/draft | Activate test |
| `RATE_LIMITED` | 429 | Too many requests | Wait and retry |
| `VALIDATION_FAILED` | 400 | Invalid input | Check request body |

### 400 Bad Request

**Common Causes:**

1. **Invalid UUID:**
   ```json
   // Wrong
   { "test_id": "not-a-uuid" }
   // Right
   { "test_id": "550e8400-e29b-41d4-a716-446655440000" }
   ```

2. **Missing required fields:**
   ```json
   // Missing visitor_id
   { "test_id": "xxx", "variant_id": "xxx", "event_type": "view" }
   // Include all required fields
   { "test_id": "xxx", "variant_id": "xxx", "visitor_id": "xxx", "event_type": "view" }
   ```

3. **Invalid event type:**
   ```json
   // Only: view, add_to_cart, purchase
   { "event_type": "click" } // Invalid
   ```

### 429 Rate Limited

**Error:** `Rate limit exceeded`

**Solutions:**

1. **Check rate limit headers:**
   ```
   X-RateLimit-Remaining: 0
   Retry-After: 45
   ```

2. **Implement exponential backoff:**
   ```javascript
   async function fetchWithRetry(url, options, retries = 3) {
     for (let i = 0; i < retries; i++) {
       const response = await fetch(url, options);
       if (response.status !== 429) return response;

       const retryAfter = response.headers.get('Retry-After') || 60;
       await sleep(retryAfter * 1000);
     }
     throw new Error('Rate limit exceeded');
   }
   ```

3. **Batch events:**
   ```javascript
   // Instead of individual calls
   await Promise.all(events.map(e => trackEvent(e))); // Bad

   // Batch into single request
   await trackEvents({ events: [...events] }); // Good
   ```

### 500 Internal Server Error

**Debug Steps:**

1. **Check server logs:**
   ```bash
   vercel logs --follow
   # Or Sentry dashboard
   ```

2. **Test database connection:**
   ```bash
   curl https://your-app.com/api/health
   # Should return: { "status": "healthy", "database": "connected" }
   ```

3. **Verify environment variables:**
   ```bash
   vercel env ls
   # All required vars should be set
   ```

---

## Database Issues

### Connection Errors

**Error:** `Database connection failed`

**Solutions:**

1. **Check Supabase status:**
   - Visit [status.supabase.com](https://status.supabase.com)

2. **Verify connection string:**
   ```bash
   echo $NEXT_PUBLIC_SUPABASE_URL
   # Should be: https://xxx.supabase.co
   ```

3. **Test connection:**
   ```bash
   curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
   ```

### RLS Errors

**Error:** `new row violates row-level security policy`

**Solutions:**

1. **Check policy exists:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'tests';
   ```

2. **Verify shop context:**
   ```sql
   -- Should return your shop domain
   SELECT current_setting('app.current_shop', true);
   ```

3. **Use service role for admin operations:**
   ```typescript
   // Use service role key for bypassing RLS
   const adminClient = createClient(url, serviceRoleKey);
   ```

### Migration Errors

**Error:** Migration fails to apply

**Solutions:**

1. **Check migration status:**
   ```bash
   supabase migration list
   ```

2. **Review migration file:**
   ```bash
   cat supabase/migrations/xxx_migration_name.sql
   ```

3. **Apply manually if needed:**
   ```bash
   supabase db execute < supabase/migrations/xxx_migration_name.sql
   ```

---

## Statistics Problems

### Wrong Conversion Rate

**Issue:** Conversion rate seems too high or too low

**Debug Steps:**

1. **Check unique visitors:**
   ```sql
   SELECT
     COUNT(*) as total_events,
     COUNT(DISTINCT visitor_id) as unique_visitors
   FROM assignments
   WHERE test_id = 'test-id';
   ```

2. **Verify event deduplication:**
   ```sql
   -- Should not have duplicate order_ids
   SELECT order_id, COUNT(*)
   FROM events
   WHERE event_type = 'purchase'
   GROUP BY order_id
   HAVING COUNT(*) > 1;
   ```

3. **Check date range:**
   ```sql
   SELECT MIN(created_at), MAX(created_at)
   FROM events
   WHERE test_id = 'test-id';
   ```

### Results Not Significant

**Issue:** p-value never reaches significance

**Possible Causes:**

1. **Insufficient sample size:**
   - Use sample size calculator
   - Wait for more traffic

2. **Effect too small:**
   - 5% lift with 2% conversion needs ~77,000 visitors

3. **High variance in data:**
   ```sql
   SELECT
     variant_id,
     STDDEV(revenue_cents) as revenue_stddev
   FROM events
   WHERE event_type = 'purchase'
   GROUP BY variant_id;
   ```

---

## Performance Issues

### Slow API Response

**Debug Steps:**

1. **Check database queries:**
   ```sql
   -- Enable query logging
   ALTER SYSTEM SET log_min_duration_statement = 100;
   ```

2. **Verify indexes exist:**
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename IN ('tests', 'variants', 'assignments', 'events');
   ```

3. **Check Redis connection:**
   ```bash
   curl -X POST "$UPSTASH_REDIS_REST_URL/ping" \
     -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
   ```

### High Memory Usage

**Solutions:**

1. **Check for memory leaks:**
   ```javascript
   // Add to health check
   console.log('Memory:', process.memoryUsage());
   ```

2. **Review event batching:**
   - Limit batch size to 100 events
   - Process large batches in chunks

---

## Debug Mode

### Enable Debug Logging

**Development:**
```bash
# .env.local
DEBUG=true
LOG_LEVEL=debug
```

**Theme Extension:**
```javascript
// Add to ab-test.js
window.__AB_DEBUG__ = true;
```

### Debug API Endpoints

```bash
# Health check
curl https://your-app.com/api/health | jq

# Test bucket API
curl "https://your-app.com/api/bucket/TEST_ID?visitor_id=debug-123" | jq

# Test track API
curl -X POST https://your-app.com/api/track \
  -H "Content-Type: application/json" \
  -d '{"test_id":"xxx","variant_id":"xxx","visitor_id":"debug","event_type":"view"}' | jq
```

### Browser Debug Tools

```javascript
// Console commands for debugging

// Check if script loaded
console.log('AB Test:', window.__AB_TEST__);

// Get current assignment
localStorage.getItem('ab_test_assignment');

// Force new assignment
localStorage.removeItem('ab_test_assignment');
location.reload();

// Track custom event
window.ABTest?.track('view', { product_id: '123' });
```

---

## Getting Help

### Information to Gather

Before requesting help, collect:

1. **Environment details:**
   ```bash
   node --version
   npm --version
   ```

2. **Error messages:**
   - Full error text
   - Stack trace if available
   - Response body

3. **Request details:**
   - Endpoint URL
   - Request headers
   - Request body

4. **Logs:**
   - Server logs
   - Browser console
   - Network requests

### Support Channels

1. **GitHub Issues:**
   - Bug reports
   - Feature requests
   - Documentation issues

2. **Documentation:**
   - Check existing docs first
   - API documentation
   - This troubleshooting guide

### Reporting Bugs

Include in your bug report:

```markdown
## Environment
- Node version: x.x.x
- Deployment: Vercel/Other
- Browser: Chrome x.x

## Steps to Reproduce
1. Go to...
2. Click on...
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Logs/Screenshots
[Attach relevant logs or screenshots]

## Additional Context
Any other relevant information
```
