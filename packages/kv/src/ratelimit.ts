import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { client } from ".";

// Default rate limiter (strict)
export const ratelimit = new Ratelimit({
  limiter: Ratelimit.fixedWindow(10, "10s"),
  redis: client,
});

// Public API rate limiter - more permissive for bucket/track endpoints
// 100 requests per minute per IP
export const publicApiRatelimit = new Ratelimit({
  limiter: Ratelimit.slidingWindow(100, "1m"),
  redis: client,
  prefix: "ratelimit:public",
});

// Authenticated API rate limiter - per user
// 200 requests per minute per user
export const authenticatedApiRatelimit = new Ratelimit({
  limiter: Ratelimit.slidingWindow(200, "1m"),
  redis: client,
  prefix: "ratelimit:auth",
});

// Helper to check rate limit and return appropriate response
export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ success: boolean; remaining: number; reset: number } | null> {
  try {
    const { success, remaining, reset } = await limiter.limit(identifier);
    return { success, remaining, reset };
  } catch (error) {
    // If Redis is not configured, allow request (fail-open for availability)
    console.warn("Rate limiting unavailable:", error);
    return null;
  }
}
