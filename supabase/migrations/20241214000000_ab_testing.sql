-- A/B Testing Schema for Shopify Price Testing
-- Migration: 20241214000000_ab_testing.sql

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Update users table to add Shopify fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_store TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shopify_access_token TEXT;

-- Tests configuration
CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  product_ids TEXT[],
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

-- Variants per test
CREATE TABLE IF NOT EXISTS variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight INTEGER DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  discount_code TEXT,
  price_modifier_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Visitor bucket assignments (persistent)
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(test_id, visitor_id)
);

-- Event tracking
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'add_to_cart', 'purchase')),
  product_id TEXT,
  order_id TEXT,
  revenue_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_events_test_variant ON events(test_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_lookup ON assignments(test_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_tests_user ON tests(user_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
CREATE INDEX IF NOT EXISTS idx_variants_test ON variants(test_id);

-- Materialized view for fast stats (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS test_stats AS
SELECT
  t.id AS test_id,
  v.id AS variant_id,
  v.name AS variant_name,
  COUNT(DISTINCT CASE WHEN e.event_type = 'view' THEN e.visitor_id END) AS visitors,
  COUNT(DISTINCT CASE WHEN e.event_type = 'purchase' THEN e.visitor_id END) AS conversions,
  COALESCE(SUM(CASE WHEN e.event_type = 'purchase' THEN e.revenue_cents ELSE 0 END), 0) AS revenue_cents
FROM tests t
JOIN variants v ON v.test_id = t.id
LEFT JOIN events e ON e.variant_id = v.id
GROUP BY t.id, v.id, v.name;

CREATE UNIQUE INDEX IF NOT EXISTS idx_test_stats ON test_stats(test_id, variant_id);

-- Function to refresh stats
CREATE OR REPLACE FUNCTION refresh_test_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY test_stats;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS)
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Policies for tests
CREATE POLICY "Users can view their own tests"
  ON tests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tests"
  ON tests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tests"
  ON tests FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tests"
  ON tests FOR DELETE
  USING (auth.uid() = user_id);

-- Policies for variants (inherit from test ownership)
CREATE POLICY "Users can view variants of their tests"
  ON variants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = variants.test_id AND tests.user_id = auth.uid()
  ));

CREATE POLICY "Users can create variants for their tests"
  ON variants FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = variants.test_id AND tests.user_id = auth.uid()
  ));

CREATE POLICY "Users can update variants of their tests"
  ON variants FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = variants.test_id AND tests.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete variants of their tests"
  ON variants FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = variants.test_id AND tests.user_id = auth.uid()
  ));

-- Assignments and Events need to be accessible by the tracking API (service role)
-- but readable by test owners
CREATE POLICY "Users can view assignments of their tests"
  ON assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = assignments.test_id AND tests.user_id = auth.uid()
  ));

CREATE POLICY "Service can insert assignments"
  ON assignments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view events of their tests"
  ON events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM tests WHERE tests.id = events.test_id AND tests.user_id = auth.uid()
  ));

CREATE POLICY "Service can insert events"
  ON events FOR INSERT
  WITH CHECK (true);
