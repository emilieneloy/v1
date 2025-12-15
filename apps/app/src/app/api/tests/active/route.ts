import { corsConfigs, getCorsHeaders, isValidShopifyDomain } from "@v1/lib";
import { createClient } from "@v1/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Get Active Test for Shop
 *
 * GET /api/tests/active?shop=store.myshopify.com
 *
 * Returns the currently active test for the given shop.
 * Used by the storefront script to initialize A/B testing.
 */

export async function OPTIONS(request: Request) {
  const corsHeaders = getCorsHeaders(request, corsConfigs.testsActive.methods);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  // Generate CORS headers based on request origin
  const corsHeaders = getCorsHeaders(request, corsConfigs.testsActive.methods);

  const shop = request.nextUrl.searchParams.get("shop");

  // Validate shop parameter format using shared validator
  if (!shop || !isValidShopifyDomain(shop)) {
    return NextResponse.json(
      { error: "Invalid or missing shop parameter" },
      { status: 400, headers: corsHeaders },
    );
  }

  // Verify request comes from the shop's storefront via header
  const shopHeader = request.headers.get("x-shopify-shop-domain");
  if (shopHeader && shop !== shopHeader) {
    return NextResponse.json(
      { error: "Shop mismatch" },
      { status: 401, headers: corsHeaders },
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
      { headers: corsHeaders },
    );
  }

  return NextResponse.json(
    {
      id: test.id,
      name: test.name,
      product_ids: test.product_ids,
      variants: test.variants,
    },
    { headers: corsHeaders },
  );
}
