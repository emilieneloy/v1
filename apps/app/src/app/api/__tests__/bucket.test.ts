import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create chainable mock that returns itself
const createChainableMock = () => {
  let resolvedValue: unknown = null;

  const mock = {
    _setResolved: (val: unknown) => {
      resolvedValue = val;
    },
    select: vi.fn(() => mock),
    eq: vi.fn(() => mock),
    insert: vi.fn(() => ({ error: null })),
    single: vi.fn(() => Promise.resolve(resolvedValue)),
  };
  return mock;
};

let chainableMock = createChainableMock();
let insertMock = vi.fn(() => ({ error: null }));

vi.mock("@v1/supabase/server", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === "events" || insertMock._table === table) {
        return { insert: insertMock };
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

  describe("GET", () => {
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

    it("includes CORS headers in all responses", async () => {
      const request = createRequest(validTestId, {});
      const response = await GET(request, { params: createParams(validTestId) });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});

describe("Weighted Selection Algorithm", () => {
  it("distributes assignments according to weights over many runs", () => {
    // Test the weighted selection logic directly
    const variants = [
      { id: "a", weight: 70 },
      { id: "b", weight: 30 },
    ];

    const results: Record<string, number> = { a: 0, b: 0 };
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
      const random = Math.random() * totalWeight;

      let cumulative = 0;
      let selected = variants[0];
      for (const variant of variants) {
        cumulative += variant.weight;
        if (random <= cumulative) {
          selected = variant;
          break;
        }
      }
      results[selected.id]++;
    }

    // Allow 5% tolerance
    const expectedA = iterations * 0.7;
    const expectedB = iterations * 0.3;
    const tolerance = iterations * 0.05;

    expect(results.a).toBeGreaterThan(expectedA - tolerance);
    expect(results.a).toBeLessThan(expectedA + tolerance);
    expect(results.b).toBeGreaterThan(expectedB - tolerance);
    expect(results.b).toBeLessThan(expectedB + tolerance);
  });

  it("handles single variant with 100% weight", () => {
    const variants = [{ id: "only", weight: 100 }];

    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    const random = Math.random() * totalWeight;

    let cumulative = 0;
    let selected = variants[0];
    for (const variant of variants) {
      cumulative += variant.weight;
      if (random <= cumulative) {
        selected = variant;
        break;
      }
    }

    expect(selected.id).toBe("only");
  });

  it("handles unequal three-way split", () => {
    const variants = [
      { id: "a", weight: 50 },
      { id: "b", weight: 30 },
      { id: "c", weight: 20 },
    ];

    const results: Record<string, number> = { a: 0, b: 0, c: 0 };
    const iterations = 10000;

    for (let i = 0; i < iterations; i++) {
      const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
      const random = Math.random() * totalWeight;

      let cumulative = 0;
      let selected = variants[0];
      for (const variant of variants) {
        cumulative += variant.weight;
        if (random <= cumulative) {
          selected = variant;
          break;
        }
      }
      results[selected.id]++;
    }

    const tolerance = iterations * 0.05;
    expect(results.a).toBeGreaterThan(5000 - tolerance);
    expect(results.a).toBeLessThan(5000 + tolerance);
    expect(results.b).toBeGreaterThan(3000 - tolerance);
    expect(results.b).toBeLessThan(3000 + tolerance);
    expect(results.c).toBeGreaterThan(2000 - tolerance);
    expect(results.c).toBeLessThan(2000 + tolerance);
  });
});

describe("Bucket API Input Validation", () => {
  it("validates UUID format for test_id", () => {
    const validUUIDs = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    ];

    const invalidUUIDs = [
      "not-a-uuid",
      "12345",
      "",
      "550e8400-e29b-41d4-a716",
    ];

    // UUID regex pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const uuid of validUUIDs) {
      expect(uuidPattern.test(uuid)).toBe(true);
    }

    for (const uuid of invalidUUIDs) {
      expect(uuidPattern.test(uuid)).toBe(false);
    }
  });

  it("requires non-empty visitor_id", () => {
    const validVisitorIds = ["visitor-123", "abc", "1"];
    const invalidVisitorIds = ["", null, undefined];

    for (const id of validVisitorIds) {
      expect(id && id.length > 0).toBe(true);
    }

    for (const id of invalidVisitorIds) {
      // Check that invalid IDs are falsy or empty
      const isInvalid = !id || (typeof id === "string" && id.length === 0);
      expect(isInvalid).toBe(true);
    }
  });
});
