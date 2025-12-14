-- Migration: Add Shopify Stores Table
-- Run this in your Supabase SQL Editor or via CLI

-- Create shopify_stores table to store connected shops
CREATE TABLE IF NOT EXISTS shopify_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  scope TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add shop column to tests table to associate tests with shops
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tests' AND column_name = 'shop'
  ) THEN
    ALTER TABLE tests ADD COLUMN shop TEXT REFERENCES shopify_stores(shop) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shopify_stores_shop ON shopify_stores(shop);
CREATE INDEX IF NOT EXISTS idx_tests_shop ON tests(shop);

-- Enable Row Level Security
ALTER TABLE shopify_stores ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own connected shops
CREATE POLICY "Users can view own shops" ON shopify_stores
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own shops
CREATE POLICY "Users can insert own shops" ON shopify_stores
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Policy: Users can update their own shops
CREATE POLICY "Users can update own shops" ON shopify_stores
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for webhooks/OAuth)
CREATE POLICY "Service role full access" ON shopify_stores
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Grant permissions
GRANT ALL ON shopify_stores TO authenticated;
GRANT ALL ON shopify_stores TO service_role;
