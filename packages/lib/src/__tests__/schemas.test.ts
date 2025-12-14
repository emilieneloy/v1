import { describe, it, expect } from "vitest";
import {
  testStatusSchema,
  createTestSchema,
  updateTestSchema,
  testIdSchema,
  createVariantSchema,
  updateVariantSchema,
  bucketRequestSchema,
  bucketResponseSchema,
  eventTypeSchema,
  trackEventSchema,
  batchTrackEventsSchema,
  shopifyOrderWebhookSchema,
  apiErrorSchema,
  paginationSchema,
  testResultsSchema,
} from "../schemas";

describe("testStatusSchema", () => {
  it("accepts valid statuses", () => {
    expect(testStatusSchema.parse("draft")).toBe("draft");
    expect(testStatusSchema.parse("active")).toBe("active");
    expect(testStatusSchema.parse("paused")).toBe("paused");
    expect(testStatusSchema.parse("completed")).toBe("completed");
  });

  it("rejects invalid status", () => {
    expect(() => testStatusSchema.parse("invalid")).toThrow();
    expect(() => testStatusSchema.parse("")).toThrow();
    expect(() => testStatusSchema.parse(123)).toThrow();
  });
});

describe("createTestSchema", () => {
  it("validates a complete valid test", () => {
    const validTest = {
      name: "Holiday Price Test",
      description: "Testing holiday pricing",
      product_ids: ["123", "456"],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant B", weight: 50 },
      ],
    };

    const result = createTestSchema.parse(validTest);
    expect(result.name).toBe("Holiday Price Test");
    expect(result.variants).toHaveLength(2);
  });

  it("accepts test without description", () => {
    const validTest = {
      name: "Test Name",
      product_ids: ["123"],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant", weight: 50 },
      ],
    };

    const result = createTestSchema.parse(validTest);
    expect(result.description).toBeUndefined();
  });

  it("rejects empty name", () => {
    const invalidTest = {
      name: "",
      product_ids: ["123"],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant", weight: 50 },
      ],
    };

    expect(() => createTestSchema.parse(invalidTest)).toThrow();
  });

  it("rejects name longer than 100 chars", () => {
    const invalidTest = {
      name: "a".repeat(101),
      product_ids: ["123"],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant", weight: 50 },
      ],
    };

    expect(() => createTestSchema.parse(invalidTest)).toThrow();
  });

  it("rejects empty product_ids array", () => {
    const invalidTest = {
      name: "Test",
      product_ids: [],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant", weight: 50 },
      ],
    };

    expect(() => createTestSchema.parse(invalidTest)).toThrow();
  });

  it("rejects single variant", () => {
    const invalidTest = {
      name: "Test",
      product_ids: ["123"],
      variants: [{ name: "Control", weight: 100 }],
    };

    expect(() => createTestSchema.parse(invalidTest)).toThrow();
  });

  it("accepts variant with discount_code and price_modifier", () => {
    const validTest = {
      name: "Test",
      product_ids: ["123"],
      variants: [
        { name: "Control", weight: 50 },
        { name: "Variant", weight: 50, discount_code: "SAVE10", price_modifier_cents: -500 },
      ],
    };

    const result = createTestSchema.parse(validTest);
    expect(result.variants[1].discount_code).toBe("SAVE10");
    expect(result.variants[1].price_modifier_cents).toBe(-500);
  });

  it("validates weight ranges", () => {
    const invalidTest = {
      name: "Test",
      product_ids: ["123"],
      variants: [
        { name: "Control", weight: 150 },
        { name: "Variant", weight: 50 },
      ],
    };

    expect(() => createTestSchema.parse(invalidTest)).toThrow();
  });
});

describe("updateTestSchema", () => {
  it("accepts partial updates", () => {
    const update = { name: "New Name" };
    const result = updateTestSchema.parse(update);
    expect(result.name).toBe("New Name");
  });

  it("accepts status update", () => {
    const update = { status: "active" };
    const result = updateTestSchema.parse(update);
    expect(result.status).toBe("active");
  });

  it("accepts empty object", () => {
    const result = updateTestSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid status", () => {
    const update = { status: "invalid" };
    expect(() => updateTestSchema.parse(update)).toThrow();
  });
});

describe("testIdSchema", () => {
  it("accepts valid UUID", () => {
    const validId = { id: "550e8400-e29b-41d4-a716-446655440000" };
    const result = testIdSchema.parse(validId);
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects invalid UUID", () => {
    expect(() => testIdSchema.parse({ id: "not-a-uuid" })).toThrow();
    expect(() => testIdSchema.parse({ id: "" })).toThrow();
    expect(() => testIdSchema.parse({ id: "123" })).toThrow();
  });
});

describe("bucketRequestSchema", () => {
  it("validates complete request", () => {
    const request = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
      product_id: "product_456",
    };

    const result = bucketRequestSchema.parse(request);
    expect(result.test_id).toBeDefined();
    expect(result.visitor_id).toBe("visitor_123");
  });

  it("accepts request without product_id", () => {
    const request = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
    };

    const result = bucketRequestSchema.parse(request);
    expect(result.product_id).toBeUndefined();
  });

  it("rejects empty visitor_id", () => {
    const request = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      visitor_id: "",
    };

    expect(() => bucketRequestSchema.parse(request)).toThrow();
  });
});

describe("bucketResponseSchema", () => {
  it("validates complete response", () => {
    const response = {
      variant_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_name: "Control",
      discount_code: "SAVE10",
      price_modifier_cents: -500,
      is_new_assignment: true,
    };

    const result = bucketResponseSchema.parse(response);
    expect(result.variant_name).toBe("Control");
    expect(result.is_new_assignment).toBe(true);
  });

  it("accepts null values for optional fields", () => {
    const response = {
      variant_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_name: "Control",
      discount_code: null,
      price_modifier_cents: null,
      is_new_assignment: false,
    };

    const result = bucketResponseSchema.parse(response);
    expect(result.discount_code).toBeNull();
    expect(result.price_modifier_cents).toBeNull();
  });
});

describe("eventTypeSchema", () => {
  it("accepts valid event types", () => {
    expect(eventTypeSchema.parse("view")).toBe("view");
    expect(eventTypeSchema.parse("add_to_cart")).toBe("add_to_cart");
    expect(eventTypeSchema.parse("purchase")).toBe("purchase");
  });

  it("rejects invalid event type", () => {
    expect(() => eventTypeSchema.parse("click")).toThrow();
    expect(() => eventTypeSchema.parse("")).toThrow();
  });
});

describe("trackEventSchema", () => {
  it("validates complete event", () => {
    const event = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_id: "660e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
      event_type: "purchase",
      product_id: "product_456",
      order_id: "order_789",
      revenue_cents: 5000,
    };

    const result = trackEventSchema.parse(event);
    expect(result.event_type).toBe("purchase");
    expect(result.revenue_cents).toBe(5000);
  });

  it("accepts minimal event", () => {
    const event = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_id: "660e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
      event_type: "view",
    };

    const result = trackEventSchema.parse(event);
    expect(result.product_id).toBeUndefined();
  });

  it("rejects negative revenue", () => {
    const event = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_id: "660e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
      event_type: "purchase",
      revenue_cents: -100,
    };

    expect(() => trackEventSchema.parse(event)).toThrow();
  });
});

describe("batchTrackEventsSchema", () => {
  it("validates batch of events", () => {
    const batch = {
      events: [
        {
          test_id: "550e8400-e29b-41d4-a716-446655440000",
          variant_id: "660e8400-e29b-41d4-a716-446655440000",
          visitor_id: "visitor_123",
          event_type: "view",
        },
        {
          test_id: "550e8400-e29b-41d4-a716-446655440000",
          variant_id: "660e8400-e29b-41d4-a716-446655440000",
          visitor_id: "visitor_123",
          event_type: "add_to_cart",
        },
      ],
    };

    const result = batchTrackEventsSchema.parse(batch);
    expect(result.events).toHaveLength(2);
  });

  it("rejects more than 100 events", () => {
    const events = Array(101).fill({
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_id: "660e8400-e29b-41d4-a716-446655440000",
      visitor_id: "visitor_123",
      event_type: "view",
    });

    expect(() => batchTrackEventsSchema.parse({ events })).toThrow();
  });
});

describe("shopifyOrderWebhookSchema", () => {
  it("validates typical Shopify order webhook", () => {
    const order = {
      id: 123456789,
      order_number: 1001,
      total_price: "99.99",
      currency: "USD",
      customer: { id: 987654321 },
      line_items: [
        {
          product_id: 111111,
          variant_id: 222222,
          quantity: 2,
          price: "49.99",
        },
      ],
      note_attributes: [
        { name: "ab_test_id", value: "550e8400-e29b-41d4-a716-446655440000" },
        { name: "ab_variant_id", value: "660e8400-e29b-41d4-a716-446655440000" },
      ],
      discount_codes: [{ code: "SAVE10", amount: "10.00", type: "fixed_amount" }],
    };

    const result = shopifyOrderWebhookSchema.parse(order);
    expect(result.id).toBe(123456789);
    expect(result.line_items).toHaveLength(1);
  });

  it("accepts order without note_attributes", () => {
    const order = {
      id: 123456789,
      total_price: "99.99",
      currency: "USD",
      line_items: [
        {
          product_id: 111111,
          variant_id: 222222,
          quantity: 1,
          price: "99.99",
        },
      ],
    };

    const result = shopifyOrderWebhookSchema.parse(order);
    expect(result.note_attributes).toBeUndefined();
  });

  it("accepts order with null product_id in line_items", () => {
    const order = {
      id: 123456789,
      total_price: "99.99",
      currency: "USD",
      line_items: [
        {
          product_id: null,
          variant_id: null,
          quantity: 1,
          price: "99.99",
        },
      ],
    };

    const result = shopifyOrderWebhookSchema.parse(order);
    expect(result.line_items[0].product_id).toBeNull();
  });
});

describe("apiErrorSchema", () => {
  it("validates simple error", () => {
    const error = { error: "Something went wrong" };
    const result = apiErrorSchema.parse(error);
    expect(result.error).toBe("Something went wrong");
  });

  it("validates error with code and details", () => {
    const error = {
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { field: "name", reason: "required" },
    };

    const result = apiErrorSchema.parse(error);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.details).toEqual({ field: "name", reason: "required" });
  });
});

describe("paginationSchema", () => {
  it("applies defaults", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts valid pagination", () => {
    const result = paginationSchema.parse({ page: 5, limit: 50 });
    expect(result.page).toBe(5);
    expect(result.limit).toBe(50);
  });

  it("rejects page less than 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    expect(() => paginationSchema.parse({ page: -1 })).toThrow();
  });

  it("rejects limit greater than 100", () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
  });
});

describe("testResultsSchema", () => {
  it("validates complete test results", () => {
    const results = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_stats: [
        {
          variant_id: "660e8400-e29b-41d4-a716-446655440000",
          variant_name: "Control",
          visitors: 1000,
          conversions: 30,
          revenue_cents: 30000,
          conversion_rate: 0.03,
          revenue_per_visitor: 30,
        },
        {
          variant_id: "770e8400-e29b-41d4-a716-446655440000",
          variant_name: "Variant B",
          visitors: 1000,
          conversions: 40,
          revenue_cents: 40000,
          conversion_rate: 0.04,
          revenue_per_visitor: 40,
        },
      ],
      analysis: {
        winner: "variant",
        recommendation: "Variant shows 33% lift",
        conversion: {
          controlRate: 0.03,
          variantRate: 0.04,
          relativeLift: 33.33,
          pValue: 0.01,
          significant: true,
        },
        revenue: {
          controlRPV: 30,
          variantRPV: 40,
          relativeLift: 33.33,
          pValue: 0.02,
          significant: true,
        },
      },
    };

    const result = testResultsSchema.parse(results);
    expect(result.variant_stats).toHaveLength(2);
    expect(result.analysis?.winner).toBe("variant");
  });

  it("accepts results without analysis", () => {
    const results = {
      test_id: "550e8400-e29b-41d4-a716-446655440000",
      variant_stats: [],
    };

    const result = testResultsSchema.parse(results);
    expect(result.analysis).toBeUndefined();
  });
});
