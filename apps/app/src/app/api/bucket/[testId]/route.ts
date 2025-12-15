import { checkRateLimit, publicApiRatelimit } from "@v1/kv/ratelimit";
import { bucketRequestSchema, corsConfigs, getCorsHeaders } from "@v1/lib";
import { createClient } from "@v1/supabase/server";
import { NextResponse } from "next/server";

/**
 * Visitor Bucketing API
 *
 * GET /api/bucket/[testId]?visitor_id=xxx&product_id=xxx
 *
 * Assigns a visitor to a test variant (or returns existing assignment)
 * Used by the Shopify theme snippet to determine which price to show
 *
 * Rate limit: 100 requests/minute per IP
 */

interface Params {
  testId: string;
}

export async function OPTIONS(request: Request) {
  const corsHeaders = getCorsHeaders(request, corsConfigs.bucket.methods);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  // Generate CORS headers based on request origin
  const corsHeaders = getCorsHeaders(request, corsConfigs.bucket.methods);

  try {
    // Rate limiting by IP address
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResult = await checkRateLimit(
      publicApiRatelimit,
      `bucket:${ip}`,
    );
    if (rateLimitResult && !rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimitResult.reset },
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Retry-After": String(
              Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
            ),
            "X-RateLimit-Remaining": String(rateLimitResult.remaining),
          },
        },
      );
    }

    const { testId } = await params;
    const { searchParams } = new URL(request.url);
    const visitorId = searchParams.get("visitor_id");
    const productId = searchParams.get("product_id");

    // Validate input
    const validation = bucketRequestSchema.safeParse({
      test_id: testId,
      visitor_id: visitorId,
      product_id: productId ?? undefined, // Convert null to undefined for Zod
    });

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient();

    // Check if test exists and is active
    const { data: test, error: testError } = await supabase
      .from("tests")
      .select(`
        id,
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
      .eq("id", testId)
      .single();

    if (testError || !test) {
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    if (test.status !== "active") {
      return NextResponse.json(
        { error: "Test is not active", status: test.status },
        { status: 400, headers: corsHeaders },
      );
    }

    // Check if visitor already has an assignment
    const { data: existingAssignment } = await supabase
      .from("assignments")
      .select(`
        variant_id,
        variants (
          id,
          name,
          discount_code,
          price_modifier_cents
        )
      `)
      .eq("test_id", testId)
      .eq("visitor_id", visitorId!)
      .single();

    if (existingAssignment?.variants) {
      const variant = existingAssignment.variants as {
        id: string;
        name: string;
        discount_code: string | null;
        price_modifier_cents: number | null;
      };
      return NextResponse.json(
        {
          variant_id: variant.id,
          variant_name: variant.name,
          discount_code: variant.discount_code,
          price_modifier_cents: variant.price_modifier_cents,
          is_new_assignment: false,
        },
        { headers: corsHeaders },
      );
    }

    // Assign to a variant based on weights
    const variants = test.variants as Array<{
      id: string;
      name: string;
      weight: number;
      discount_code: string | null;
      price_modifier_cents: number | null;
    }>;

    if (!variants || variants.length === 0) {
      return NextResponse.json(
        { error: "No variants configured for this test" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Weighted random selection
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    let selectedVariant = variants[0];
    for (const variant of variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        selectedVariant = variant;
        break;
      }
    }

    // Create assignment
    const { error: assignmentError } = await supabase
      .from("assignments")
      .insert({
        test_id: testId,
        variant_id: selectedVariant.id,
        visitor_id: visitorId,
      });

    if (assignmentError) {
      // If duplicate key error, fetch existing assignment
      if (assignmentError.code === "23505") {
        const { data: retryAssignment } = await supabase
          .from("assignments")
          .select(`
            variant_id,
            variants (
              id,
              name,
              discount_code,
              price_modifier_cents
            )
          `)
          .eq("test_id", testId)
          .eq("visitor_id", visitorId!)
          .single();

        if (retryAssignment?.variants) {
          const variant = retryAssignment.variants as {
            id: string;
            name: string;
            discount_code: string | null;
            price_modifier_cents: number | null;
          };
          return NextResponse.json(
            {
              variant_id: variant.id,
              variant_name: variant.name,
              discount_code: variant.discount_code,
              price_modifier_cents: variant.price_modifier_cents,
              is_new_assignment: false,
            },
            { headers: corsHeaders },
          );
        }
      }

      console.error("Assignment error:", assignmentError);
      return NextResponse.json(
        { error: "Failed to create assignment" },
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      {
        variant_id: selectedVariant.id,
        variant_name: selectedVariant.name,
        discount_code: selectedVariant.discount_code,
        price_modifier_cents: selectedVariant.price_modifier_cents,
        is_new_assignment: true,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Bucket API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
