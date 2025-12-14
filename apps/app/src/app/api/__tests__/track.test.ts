import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create chainable mock that properly simulates Supabase query chain
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
let insertMock = vi.fn(() => ({ error: null }));
let lastInsertedData: unknown = null;

vi.mock("@v1/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "events") {
        return {
          insert: (data: unknown) => {
            lastInsertedData = data;
            return insertMock();
          },
        };
      }
      return chainableMock;
    }),
  })),
}));

// Import after mocking
import { POST, OPTIONS } from "../track/route";

describe("Track API", () => {
  const validTestId = "550e8400-e29b-41d4-a716-446655440000";
  const validVariantId = "660e8400-e29b-41d4-a716-446655440001";

  beforeEach(() => {
    chainableMock = createChainableMock();
    insertMock = vi.fn(() => ({ error: null }));
    lastInsertedData = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("OPTIONS", () => {
    it("returns CORS headers with 204 status", async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
        "POST, OPTIONS"
      );
    });
  });

  describe("POST - Single Event Input Validation", () => {
    const createRequest = (body: object) => {
      return new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    it("returns 400 for missing test_id", async () => {
      const request = createRequest({
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "view",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("returns 400 for invalid test_id (not UUID)", async () => {
      const request = createRequest({
        test_id: "not-a-uuid",
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "view",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("returns 400 for invalid event type", async () => {
      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "invalid_type",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("returns 400 for empty visitor_id", async () => {
      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "",
        event_type: "view",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("includes CORS headers in error responses", async () => {
      const request = createRequest({
        test_id: "not-a-uuid",
      });
      const response = await POST(request);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("POST - Single Event Test/Variant Verification", () => {
    const createRequest = (body: object) => {
      return new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    const validEvent = {
      test_id: validTestId,
      variant_id: validVariantId,
      visitor_id: "visitor-123",
      event_type: "view",
    };

    it("returns 404 when test not found", async () => {
      chainableMock._setSingleResults([
        { data: null, error: { code: "PGRST116", message: "not found" } },
      ]);

      const request = createRequest(validEvent);
      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Test not found");
    });

    it("returns 400 when test is draft (not active)", async () => {
      chainableMock._setSingleResults([
        { data: { id: validTestId, status: "draft" }, error: null },
      ]);

      const request = createRequest(validEvent);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Test is not active");
      expect(data.status).toBe("draft");
    });

    it("returns 400 when test is paused", async () => {
      chainableMock._setSingleResults([
        { data: { id: validTestId, status: "paused" }, error: null },
      ]);

      const request = createRequest(validEvent);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Test is not active");
    });

    it("allows tracking for completed tests (for purchase attribution)", async () => {
      chainableMock._setSingleResults([
        // Test is completed
        { data: { id: validTestId, status: "completed" }, error: null },
        // Variant belongs to test
        { data: { id: validVariantId }, error: null },
      ]);

      const request = createRequest({
        ...validEvent,
        event_type: "purchase",
        revenue_cents: 5000,
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it("returns 400 when variant does not belong to test", async () => {
      chainableMock._setSingleResults([
        // Test exists and active
        { data: { id: validTestId, status: "active" }, error: null },
        // Variant not found for this test
        { data: null, error: { code: "PGRST116", message: "not found" } },
      ]);

      const request = createRequest(validEvent);
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid variant for this test");
    });
  });

  describe("POST - Single Event Success (Happy Path)", () => {
    const createRequest = (body: object) => {
      return new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    it("successfully records a view event", async () => {
      chainableMock._setSingleResults([
        // Test exists and active
        { data: { id: validTestId, status: "active" }, error: null },
        // Variant belongs to test
        { data: { id: validVariantId }, error: null },
      ]);

      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "view",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify inserted data
      expect(lastInsertedData).toMatchObject({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "view",
      });
    });

    it("successfully records an add_to_cart event with product_id", async () => {
      chainableMock._setSingleResults([
        { data: { id: validTestId, status: "active" }, error: null },
        { data: { id: validVariantId }, error: null },
      ]);

      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "add_to_cart",
        product_id: "product-456",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      expect(lastInsertedData).toMatchObject({
        event_type: "add_to_cart",
        product_id: "product-456",
      });
    });

    it("successfully records a purchase event with revenue", async () => {
      chainableMock._setSingleResults([
        { data: { id: validTestId, status: "active" }, error: null },
        { data: { id: validVariantId }, error: null },
      ]);

      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "purchase",
        order_id: "order-789",
        revenue_cents: 9999,
        product_id: "product-456",
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      expect(lastInsertedData).toMatchObject({
        event_type: "purchase",
        order_id: "order-789",
        revenue_cents: 9999,
        product_id: "product-456",
      });
    });

    it("returns 500 when event insert fails", async () => {
      chainableMock._setSingleResults([
        { data: { id: validTestId, status: "active" }, error: null },
        { data: { id: validVariantId }, error: null },
      ]);

      insertMock = vi.fn(() => ({
        error: { code: "ERROR", message: "database error" },
      }));

      const request = createRequest({
        test_id: validTestId,
        variant_id: validVariantId,
        visitor_id: "visitor-123",
        event_type: "view",
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to record event");
    });
  });

  describe("POST - Batch Events", () => {
    const createRequest = (body: object) => {
      return new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    it("returns 400 for invalid batch data (bad UUID)", async () => {
      const request = createRequest({
        events: [
          {
            test_id: "not-a-uuid",
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "view",
          },
        ],
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("successfully records batch with single event", async () => {
      const request = createRequest({
        events: [
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "view",
          },
        ],
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(1);
    });

    it("successfully records batch with multiple mixed events", async () => {
      const request = createRequest({
        events: [
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "view",
          },
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "add_to_cart",
            product_id: "product-456",
          },
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "purchase",
            order_id: "order-789",
            revenue_cents: 5000,
          },
        ],
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(3);
    });

    it("returns 500 when batch insert fails", async () => {
      insertMock = vi.fn(() => ({
        error: { code: "ERROR", message: "database error" },
      }));

      const request = createRequest({
        events: [
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "view",
          },
        ],
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to record events");
    });

    it("batch events skip test/variant verification (by design)", async () => {
      // Batch events don't verify test/variant to reduce DB calls
      // This is a design choice documented in the API
      const request = createRequest({
        events: [
          {
            test_id: validTestId,
            variant_id: validVariantId,
            visitor_id: "visitor-123",
            event_type: "view",
          },
        ],
      });
      const response = await POST(request);

      // Should succeed without any chainableMock setup
      expect(response.status).toBe(200);
    });
  });

  describe("POST - Error Handling", () => {
    it("returns 500 for malformed JSON", async () => {
      const request = new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Internal server error");
    });

    it("returns 500 for empty body", async () => {
      const request = new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Internal server error");
    });
  });
});
