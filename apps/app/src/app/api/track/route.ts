import { checkRateLimit, publicApiRatelimit } from "@v1/kv/ratelimit";
import {
  batchTrackEventsSchema,
  corsConfigs,
  getCorsHeaders,
  trackEventSchema,
} from "@v1/lib";
import { createClient } from "@v1/supabase/server";
import { NextResponse } from "next/server";

/**
 * Event Tracking API
 *
 * POST /api/track
 *
 * Records events (view, add_to_cart, purchase) for A/B test analytics
 * Supports both single event and batch event tracking
 *
 * Rate limit: 100 requests/minute per IP
 * Body size limit: 1MB
 */

// Maximum request body size (1MB)
const MAX_BODY_SIZE = 1024 * 1024;

// Maximum events per batch
const MAX_BATCH_SIZE = 100;

export async function OPTIONS(request: Request) {
  const corsHeaders = getCorsHeaders(request, corsConfigs.track.methods);
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  // Generate CORS headers based on request origin
  const corsHeaders = getCorsHeaders(request, corsConfigs.track.methods);

  try {
    // Check content length before processing
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return NextResponse.json(
        { error: "Request body too large", maxSize: MAX_BODY_SIZE },
        { status: 413, headers: corsHeaders },
      );
    }

    // Rate limiting by IP address
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const rateLimitResult = await checkRateLimit(
      publicApiRatelimit,
      `track:${ip}`,
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

    const body = await request.json();

    // Check if it's a batch request or single event
    const isBatch = Array.isArray(body.events);

    if (isBatch) {
      // Validate batch size before parsing
      if (Array.isArray(body.events) && body.events.length > MAX_BATCH_SIZE) {
        return NextResponse.json(
          { error: "Batch size exceeded", maxBatchSize: MAX_BATCH_SIZE },
          { status: 400, headers: corsHeaders },
        );
      }

      // Batch event tracking
      const validation = batchTrackEventsSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid request", details: validation.error.flatten() },
          { status: 400, headers: corsHeaders },
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
        })),
      );

      if (error) {
        console.error("Batch event insert error:", error);
        return NextResponse.json(
          { error: "Failed to record events" },
          { status: 500, headers: corsHeaders },
        );
      }

      return NextResponse.json(
        { success: true, count: events.length },
        { headers: corsHeaders },
      );
    }

    // Single event tracking
    const validation = trackEventSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.flatten() },
        { status: 400, headers: corsHeaders },
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
        { status: 404, headers: corsHeaders },
      );
    }

    // Only track events for active tests (or recently completed for purchase attribution)
    if (test.status !== "active" && test.status !== "completed") {
      return NextResponse.json(
        { error: "Test is not active", status: test.status },
        { status: 400, headers: corsHeaders },
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
        { status: 400, headers: corsHeaders },
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
        { status: 500, headers: corsHeaders },
      );
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error("Track API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
