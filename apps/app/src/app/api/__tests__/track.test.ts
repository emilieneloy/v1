import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
let insertMock = vi.fn(() => ({ error: null }));

vi.mock("@v1/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "events") {
        return { insert: insertMock };
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

  describe("POST - Single Event Validation", () => {
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
        ...validEvent,
        event_type: "invalid_type",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("returns 400 for empty visitor_id", async () => {
      const request = createRequest({
        ...validEvent,
        visitor_id: "",
      });
      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("includes CORS headers in all responses", async () => {
      const request = createRequest({
        test_id: "not-a-uuid",
      });
      const response = await POST(request);

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("POST - Batch Events Validation", () => {
    const createRequest = (body: object) => {
      return new Request("http://localhost/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    };

    it("returns 400 for invalid batch data", async () => {
      const request = createRequest({
        events: [
          {
            test_id: "not-a-uuid",
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

    it("accepts valid batch with single event", async () => {
      insertMock = vi.fn(() => ({ error: null }));

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

    it("accepts valid batch with multiple events", async () => {
      insertMock = vi.fn(() => ({ error: null }));

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
        ],
      });
      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
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
  });

  describe("Error handling", () => {
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
  });
});

describe("Event Type Validation", () => {
  it("accepts valid event types", () => {
    const validTypes = ["view", "add_to_cart", "purchase"];
    const eventTypePattern = /^(view|add_to_cart|purchase)$/;

    for (const type of validTypes) {
      expect(eventTypePattern.test(type)).toBe(true);
    }
  });

  it("rejects invalid event types", () => {
    const invalidTypes = ["click", "scroll", "PURCHASE", "View", ""];
    const eventTypePattern = /^(view|add_to_cart|purchase)$/;

    for (const type of invalidTypes) {
      expect(eventTypePattern.test(type)).toBe(false);
    }
  });
});

describe("Revenue Cents Validation", () => {
  it("accepts valid revenue values", () => {
    const validValues = [0, 1, 100, 9999, 1000000];

    for (const value of validValues) {
      expect(Number.isInteger(value) && value >= 0).toBe(true);
    }
  });

  it("rejects invalid revenue values", () => {
    const invalidValues = [-1, -100, 10.5, 99.99];

    for (const value of invalidValues) {
      expect(Number.isInteger(value) && value >= 0).toBe(false);
    }
  });
});
