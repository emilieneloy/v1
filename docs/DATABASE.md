# Database Documentation

This document describes the database schema, relationships, and best practices for the Shopify A/B Testing application.

## Table of Contents

1. [Overview](#overview)
2. [Entity Relationship Diagram](#entity-relationship-diagram)
3. [Table Schemas](#table-schemas)
4. [Indexes](#indexes)
5. [Row Level Security](#row-level-security)
6. [Materialized Views](#materialized-views)
7. [Data Retention](#data-retention)
8. [Backup & Recovery](#backup--recovery)
9. [Performance Optimization](#performance-optimization)
10. [Migration Guide](#migration-guide)

---

## Overview

The database uses Supabase (PostgreSQL) with the following design principles:

- **Shop isolation** - Each shop's data is completely isolated via RLS
- **Event sourcing** - Events are append-only for audit trail
- **Denormalization** - Statistics are pre-computed for performance
- **Soft deletes** - Tests are archived, not deleted

---

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│     tests       │       │    variants     │
├─────────────────┤       ├─────────────────┤
│ id (PK)         │───┬───│ id (PK)         │
│ shop            │   │   │ test_id (FK)    │───┐
│ name            │   │   │ name            │   │
│ status          │   │   │ weight          │   │
│ product_ids[]   │   │   │ discount_code   │   │
│ created_at      │   │   │ price_modifier  │   │
│ updated_at      │   │   │ created_at      │   │
│ started_at      │   │   └─────────────────┘   │
│ ended_at        │   │                         │
└─────────────────┘   │                         │
                      │                         │
┌─────────────────┐   │   ┌─────────────────┐   │
│  assignments    │   │   │     events      │   │
├─────────────────┤   │   ├─────────────────┤   │
│ id (PK)         │   │   │ id (PK)         │   │
│ test_id (FK)    │───┘   │ test_id (FK)    │───┤
│ variant_id (FK) │───────│ variant_id (FK) │───┘
│ visitor_id      │       │ visitor_id      │
│ created_at      │       │ event_type      │
│ UNIQUE(test,    │       │ product_id      │
│   visitor)      │       │ order_id (UNIQ) │
└─────────────────┘       │ revenue_cents   │
                          │ created_at      │
                          └─────────────────┘
```

---

## Table Schemas

### tests

Stores A/B test configurations.

```sql
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Comments
COMMENT ON TABLE tests IS 'A/B test configurations';
COMMENT ON COLUMN tests.shop IS 'Shopify store domain (e.g., store.myshopify.com)';
COMMENT ON COLUMN tests.status IS 'Test lifecycle status';
COMMENT ON COLUMN tests.product_ids IS 'Shopify product IDs included in test';
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `shop` | TEXT | Shopify shop domain |
| `name` | TEXT | Human-readable test name |
| `status` | TEXT | Test status (draft/active/paused/completed/archived) |
| `product_ids` | TEXT[] | Array of Shopify product IDs |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `started_at` | TIMESTAMPTZ | When test was started |
| `ended_at` | TIMESTAMPTZ | When test was completed |

### variants

Test variants with pricing/discount configuration.

```sql
CREATE TABLE variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 50
    CHECK (weight >= 0 AND weight <= 100),
  discount_code TEXT,
  price_modifier_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE variants IS 'A/B test variant configurations';
COMMENT ON COLUMN variants.weight IS 'Traffic allocation weight (0-100)';
COMMENT ON COLUMN variants.discount_code IS 'Shopify discount code for this variant';
COMMENT ON COLUMN variants.price_modifier_cents IS 'Price adjustment in cents (negative = discount)';
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `test_id` | UUID | Foreign key to tests |
| `name` | TEXT | Variant name (e.g., "Control", "10% Off") |
| `weight` | INTEGER | Traffic allocation percentage (0-100) |
| `discount_code` | TEXT | Shopify discount code (optional) |
| `price_modifier_cents` | INTEGER | Price change in cents |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### assignments

Visitor-to-variant assignments for test consistency.

```sql
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(test_id, visitor_id)
);

COMMENT ON TABLE assignments IS 'Visitor bucketing assignments';
COMMENT ON COLUMN assignments.visitor_id IS 'Anonymous visitor identifier';
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `test_id` | UUID | Foreign key to tests |
| `variant_id` | UUID | Foreign key to variants |
| `visitor_id` | TEXT | Anonymous visitor ID |
| `created_at` | TIMESTAMPTZ | Assignment timestamp |

**Constraints:**
- `UNIQUE(test_id, visitor_id)` - Each visitor assigned once per test

### events

Tracking events for analytics (views, cart adds, purchases).

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('view', 'add_to_cart', 'purchase')),
  product_id TEXT,
  order_id TEXT UNIQUE,
  revenue_cents INTEGER
    CHECK (revenue_cents IS NULL OR revenue_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE events IS 'A/B test tracking events';
COMMENT ON COLUMN events.event_type IS 'Event type: view, add_to_cart, purchase';
COMMENT ON COLUMN events.order_id IS 'Shopify order ID (unique, for purchase events)';
COMMENT ON COLUMN events.revenue_cents IS 'Order revenue in cents (for purchases)';
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `test_id` | UUID | Foreign key to tests |
| `variant_id` | UUID | Foreign key to variants |
| `visitor_id` | TEXT | Anonymous visitor ID |
| `event_type` | TEXT | Event type (view/add_to_cart/purchase) |
| `product_id` | TEXT | Shopify product ID (optional) |
| `order_id` | TEXT | Shopify order ID (unique, for purchases) |
| `revenue_cents` | INTEGER | Purchase revenue in cents |
| `created_at` | TIMESTAMPTZ | Event timestamp |

**Constraints:**
- `UNIQUE(order_id)` - Prevents duplicate purchase tracking

---

## Indexes

### Primary Indexes

```sql
-- Lookup tests by shop and status (dashboard listing)
CREATE INDEX idx_tests_shop_status ON tests(shop, status);

-- Assignment lookup (bucketing API - critical path)
CREATE INDEX idx_assignments_test_visitor ON assignments(test_id, visitor_id);

-- Events by test and type (statistics queries)
CREATE INDEX idx_events_test_type ON events(test_id, event_type);

-- Order lookup for idempotency
CREATE INDEX idx_events_order_id ON events(order_id)
  WHERE order_id IS NOT NULL;

-- Variants by test (join optimization)
CREATE INDEX idx_variants_test_id ON variants(test_id);

-- Events by variant (statistics aggregation)
CREATE INDEX idx_events_variant_id ON events(variant_id);
```

### Index Strategy

| Query Pattern | Index | Notes |
|---------------|-------|-------|
| Get shop's tests | `idx_tests_shop_status` | Covers dashboard listing |
| Bucket visitor | `idx_assignments_test_visitor` | Critical path, must be fast |
| Count events | `idx_events_test_type` | Statistics aggregation |
| Check order exists | `idx_events_order_id` | Partial index, only purchases |
| Join variants | `idx_variants_test_id` | Foreign key optimization |

---

## Row Level Security

### Policy Design

All tables have RLS enabled with shop-based isolation:

```sql
-- Enable RLS
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
```

### Tests Policy

```sql
-- Merchants can only see their own tests
CREATE POLICY "tests_shop_isolation" ON tests
  FOR ALL
  USING (shop = current_setting('app.current_shop', true));

-- Service role bypasses RLS for webhooks
CREATE POLICY "tests_service_role" ON tests
  FOR ALL
  TO service_role
  USING (true);
```

### Variants Policy

```sql
-- Variants inherit access from parent test
CREATE POLICY "variants_via_test" ON variants
  FOR ALL
  USING (
    test_id IN (
      SELECT id FROM tests
      WHERE shop = current_setting('app.current_shop', true)
    )
  );
```

### Events Policy

```sql
-- Events are read-only via dashboard
CREATE POLICY "events_read_own" ON events
  FOR SELECT
  USING (
    test_id IN (
      SELECT id FROM tests
      WHERE shop = current_setting('app.current_shop', true)
    )
  );

-- Insert allowed via API (service role)
CREATE POLICY "events_insert_service" ON events
  FOR INSERT
  TO service_role
  WITH CHECK (true);
```

### Setting Shop Context

```typescript
// Set shop context for RLS
async function setShopContext(supabase: SupabaseClient, shop: string) {
  await supabase.rpc('set_shop_context', { shop });
}

// Or via session config
const { data, error } = await supabase.auth.setSession({
  access_token: token,
  refresh_token: refresh,
});
```

---

## Materialized Views

### Test Statistics View

Pre-computed statistics for dashboard performance:

```sql
CREATE MATERIALIZED VIEW test_statistics AS
SELECT
  t.id AS test_id,
  t.shop,
  v.id AS variant_id,
  v.name AS variant_name,
  COUNT(DISTINCT a.visitor_id) AS visitors,
  COUNT(DISTINCT e.id) FILTER (WHERE e.event_type = 'view') AS views,
  COUNT(DISTINCT e.id) FILTER (WHERE e.event_type = 'add_to_cart') AS cart_adds,
  COUNT(DISTINCT e.id) FILTER (WHERE e.event_type = 'purchase') AS purchases,
  COALESCE(SUM(e.revenue_cents) FILTER (WHERE e.event_type = 'purchase'), 0) AS revenue_cents,
  COUNT(DISTINCT e.order_id) AS unique_orders
FROM tests t
JOIN variants v ON v.test_id = t.id
LEFT JOIN assignments a ON a.variant_id = v.id
LEFT JOIN events e ON e.variant_id = v.id
GROUP BY t.id, t.shop, v.id, v.name;

-- Index for fast lookups
CREATE UNIQUE INDEX idx_test_statistics_variant
  ON test_statistics(test_id, variant_id);
```

### Refresh Strategy

```sql
-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY test_statistics;

-- Scheduled refresh (via pg_cron)
SELECT cron.schedule('refresh-stats', '*/5 * * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY test_statistics'
);
```

### Application Usage

```typescript
// Use materialized view for dashboard
const { data: stats } = await supabase
  .from('test_statistics')
  .select('*')
  .eq('test_id', testId);

// Refresh after significant events
await supabase.rpc('refresh_test_stats', { test_id: testId });
```

---

## Data Retention

### Retention Policies

| Data Type | Retention | Cleanup Method |
|-----------|-----------|----------------|
| Tests | Indefinite | Manual archive |
| Variants | With test | Cascade delete |
| Assignments | 90 days | Scheduled job |
| Events | 90 days | Scheduled job |
| Statistics | Real-time | Materialized view |

### Cleanup Job

```sql
-- Delete old assignments (90 days)
DELETE FROM assignments
WHERE created_at < NOW() - INTERVAL '90 days'
  AND test_id IN (
    SELECT id FROM tests WHERE status IN ('completed', 'archived')
  );

-- Delete old events (90 days)
DELETE FROM events
WHERE created_at < NOW() - INTERVAL '90 days'
  AND test_id IN (
    SELECT id FROM tests WHERE status IN ('completed', 'archived')
  );
```

### Scheduling Cleanup

```sql
-- Using pg_cron
SELECT cron.schedule('cleanup-old-data', '0 3 * * *', $$
  DELETE FROM assignments
  WHERE created_at < NOW() - INTERVAL '90 days';

  DELETE FROM events
  WHERE created_at < NOW() - INTERVAL '90 days';

  VACUUM ANALYZE assignments;
  VACUUM ANALYZE events;
$$);
```

---

## Backup & Recovery

### Supabase Backups

Supabase provides automatic daily backups:
- Point-in-time recovery (PITR) available
- 7-day retention on Pro plan
- 30-day retention on Team plan

### Manual Backup

```bash
# Export via pg_dump
pg_dump $DATABASE_URL --format=custom --file=backup.dump

# Export specific tables
pg_dump $DATABASE_URL --table=tests --table=variants --file=tests_backup.sql
```

### Recovery

```bash
# Restore from dump
pg_restore --dbname=$DATABASE_URL backup.dump

# Point-in-time recovery (via Supabase dashboard)
# Restore to specific timestamp
```

### Disaster Recovery Checklist

1. **Daily:** Verify automatic backups complete
2. **Weekly:** Test restore process in staging
3. **Monthly:** Full disaster recovery drill
4. **Quarterly:** Review retention policies

---

## Performance Optimization

### Query Patterns

#### Fast Path: Visitor Bucketing

```sql
-- Uses idx_assignments_test_visitor
SELECT variant_id
FROM assignments
WHERE test_id = $1 AND visitor_id = $2;
```

Expected: < 5ms

#### Dashboard: Test Statistics

```sql
-- Uses materialized view
SELECT * FROM test_statistics WHERE test_id = $1;
```

Expected: < 10ms

#### Heavy: Historical Analysis

```sql
-- Use EXPLAIN ANALYZE for optimization
EXPLAIN ANALYZE
SELECT DATE(created_at), event_type, COUNT(*)
FROM events
WHERE test_id = $1
GROUP BY DATE(created_at), event_type
ORDER BY DATE(created_at);
```

### Connection Pooling

Supabase uses PgBouncer for connection pooling:

```typescript
// Use connection pooler for high throughput
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-connection-mode': 'transaction', // Use transaction pooling
      },
    },
  }
);
```

### Vacuum Strategy

```sql
-- Configure autovacuum for high-traffic tables
ALTER TABLE events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.025
);

ALTER TABLE assignments SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);
```

---

## Migration Guide

### Running Migrations

```bash
# Create new migration
supabase migration new add_feature_x

# Apply migrations
supabase db push

# Check migration status
supabase migration list
```

### Migration Best Practices

1. **Always backup before migration**
2. **Test in staging first**
3. **Use transactions for safety**
4. **Add indexes CONCURRENTLY in production**
5. **Monitor query performance after changes**

### Example Migration

```sql
-- migrations/20240115_add_test_description.sql

-- Add description column
ALTER TABLE tests
ADD COLUMN description TEXT;

-- Backfill with default
UPDATE tests SET description = '' WHERE description IS NULL;

-- Add NOT NULL constraint
ALTER TABLE tests
ALTER COLUMN description SET NOT NULL,
ALTER COLUMN description SET DEFAULT '';

-- Add index if needed for search
CREATE INDEX CONCURRENTLY idx_tests_description_search
ON tests USING gin(to_tsvector('english', description));
```

### Rollback Example

```sql
-- migrations/20240115_add_test_description_rollback.sql

-- Remove index
DROP INDEX IF EXISTS idx_tests_description_search;

-- Remove column
ALTER TABLE tests DROP COLUMN IF EXISTS description;
```
