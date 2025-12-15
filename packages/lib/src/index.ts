// Statistics Engine
export {
  normalCDF,
  normalInverseCDF,
  calculateConversionSignificance,
  calculateRevenueSignificance,
  analyzeTest,
  calculateRequiredSampleSize,
  estimateDaysToSignificance,
  formatPercentage,
  formatCurrency,
  formatLift,
  type VariantStats,
  type ConversionTestResult,
  type RevenueTestResult,
  type TestAnalysis,
} from "./stats";

// Zod Schemas
export {
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
  type TestStatus,
  type CreateTest,
  type UpdateTest,
  type CreateVariant,
  type UpdateVariant,
  type BucketRequest,
  type BucketResponse,
  type EventType,
  type TrackEvent,
  type BatchTrackEvents,
  type ShopifyOrderWebhook,
  type ApiError,
  type Pagination,
  type TestResults,
} from "./schemas";

// Shopify Client
export {
  ShopifyClient,
  createShopifyClient,
  generateDiscountCode,
  type ShopifyConfig,
  type DiscountCodeInput,
  type DiscountCode,
  type ShopifyProduct,
} from "./shopify";

// Error Codes and Utilities
export {
  ErrorCodes,
  ErrorMessages,
  ErrorStatusCodes,
  createErrorResponse,
  createRateLimitError,
  createValidationError,
  type ErrorCode,
  type APIErrorResponse,
} from "./errors";

// CORS Utilities
export {
  isValidShopifyDomain,
  getShopDomainFromRequest,
  getCorsHeaders,
  corsConfigs,
  type CorsConfig,
} from "./cors";
