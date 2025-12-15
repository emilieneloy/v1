import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Create chainable mock
const createChainableMock = () => {
  let singleResults: unknown[] = [];
  let singleIndex = 0;

  const mock = {
    _setSingleResults: (results: unknown[]) => {
      singleResults = results;
      singleIndex = 0;
    },
    select: vi.fn(() => mock),
    eq: vi.fn(() => mock),
    single: vi.fn(() => {
      const result = singleResults[singleIndex] || { data: null, error: null };
      singleIndex++;
      return Promise.resolve(result);
    }),
  };
  return mock;
};

let chainableMock = createChainableMock();
let upsertMock = vi.fn(() => ({ error: null }));

vi.mock("@v1/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "events") {
        return { upsert: upsertMock };
      }
      return chainableMock;
    }),
  })),
}));

// Import after mocking
import { POST } from "../webhooks/shopify/route";

describe("Shopify Webhook API", () => {
  const webhookSecret = "test-webhook-secret";

  beforeEach(() => {
    chainableMock = createChainableMock();
    upsertMock = vi.fn(() => ({ error: null }));
    vi.clearAllMocks();
    process.env.SHOPIFY_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.SHOPIFY_WEBHOOK_SECRET = undefined;
  });

  // Helper to create valid HMAC signature
  const createSignature = (body: string): string => {
    const hmac = crypto.createHmac("sha256", webhookSecret);
    return hmac.update(body, "utf8").digest("base64");
  };

  const createRequest = (
    body: object,
    headers: Record<string, string> = {},
  ) => {
    const bodyString = JSON.stringify(body);
    const signature =
      headers["x-shopify-hmac-sha256"] || createSignature(bodyString);

    return new Request("http://localhost/api/webhooks/shopify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-hmac-sha256": signature,
        "x-shopify-topic": "orders/paid",
        ...headers,
      },
      body: bodyString,
    });
  };

  // Valid order matching shopifyOrderWebhookSchema
  const validOrder = {
    id: 123456789,
    total_price: "99.99",
    currency: "USD",
    line_items: [
      { product_id: 111, variant_id: 222, quantity: 1, price: "99.99" },
    ],
    customer: { id: 789 },
    note_attributes: [],
    discount_codes: [],
  };

  describe("HMAC Verification", () => {
    it("returns 401 for invalid signature", async () => {
      const bodyString = JSON.stringify(validOrder);
      const request = new Request("http://localhost/api/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-hmac-sha256": "invalid-signature",
          "x-shopify-topic": "orders/paid",
        },
        body: bodyString,
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Invalid signature");
    });

    it("accepts valid signature", async () => {
      const request = createRequest(validOrder);
      const response = await POST(request);

      expect(response.status).toBe(200);
    });

    it("returns 500 when webhook secret is not configured (fail closed)", async () => {
      process.env.SHOPIFY_WEBHOOK_SECRET = undefined;

      const request = new Request("http://localhost/api/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-topic": "orders/paid",
        },
        body: JSON.stringify(validOrder),
      });

      const response = await POST(request);

      // Should reject with 500 when secret is not configured (security: fail closed)
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Webhook not configured");
    });
  });

  describe("Topic Filtering", () => {
    it("ignores non-orders/paid topics", async () => {
      const bodyString = JSON.stringify(validOrder);
      const signature = createSignature(bodyString);

      const request = new Request("http://localhost/api/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-hmac-sha256": signature,
          "x-shopify-topic": "orders/created",
        },
        body: bodyString,
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe("Ignored topic");
    });
  });

  describe("Note Attributes Attribution", () => {
    it("attributes purchase via note attributes", async () => {
      const orderWithAttribution = {
        ...validOrder,
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      // Test exists and active
      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "active" }, error: null },
      ]);

      const request = createRequest(orderWithAttribution);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.attributed).toBe(true);
    });

    it("attributes purchase for completed test", async () => {
      const orderWithAttribution = {
        ...validOrder,
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      // Test exists and completed
      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "completed" }, error: null },
      ]);

      const request = createRequest(orderWithAttribution);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(true);
    });

    it("does not attribute when test is not active or completed", async () => {
      const orderWithAttribution = {
        ...validOrder,
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      // Test exists but draft
      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "draft" }, error: null },
      ]);

      const request = createRequest(orderWithAttribution);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(false);
    });

    it("does not attribute when missing note attributes", async () => {
      const orderPartialAttribution = {
        ...validOrder,
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          // Missing variant_id and visitor_id
        ],
      };

      const request = createRequest(orderPartialAttribution);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(false);
    });
  });

  describe("Discount Code Fallback Attribution", () => {
    it("attributes purchase via discount code when note attributes missing", async () => {
      const orderWithDiscount = {
        ...validOrder,
        note_attributes: [],
        discount_codes: [
          { code: "ABTEST10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      // Variant lookup succeeds
      chainableMock._setSingleResults([
        {
          data: {
            id: "variant-uuid-456",
            test_id: "test-uuid-123",
            tests: { id: "test-uuid-123", status: "active" },
          },
          error: null,
        },
      ]);

      const request = createRequest(orderWithDiscount);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(true);
    });

    it("ignores discount codes not starting with AB", async () => {
      const orderWithOtherDiscount = {
        ...validOrder,
        discount_codes: [
          { code: "SAVE10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      const request = createRequest(orderWithOtherDiscount);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(false);
    });

    it("skips discount codes for inactive tests", async () => {
      const orderWithDiscount = {
        ...validOrder,
        discount_codes: [
          { code: "ABTEST10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      // Variant lookup succeeds but test is paused
      chainableMock._setSingleResults([
        {
          data: {
            id: "variant-uuid-456",
            test_id: "test-uuid-123",
            tests: { id: "test-uuid-123", status: "paused" },
          },
          error: null,
        },
      ]);

      const request = createRequest(orderWithDiscount);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(false);
    });

    it("does not attribute when variant lookup fails", async () => {
      const orderWithDiscount = {
        ...validOrder,
        discount_codes: [
          { code: "ABTEST10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      // Variant lookup fails (discount code not found in database)
      chainableMock._setSingleResults([
        { data: null, error: { code: "PGRST116", message: "not found" } },
      ]);

      const request = createRequest(orderWithDiscount);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(false);
    });

    it("uses order_id as visitor_id when no customer in order", async () => {
      const orderWithoutCustomer = {
        ...validOrder,
        customer: undefined,
        discount_codes: [
          { code: "ABTEST10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      // Variant lookup succeeds
      chainableMock._setSingleResults([
        {
          data: {
            id: "variant-uuid-456",
            test_id: "test-uuid-123",
            tests: { id: "test-uuid-123", status: "active" },
          },
          error: null,
        },
      ]);

      let capturedData: Record<string, unknown> | null = null;
      upsertMock = vi.fn((data) => {
        capturedData = data;
        return { error: null };
      });

      const request = createRequest(orderWithoutCustomer);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(true);

      // Should use order_${order.id} as visitor_id
      expect(capturedData).not.toBeNull();
      expect(capturedData!.visitor_id).toBe(`order_${validOrder.id}`);
    });

    it("uses customer_id as visitor_id when customer exists", async () => {
      const orderWithCustomer = {
        ...validOrder,
        discount_codes: [
          { code: "ABTEST10", amount: "10.00", type: "fixed_amount" },
        ],
      };

      // Variant lookup succeeds
      chainableMock._setSingleResults([
        {
          data: {
            id: "variant-uuid-456",
            test_id: "test-uuid-123",
            tests: { id: "test-uuid-123", status: "active" },
          },
          error: null,
        },
      ]);

      let capturedData: Record<string, unknown> | null = null;
      upsertMock = vi.fn((data) => {
        capturedData = data;
        return { error: null };
      });

      const request = createRequest(orderWithCustomer);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(capturedData).not.toBeNull();
      expect(capturedData!.visitor_id).toBe(
        `customer_${validOrder.customer.id}`,
      );
    });
  });

  describe("Revenue Calculation", () => {
    it("correctly converts total_price to cents and records all fields", async () => {
      const orderWithAttribution = {
        ...validOrder,
        total_price: "123.45",
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      // Test exists and active
      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "active" }, error: null },
      ]);

      // Capture upsert call
      let capturedData: Record<string, unknown> | null = null;
      upsertMock = vi.fn((data) => {
        capturedData = data;
        return { error: null };
      });

      const request = createRequest(orderWithAttribution);
      await POST(request);

      // Verify all inserted fields
      expect(capturedData).not.toBeNull();
      expect(capturedData).toMatchObject({
        test_id: "test-uuid-123",
        variant_id: "variant-uuid-456",
        visitor_id: "visitor-789",
        event_type: "purchase",
        order_id: orderWithAttribution.id.toString(),
        revenue_cents: 12345,
        product_id: orderWithAttribution.line_items[0].product_id.toString(),
      });
    });

    it("handles orders without line items", async () => {
      const orderNoLineItems = {
        ...validOrder,
        total_price: "50.00",
        line_items: [],
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "active" }, error: null },
      ]);

      let capturedData: Record<string, unknown> | null = null;
      upsertMock = vi.fn((data) => {
        capturedData = data;
        return { error: null };
      });

      const request = createRequest(orderNoLineItems);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(capturedData).not.toBeNull();
      expect(capturedData!.product_id).toBeNull();
      expect(capturedData!.revenue_cents).toBe(5000);
    });
  });

  describe("Error Handling", () => {
    it("returns 400 for invalid payload (missing required fields)", async () => {
      const invalidOrder = {
        id: 123,
        // Missing total_price, currency, line_items
      };

      const request = createRequest(invalidOrder);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid payload");
    });

    it("returns 500 for malformed JSON", async () => {
      const signature = createSignature("not valid json");

      const request = new Request("http://localhost/api/webhooks/shopify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-shopify-hmac-sha256": signature,
          "x-shopify-topic": "orders/paid",
        },
        body: "not valid json",
      });

      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Internal server error");
    });

    it("handles database insert error gracefully", async () => {
      const orderWithAttribution = {
        ...validOrder,
        note_attributes: [
          { name: "ab_test_id", value: "test-uuid-123" },
          { name: "ab_variant_id", value: "variant-uuid-456" },
          { name: "ab_visitor_id", value: "visitor-789" },
        ],
      };

      // Test exists and active
      chainableMock._setSingleResults([
        { data: { id: "test-uuid-123", status: "active" }, error: null },
      ]);

      // Upsert fails
      upsertMock = vi.fn(() => ({
        error: { code: "ERROR", message: "database error" },
      }));

      const request = createRequest(orderWithAttribution);
      const response = await POST(request);

      // Still returns success (webhook should not fail even if event upsert fails)
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.attributed).toBe(true);
    });
  });

  describe("No Attribution", () => {
    it("returns attributed: false when no AB test data found", async () => {
      const request = createRequest(validOrder);
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.attributed).toBe(false);
    });
  });
});

describe("HMAC Verification Function", () => {
  it("produces correct SHA256 HMAC signature", () => {
    const secret = "my-secret";
    const body = '{"test":"data"}';

    const hmac = crypto.createHmac("sha256", secret);
    const signature = hmac.update(body, "utf8").digest("base64");

    // Verify it's a valid base64 string
    expect(Buffer.from(signature, "base64").toString("base64")).toBe(signature);

    // Verify it matches expected behavior
    const verifyHmac = crypto.createHmac("sha256", secret);
    const verifySignature = verifyHmac.update(body, "utf8").digest("base64");

    expect(signature).toBe(verifySignature);
  });

  it("produces different signatures for different bodies", () => {
    const secret = "my-secret";

    const hmac1 = crypto.createHmac("sha256", secret);
    const sig1 = hmac1.update('{"a":1}', "utf8").digest("base64");

    const hmac2 = crypto.createHmac("sha256", secret);
    const sig2 = hmac2.update('{"b":2}', "utf8").digest("base64");

    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different secrets", () => {
    const body = '{"test":"data"}';

    const hmac1 = crypto.createHmac("sha256", "secret1");
    const sig1 = hmac1.update(body, "utf8").digest("base64");

    const hmac2 = crypto.createHmac("sha256", "secret2");
    const sig2 = hmac2.update(body, "utf8").digest("base64");

    expect(sig1).not.toBe(sig2);
  });
});
