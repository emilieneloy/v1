import { createClient } from "@v1/supabase/server";
import { createTestSchema, paginationSchema } from "@v1/lib/schemas";
import { NextResponse } from "next/server";

/**
 * Tests API
 *
 * GET /api/tests - List all tests for the authenticated user
 * POST /api/tests - Create a new test with variants
 */

export async function GET(request: Request) {
  try {
    const supabase = createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse pagination
    const { searchParams } = new URL(request.url);
    const paginationValidation = paginationSchema.safeParse({
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
    });

    const { page, limit } = paginationValidation.success
      ? paginationValidation.data
      : { page: 1, limit: 20 };

    const offset = (page - 1) * limit;

    // Fetch tests with variants
    const { data: tests, error, count } = await supabase
      .from("tests")
      .select(`
        *,
        variants (*)
      `, { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching tests:", error);
      return NextResponse.json(
        { error: "Failed to fetch tests" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: tests,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Tests API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = createTestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, product_ids, variants } = validation.data;

    // Validate variant weights sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      return NextResponse.json(
        { error: "Variant weights must sum to 100" },
        { status: 400 }
      );
    }

    // Create the test
    const { data: test, error: testError } = await supabase
      .from("tests")
      .insert({
        name,
        description: description || null,
        product_ids,
        user_id: user.id,
        status: "draft",
      })
      .select()
      .single();

    if (testError || !test) {
      console.error("Error creating test:", testError);
      return NextResponse.json(
        { error: "Failed to create test" },
        { status: 500 }
      );
    }

    // Create variants
    const variantInserts = variants.map((v) => ({
      test_id: test.id,
      name: v.name,
      weight: v.weight,
      discount_code: v.discount_code || null,
      price_modifier_cents: v.price_modifier_cents || null,
    }));

    const { data: createdVariants, error: variantsError } = await supabase
      .from("variants")
      .insert(variantInserts)
      .select();

    if (variantsError) {
      console.error("Error creating variants:", variantsError);
      // Rollback: delete the test
      await supabase.from("tests").delete().eq("id", test.id);
      return NextResponse.json(
        { error: "Failed to create variants" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        data: {
          ...test,
          variants: createdVariants,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Tests API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
