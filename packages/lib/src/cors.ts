/**
 * CORS utilities for public API routes
 *
 * These utilities help restrict CORS to valid Shopify shop domains
 * while allowing flexibility for development and testing.
 */

// Regex to validate Shopify shop domains
const SHOPIFY_DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

/**
 * Validates if a domain is a valid Shopify shop domain
 */
export function isValidShopifyDomain(domain: string): boolean {
  return SHOPIFY_DOMAIN_REGEX.test(domain);
}

/**
 * Extracts and validates the shop domain from request headers
 * Returns null if no valid shop domain is found
 */
export function getShopDomainFromRequest(request: Request): string | null {
  // Check X-Shopify-Shop-Domain header first (set by our theme extension)
  const shopHeader = request.headers.get("x-shopify-shop-domain");
  if (shopHeader && isValidShopifyDomain(shopHeader)) {
    return shopHeader;
  }

  // Check Origin header as fallback
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      if (isValidShopifyDomain(hostname)) {
        return hostname;
      }
    } catch {
      // Invalid URL, continue
    }
  }

  // Check Referer header as last resort
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const hostname = url.hostname;
      if (isValidShopifyDomain(hostname)) {
        return hostname;
      }
    } catch {
      // Invalid URL, continue
    }
  }

  return null;
}

/**
 * Generates CORS headers for API responses
 *
 * In production, restricts to the specific shop domain when available.
 * Falls back to * for development or when shop domain cannot be determined.
 *
 * @param request - The incoming request
 * @param methods - Allowed HTTP methods
 * @param additionalHeaders - Additional headers to allow
 */
export function getCorsHeaders(
  request: Request,
  methods: string[] = ["GET", "OPTIONS"],
  additionalHeaders: string[] = [],
): Record<string, string> {
  const shopDomain = getShopDomainFromRequest(request);

  // Build allowed headers list
  const allowedHeaders = [
    "Content-Type",
    "X-Shopify-Shop-Domain",
    ...additionalHeaders,
  ].join(", ");

  // In production with valid shop domain, restrict to that domain
  // Otherwise, allow all origins (for development/testing)
  const allowOrigin = shopDomain ? `https://${shopDomain}` : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
    ...(shopDomain && { Vary: "Origin" }), // Vary by origin when restricted
  };
}

/**
 * Type for CORS configuration
 */
export interface CorsConfig {
  methods: string[];
  additionalHeaders?: string[];
}

/**
 * Pre-configured CORS settings for common endpoints
 */
export const corsConfigs = {
  bucket: {
    methods: ["GET"],
    additionalHeaders: [],
  } satisfies CorsConfig,

  track: {
    methods: ["POST"],
    additionalHeaders: [],
  } satisfies CorsConfig,

  testsActive: {
    methods: ["GET"],
    additionalHeaders: [],
  } satisfies CorsConfig,
};
