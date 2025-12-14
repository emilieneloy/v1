import { createClient } from "@v1/supabase/server";
import { updateTestSchema, testIdSchema } from "@v1/lib/schemas";
import { analyzeTest, type VariantStats } from "@v1/lib/stats";
import { NextResponse } from "next/server";

/**
 * Test Detail API
 *
 * GET /api/tests/[id] - Get test details with results
 * PATCH /api/tests/[id] - Update test (status, name, etc.)
 * DELETE /api/tests/[id] - Delete a test
 */

interface Params {
  id: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const validation = testIdSchema.safeParse({ id });

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid test ID" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Fetch test with variants
    const { data: test, error: testError } = await supabase
      .from("tests")
      .select(`
        *,
        variants (*)
      `)
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (testError || !test) {
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404 }
      );
    }

    // Get real-time stats for each variant
    const variants = test.variants as Array<{
      id: string;
      name: string;
      weight: number;
      discount_code: string | null;
      price_modifier_cents: number | null;
    }>;

    const variantStats = await Promise.all(
      variants.map(async (variant) => {
        // Count unique visitors (views)
        const { count: visitors } = await supabase
          .from("events")
          .select("visitor_id", { count: "exact", head: true })
          .eq("variant_id", variant.id)
          .eq("event_type", "view");

        // Count conversions (unique purchasers)
        const { count: conversions } = await supabase
          .from("events")
          .select("visitor_id", { count: "exact", head: true })
          .eq("variant_id", variant.id)
          .eq("event_type", "purchase");

        // Sum revenue
        const { data: revenueData } = await supabase
          .from("events")
          .select("revenue_cents")
          .eq("variant_id", variant.id)
          .eq("event_type", "purchase");

        const revenue = revenueData?.reduce((sum, e) => sum + (e.revenue_cents || 0), 0) || 0;

        return {
          variant_id: variant.id,
          variant_name: variant.name,
          weight: variant.weight,
          discount_code: variant.discount_code,
          price_modifier_cents: variant.price_modifier_cents,
          visitors: visitors || 0,
          conversions: conversions || 0,
          revenue_cents: revenue,
          conversion_rate: visitors ? (conversions || 0) / visitors : 0,
          revenue_per_visitor: visitors ? revenue / visitors : 0,
        };
      })
    );

    // Perform statistical analysis if we have at least 2 variants with data
    let analysis = null;
    if (variantStats.length >= 2) {
      const control = variantStats[0];
      const variant = variantStats[1];

      if (control.visitors > 0 || variant.visitors > 0) {
        const controlStats: VariantStats = {
          visitors: control.visitors,
          conversions: control.conversions,
          revenue_cents: control.revenue_cents,
        };

        const variantStatsData: VariantStats = {
          visitors: variant.visitors,
          conversions: variant.conversions,
          revenue_cents: variant.revenue_cents,
        };

        analysis = analyzeTest(controlStats, variantStatsData);
      }
    }

    return NextResponse.json({
      data: {
        ...test,
        variant_stats: variantStats,
        analysis,
      },
    });
  } catch (error) {
    console.error("Test detail API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const idValidation = testIdSchema.safeParse({ id });

    if (!idValidation.success) {
      return NextResponse.json(
        { error: "Invalid test ID" },
        { status: 400 }
      );
    }

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
    const validation = updateTestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Build update object
    const updates: Record<string, unknown> = {};

    if (validation.data.name) updates.name = validation.data.name;
    if (validation.data.description !== undefined) updates.description = validation.data.description;
    if (validation.data.product_ids) updates.product_ids = validation.data.product_ids;

    // Handle status changes with timestamps
    if (validation.data.status) {
      updates.status = validation.data.status;

      if (validation.data.status === "active") {
        updates.started_at = new Date().toISOString();
      } else if (validation.data.status === "completed" || validation.data.status === "paused") {
        updates.ended_at = new Date().toISOString();
      }
    }

    // Update the test
    const { data: test, error: updateError } = await supabase
      .from("tests")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(`
        *,
        variants (*)
      `)
      .single();

    if (updateError) {
      console.error("Error updating test:", updateError);
      return NextResponse.json(
        { error: "Failed to update test" },
        { status: 500 }
      );
    }

    if (!test) {
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: test });
  } catch (error) {
    console.error("Test update API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const validation = testIdSchema.safeParse({ id });

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid test ID" },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Delete the test (cascades to variants, assignments, events)
    const { error: deleteError } = await supabase
      .from("tests")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting test:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete test" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Test delete API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
