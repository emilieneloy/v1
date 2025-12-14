import { createClient } from "@v1/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get Active Test for Shop
 *
 * GET /api/tests/active?shop=store.myshopify.com
 *
 * Returns the currently active test for the given shop.
 * Used by the storefront script to initialize A/B testing.
 */

// CORS headers for cross-origin requests from Shopify storefront
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json(
      { error: "Missing shop parameter" },
      { status: 400, headers: corsHeaders }
    );
  }

  const supabase = createClient();

  // Find active test for this shop
  const { data: test, error } = await supabase
    .from("tests")
    .select(`
      id,
      name,
      status,
      product_ids,
      variants (
        id,
        name,
        weight,
        discount_code,
        price_modifier_cents
      )
    `)
    .eq("shop", shop)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !test) {
    // No active test found - this is not an error, just return null
    return NextResponse.json(
      { id: null, message: "No active test for this shop" },
      { headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      id: test.id,
      name: test.name,
      product_ids: test.product_ids,
      variants: test.variants,
    },
    { headers: corsHeaders }
  );
}
