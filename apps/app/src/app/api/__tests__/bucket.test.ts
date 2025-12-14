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

vi.mock("@v1/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "assignments") {
        return {
          select: vi.fn(() => chainableMock),
          insert: insertMock,
        };
      }
      return chainableMock;
    }),
  })),
}));

// Import after mocking
import { GET, OPTIONS } from "../bucket/[testId]/route";

describe("Bucket API", () => {
  const validTestId = "550e8400-e29b-41d4-a716-446655440000";
  const validVariantId = "660e8400-e29b-41d4-a716-446655440001";

  const mockVariants = [
    {
      id: validVariantId,
      name: "Control",
      weight: 50,
      discount_code: null,
      price_modifier_cents: 0,
    },
    {
      id: "770e8400-e29b-41d4-a716-446655440002",
      name: "Test Variant",
      weight: 50,
      discount_code: "SAVE10",
      price_modifier_cents: -500,
    },
  ];

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
        "GET, OPTIONS"
      );
    });
  });

  describe("GET - Input Validation", () => {
    const createRequest = (testId: string, params: Record<string, string>) => {
      const searchParams = new URLSearchParams(params);
      const url = `http://localhost/api/bucket/${testId}?${searchParams}`;
      return new Request(url, { method: "GET" });
    };

    const createParams = (testId: string) => Promise.resolve({ testId });

    it("returns 400 when visitor_id is missing", async () => {
      const request = createRequest(validTestId, {});
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("returns 400 when test_id is not a valid UUID", async () => {
      const request = createRequest("not-a-uuid", { visitor_id: "visitor-123" });
      const response = await GET(request, {
        params: createParams("not-a-uuid"),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid request");
    });

    it("includes CORS headers in error responses", async () => {
      const request = createRequest(validTestId, {});
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("GET - Test Lookup", () => {
    const createRequest = (testId: string, visitorId: string) => {
      const url = `http://localhost/api/bucket/${testId}?visitor_id=${visitorId}`;
      return new Request(url, { method: "GET" });
    };

    const createParams = (testId: string) => Promise.resolve({ testId });

    it("returns 404 when test is not found", async () => {
      chainableMock._setSingleResults([
        { data: null, error: { code: "PGRST116", message: "not found" } },
      ]);

      const request = createRequest(validTestId, "visitor-123");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("Test not found");
    });

    it("returns 400 when test is not active (paused)", async () => {
      chainableMock._setSingleResults([
        {
          data: {
            id: validTestId,
            status: "paused",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
      ]);

      const request = createRequest(validTestId, "visitor-123");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Test is not active");
      expect(data.status).toBe("paused");
    });

    it("returns 400 when test is draft", async () => {
      chainableMock._setSingleResults([
        {
          data: {
            id: validTestId,
            status: "draft",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
      ]);

      const request = createRequest(validTestId, "visitor-123");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Test is not active");
    });

    it("returns 400 when test has no variants", async () => {
      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: [], // Empty variants
          },
          error: null,
        },
        // No existing assignment
        { data: null, error: null },
      ]);

      const request = createRequest(validTestId, "visitor-123");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("No variants configured for this test");
    });
  });

  describe("GET - Existing Assignment", () => {
    const createRequest = (testId: string, visitorId: string) => {
      const url = `http://localhost/api/bucket/${testId}?visitor_id=${visitorId}`;
      return new Request(url, { method: "GET" });
    };

    const createParams = (testId: string) => Promise.resolve({ testId });

    it("returns existing assignment for returning visitor", async () => {
      const existingVariant = mockVariants[0];

      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
        // Existing assignment found
        {
          data: {
            variant_id: existingVariant.id,
            variants: existingVariant,
          },
          error: null,
        },
      ]);

      const request = createRequest(validTestId, "returning-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.variant_id).toBe(existingVariant.id);
      expect(data.variant_name).toBe("Control");
      expect(data.is_new_assignment).toBe(false);
      expect(data.discount_code).toBeNull();
      expect(data.price_modifier_cents).toBe(0);
    });

    it("returns existing assignment with discount code", async () => {
      const discountVariant = mockVariants[1];

      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
        // Existing assignment found
        {
          data: {
            variant_id: discountVariant.id,
            variants: discountVariant,
          },
          error: null,
        },
      ]);

      const request = createRequest(validTestId, "discount-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.variant_name).toBe("Test Variant");
      expect(data.discount_code).toBe("SAVE10");
      expect(data.price_modifier_cents).toBe(-500);
      expect(data.is_new_assignment).toBe(false);
    });
  });

  describe("GET - New Assignment", () => {
    const createRequest = (testId: string, visitorId: string) => {
      const url = `http://localhost/api/bucket/${testId}?visitor_id=${visitorId}`;
      return new Request(url, { method: "GET" });
    };

    const createParams = (testId: string) => Promise.resolve({ testId });

    it("creates new assignment for new visitor", async () => {
      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
        // No existing assignment
        { data: null, error: null },
      ]);

      insertMock = vi.fn(() => ({ error: null }));

      const request = createRequest(validTestId, "new-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.is_new_assignment).toBe(true);
      // Should be one of the variants
      expect([mockVariants[0].id, mockVariants[1].id]).toContain(data.variant_id);
      expect(["Control", "Test Variant"]).toContain(data.variant_name);
    });

    it("handles race condition with duplicate key error", async () => {
      const existingVariant = mockVariants[0];

      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
        // No existing assignment (first check)
        { data: null, error: null },
        // Retry after duplicate - now found
        {
          data: {
            variant_id: existingVariant.id,
            variants: existingVariant,
          },
          error: null,
        },
      ]);

      // Simulate duplicate key error
      insertMock = vi.fn(() => ({
        error: { code: "23505", message: "duplicate key" },
      }));

      const request = createRequest(validTestId, "race-condition-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.is_new_assignment).toBe(false);
      expect(data.variant_id).toBe(existingVariant.id);
    });

    it("returns 500 on non-duplicate insert error", async () => {
      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: mockVariants,
          },
          error: null,
        },
        // No existing assignment
        { data: null, error: null },
      ]);

      // Simulate database error
      insertMock = vi.fn(() => ({
        error: { code: "OTHER", message: "database connection failed" },
      }));

      const request = createRequest(validTestId, "error-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Failed to create assignment");
    });
  });

  describe("GET - Single Variant Test", () => {
    const createRequest = (testId: string, visitorId: string) => {
      const url = `http://localhost/api/bucket/${testId}?visitor_id=${visitorId}`;
      return new Request(url, { method: "GET" });
    };

    const createParams = (testId: string) => Promise.resolve({ testId });

    it("always assigns to single variant with 100% weight", async () => {
      const singleVariant = {
        id: "single-variant-id",
        name: "Only Option",
        weight: 100,
        discount_code: "ONLY",
        price_modifier_cents: -100,
      };

      chainableMock._setSingleResults([
        // Test lookup
        {
          data: {
            id: validTestId,
            status: "active",
            product_ids: ["prod-1"],
            variants: [singleVariant],
          },
          error: null,
        },
        // No existing assignment
        { data: null, error: null },
      ]);

      insertMock = vi.fn(() => ({ error: null }));

      const request = createRequest(validTestId, "single-test-visitor");
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.variant_id).toBe(singleVariant.id);
      expect(data.variant_name).toBe("Only Option");
      expect(data.discount_code).toBe("ONLY");
    });
  });
});
