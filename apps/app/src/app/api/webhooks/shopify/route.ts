import crypto from "node:crypto";
import { shopifyOrderWebhookSchema } from "@v1/lib/schemas";
import { createClient } from "@v1/supabase/server";
import { NextResponse } from "next/server";

/**
 * Shopify Webhook Handler
 *
 * POST /api/webhooks/shopify
 *
 * Handles Shopify order webhooks to attribute purchases to test variants
 * Webhook topic: orders/paid
 */

// Verify Shopify webhook signature
function verifyShopifyWebhook(
  body: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const computedSignature = hmac.update(body, "utf8").digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature),
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-shopify-hmac-sha256");
    const topic = request.headers.get("x-shopify-topic");

    // Verify webhook signature - REQUIRE secret (fail closed for security)
    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "SHOPIFY_WEBHOOK_SECRET not configured - rejecting webhook",
      );
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }
    if (!verifyShopifyWebhook(rawBody, signature, webhookSecret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Only process orders/paid webhooks
    if (topic !== "orders/paid") {
      return NextResponse.json({ success: true, message: "Ignored topic" });
    }

    // Parse and validate the order data
    const body = JSON.parse(rawBody);
    const validation = shopifyOrderWebhookSchema.safeParse(body);

    if (!validation.success) {
      console.error("Invalid webhook payload:", validation.error.flatten());
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const order = validation.data;
    const supabase = createClient();

    // Look for A/B test attribution in multiple places:
    // 1. Note attributes (set by theme snippet)
    // 2. Discount codes (our test discount codes)

    let testId: string | null = null;
    let variantId: string | null = null;
    let visitorId: string | null = null;

    // Check note attributes for A/B test info
    if (order.note_attributes) {
      for (const attr of order.note_attributes) {
        if (attr.name === "ab_test_id") testId = attr.value;
        if (attr.name === "ab_variant_id") variantId = attr.value;
        if (attr.name === "ab_visitor_id") visitorId = attr.value;
      }
    }

    // If we have test attribution from note attributes
    if (testId && variantId && visitorId) {
      // Verify the test exists
      const { data: test, error: testError } = await supabase
        .from("tests")
        .select("id, status")
        .eq("id", testId)
        .single();

      if (
        !testError &&
        test &&
        (test.status === "active" || test.status === "completed")
      ) {
        // Calculate order revenue in cents
        const revenueCents = Math.round(
          Number.parseFloat(order.total_price) * 100,
        );

        // Record purchase event (use upsert for idempotency - prevents duplicate orders)
        const { error: eventError } = await supabase.from("events").upsert(
          {
            test_id: testId,
            variant_id: variantId,
            visitor_id: visitorId,
            event_type: "purchase",
            order_id: order.id.toString(),
            revenue_cents: revenueCents,
            product_id: order.line_items[0]?.product_id?.toString() || null,
          },
          { onConflict: "order_id,event_type", ignoreDuplicates: true },
        );

        if (eventError) {
          console.error("Failed to record purchase event:", eventError);
        } else {
          console.log(
            `Recorded purchase for test ${testId}, variant ${variantId}`,
          );
        }

        return NextResponse.json({ success: true, attributed: true });
      }
    }

    // Fallback: Look for A/B test discount codes
    if (order.discount_codes && order.discount_codes.length > 0) {
      for (const discountCode of order.discount_codes) {
        // Our discount codes follow pattern: AB{testId}{variantName}
        if (discountCode.code.startsWith("AB")) {
          // Find variant by discount code
          const { data: variant, error: variantError } = await supabase
            .from("variants")
            .select(`
              id,
              test_id,
              tests (
                id,
                status
              )
            `)
            .eq("discount_code", discountCode.code)
            .single();

          if (!variantError && variant && variant.tests) {
            const test = variant.tests as { id: string; status: string };

            if (test.status === "active" || test.status === "completed") {
              // We don't have the visitor_id from discount code path
              // Generate a pseudo visitor ID from customer or order
              const pseudoVisitorId = order.customer?.id
                ? `customer_${order.customer.id}`
                : `order_${order.id}`;

              const revenueCents = Math.round(
                Number.parseFloat(order.total_price) * 100,
              );

              // Use upsert for idempotency - prevents duplicate orders
              const { error: eventError } = await supabase
                .from("events")
                .upsert(
                  {
                    test_id: test.id,
                    variant_id: variant.id,
                    visitor_id: pseudoVisitorId,
                    event_type: "purchase",
                    order_id: order.id.toString(),
                    revenue_cents: revenueCents,
                    product_id:
                      order.line_items[0]?.product_id?.toString() || null,
                  },
                  { onConflict: "order_id,event_type", ignoreDuplicates: true },
                );

              if (eventError) {
                console.error(
                  "Failed to record purchase event (discount):",
                  eventError,
                );
              } else {
                console.log(
                  `Recorded purchase via discount code for test ${test.id}`,
                );
              }

              return NextResponse.json({ success: true, attributed: true });
            }
          }
        }
      }
    }

    // No A/B test attribution found
    return NextResponse.json({ success: true, attributed: false });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
