import { createClient } from "@v1/supabase/server";
import { trackEventSchema, batchTrackEventsSchema } from "@v1/lib/schemas";
import { NextResponse } from "next/server";

/**
 * Event Tracking API
 *
 * POST /api/track
 *
 * Records events (view, add_to_cart, purchase) for A/B test analytics
 * Supports both single event and batch event tracking
 */

// CORS headers for cross-origin requests from Shopify storefront
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Check if it's a batch request or single event
    const isBatch = Array.isArray(body.events);

    if (isBatch) {
      // Batch event tracking
      const validation = batchTrackEventsSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid request", details: validation.error.flatten() },
          { status: 400, headers: corsHeaders }
        );
      }

      const supabase = createClient();
      const events = validation.data.events;

      // Insert all events
      const { error } = await supabase.from("events").insert(
        events.map((event) => ({
          test_id: event.test_id,
          variant_id: event.variant_id,
          visitor_id: event.visitor_id,
          event_type: event.event_type,
          product_id: event.product_id || null,
          order_id: event.order_id || null,
          revenue_cents: event.revenue_cents || null,
        }))
      );

      if (error) {
        console.error("Batch event insert error:", error);
        return NextResponse.json(
          { error: "Failed to record events" },
          { status: 500, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { success: true, count: events.length },
        { headers: corsHeaders }
      );
    }

    // Single event tracking
    const validation = trackEventSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const event = validation.data;
    const supabase = createClient();

    // Verify the test exists
    const { data: test, error: testError } = await supabase
      .from("tests")
      .select("id, status")
      .eq("id", event.test_id)
      .single();

    if (testError || !test) {
      return NextResponse.json(
        { error: "Test not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Only track events for active tests (or recently completed for purchase attribution)
    if (test.status !== "active" && test.status !== "completed") {
      return NextResponse.json(
        { error: "Test is not active", status: test.status },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the variant belongs to this test
    const { data: variant, error: variantError } = await supabase
      .from("variants")
      .select("id")
      .eq("id", event.variant_id)
      .eq("test_id", event.test_id)
      .single();

    if (variantError || !variant) {
      return NextResponse.json(
        { error: "Invalid variant for this test" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Insert the event
    const { error: insertError } = await supabase.from("events").insert({
      test_id: event.test_id,
      variant_id: event.variant_id,
      visitor_id: event.visitor_id,
      event_type: event.event_type,
      product_id: event.product_id || null,
      order_id: event.order_id || null,
      revenue_cents: event.revenue_cents || null,
    });

    if (insertError) {
      console.error("Event insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to record event" },
        { status: 500, headers: corsHeaders }
      );
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("Track API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
