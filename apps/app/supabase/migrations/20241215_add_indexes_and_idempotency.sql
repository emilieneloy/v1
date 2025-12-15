-- Migration: Add indexes and idempotency constraints
-- Run this in your Supabase SQL Editor

-- Unique index to prevent duplicate purchase events for the same order
-- This ensures webhook idempotency (if same order webhook is received twice, it's ignored)
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_order_unique
ON events(order_id, event_type)
WHERE order_id IS NOT NULL AND event_type = 'purchase';

-- Composite index for faster active test lookups by shop
CREATE INDEX IF NOT EXISTS idx_tests_shop_status
ON tests(shop, status)
WHERE status = 'active';

-- Index for order_id lookups in events table
CREATE INDEX IF NOT EXISTS idx_events_order_id
ON events(order_id)
WHERE order_id IS NOT NULL;

-- Index for faster event queries by test and event type
CREATE INDEX IF NOT EXISTS idx_events_test_type
ON events(test_id, event_type);

-- Index for visitor assignment lookups
CREATE INDEX IF NOT EXISTS idx_events_visitor_test
ON events(visitor_id, test_id);
