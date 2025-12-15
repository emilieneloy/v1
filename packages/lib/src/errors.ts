/**
 * Structured Error Codes for the A/B Testing API
 *
 * All API errors return a response with:
 * - error: string (human-readable message)
 * - code: ErrorCode (machine-readable code)
 * - details?: object (additional context, validation errors, etc.)
 */

export const ErrorCodes = {
  // Authentication & Authorization (1xxx)
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID_TOKEN: "AUTH_INVALID_TOKEN",
  AUTH_TOKEN_EXPIRED: "AUTH_TOKEN_EXPIRED",
  AUTH_INSUFFICIENT_PERMISSIONS: "AUTH_INSUFFICIENT_PERMISSIONS",

  // Shop Validation (2xxx)
  SHOP_REQUIRED: "SHOP_REQUIRED",
  SHOP_INVALID_DOMAIN: "SHOP_INVALID_DOMAIN",
  SHOP_NOT_FOUND: "SHOP_NOT_FOUND",
  SHOP_NOT_INSTALLED: "SHOP_NOT_INSTALLED",

  // Test Errors (3xxx)
  TEST_NOT_FOUND: "TEST_NOT_FOUND",
  TEST_NOT_ACTIVE: "TEST_NOT_ACTIVE",
  TEST_ALREADY_EXISTS: "TEST_ALREADY_EXISTS",
  TEST_INVALID_STATUS: "TEST_INVALID_STATUS",
  TEST_NO_VARIANTS: "TEST_NO_VARIANTS",

  // Variant Errors (4xxx)
  VARIANT_NOT_FOUND: "VARIANT_NOT_FOUND",
  VARIANT_MISMATCH: "VARIANT_MISMATCH",
  VARIANT_INVALID_WEIGHT: "VARIANT_INVALID_WEIGHT",

  // Assignment Errors (5xxx)
  ASSIGNMENT_NOT_FOUND: "ASSIGNMENT_NOT_FOUND",
  ASSIGNMENT_FAILED: "ASSIGNMENT_FAILED",

  // Event Tracking Errors (6xxx)
  EVENT_INVALID_TYPE: "EVENT_INVALID_TYPE",
  EVENT_INSERT_FAILED: "EVENT_INSERT_FAILED",
  EVENT_BATCH_FAILED: "EVENT_BATCH_FAILED",

  // Rate Limiting (7xxx)
  RATE_LIMITED: "RATE_LIMITED",

  // Validation Errors (8xxx)
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INVALID_REQUEST_BODY: "INVALID_REQUEST_BODY",
  MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",

  // Webhook Errors (9xxx)
  WEBHOOK_INVALID_SIGNATURE: "WEBHOOK_INVALID_SIGNATURE",
  WEBHOOK_MISSING_SIGNATURE: "WEBHOOK_MISSING_SIGNATURE",
  WEBHOOK_PROCESSING_FAILED: "WEBHOOK_PROCESSING_FAILED",

  // Database Errors (10xxx)
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_CONNECTION_FAILED: "DATABASE_CONNECTION_FAILED",

  // General Errors
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Error response structure
 */
export interface APIErrorResponse {
  error: string;
  code: ErrorCode;
  details?: Record<string, unknown>;
  retryAfter?: number;
}

/**
 * Error messages for each error code
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Authentication & Authorization
  [ErrorCodes.AUTH_REQUIRED]: "Authentication is required",
  [ErrorCodes.AUTH_INVALID_TOKEN]: "Invalid authentication token",
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: "Authentication token has expired",
  [ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS]:
    "Insufficient permissions for this action",

  // Shop Validation
  [ErrorCodes.SHOP_REQUIRED]: "Shop domain header is required",
  [ErrorCodes.SHOP_INVALID_DOMAIN]: "Invalid shop domain format",
  [ErrorCodes.SHOP_NOT_FOUND]: "Shop not found",
  [ErrorCodes.SHOP_NOT_INSTALLED]: "App is not installed on this shop",

  // Test Errors
  [ErrorCodes.TEST_NOT_FOUND]: "Test not found",
  [ErrorCodes.TEST_NOT_ACTIVE]: "Test is not active",
  [ErrorCodes.TEST_ALREADY_EXISTS]: "A test with this name already exists",
  [ErrorCodes.TEST_INVALID_STATUS]: "Invalid test status",
  [ErrorCodes.TEST_NO_VARIANTS]: "No variants configured for this test",

  // Variant Errors
  [ErrorCodes.VARIANT_NOT_FOUND]: "Variant not found",
  [ErrorCodes.VARIANT_MISMATCH]: "Variant does not belong to this test",
  [ErrorCodes.VARIANT_INVALID_WEIGHT]: "Invalid variant weight",

  // Assignment Errors
  [ErrorCodes.ASSIGNMENT_NOT_FOUND]: "Assignment not found",
  [ErrorCodes.ASSIGNMENT_FAILED]: "Failed to create assignment",

  // Event Tracking Errors
  [ErrorCodes.EVENT_INVALID_TYPE]: "Invalid event type",
  [ErrorCodes.EVENT_INSERT_FAILED]: "Failed to record event",
  [ErrorCodes.EVENT_BATCH_FAILED]: "Failed to record batch events",

  // Rate Limiting
  [ErrorCodes.RATE_LIMITED]: "Rate limit exceeded",

  // Validation Errors
  [ErrorCodes.VALIDATION_FAILED]: "Validation failed",
  [ErrorCodes.INVALID_REQUEST_BODY]: "Invalid request body",
  [ErrorCodes.MISSING_REQUIRED_FIELD]: "Missing required field",

  // Webhook Errors
  [ErrorCodes.WEBHOOK_INVALID_SIGNATURE]: "Invalid webhook signature",
  [ErrorCodes.WEBHOOK_MISSING_SIGNATURE]: "Missing webhook signature",
  [ErrorCodes.WEBHOOK_PROCESSING_FAILED]: "Failed to process webhook",

  // Database Errors
  [ErrorCodes.DATABASE_ERROR]: "Database error occurred",
  [ErrorCodes.DATABASE_CONNECTION_FAILED]: "Failed to connect to database",

  // General Errors
  [ErrorCodes.INTERNAL_SERVER_ERROR]: "Internal server error",
  [ErrorCodes.NOT_FOUND]: "Resource not found",
  [ErrorCodes.METHOD_NOT_ALLOWED]: "Method not allowed",
};

/**
 * HTTP status codes for each error code
 */
export const ErrorStatusCodes: Record<ErrorCode, number> = {
  // Authentication & Authorization (401, 403)
  [ErrorCodes.AUTH_REQUIRED]: 401,
  [ErrorCodes.AUTH_INVALID_TOKEN]: 401,
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 401,
  [ErrorCodes.AUTH_INSUFFICIENT_PERMISSIONS]: 403,

  // Shop Validation (400, 404)
  [ErrorCodes.SHOP_REQUIRED]: 400,
  [ErrorCodes.SHOP_INVALID_DOMAIN]: 400,
  [ErrorCodes.SHOP_NOT_FOUND]: 404,
  [ErrorCodes.SHOP_NOT_INSTALLED]: 403,

  // Test Errors (400, 404)
  [ErrorCodes.TEST_NOT_FOUND]: 404,
  [ErrorCodes.TEST_NOT_ACTIVE]: 400,
  [ErrorCodes.TEST_ALREADY_EXISTS]: 409,
  [ErrorCodes.TEST_INVALID_STATUS]: 400,
  [ErrorCodes.TEST_NO_VARIANTS]: 400,

  // Variant Errors (400, 404)
  [ErrorCodes.VARIANT_NOT_FOUND]: 404,
  [ErrorCodes.VARIANT_MISMATCH]: 400,
  [ErrorCodes.VARIANT_INVALID_WEIGHT]: 400,

  // Assignment Errors (404, 500)
  [ErrorCodes.ASSIGNMENT_NOT_FOUND]: 404,
  [ErrorCodes.ASSIGNMENT_FAILED]: 500,

  // Event Tracking Errors (400, 500)
  [ErrorCodes.EVENT_INVALID_TYPE]: 400,
  [ErrorCodes.EVENT_INSERT_FAILED]: 500,
  [ErrorCodes.EVENT_BATCH_FAILED]: 500,

  // Rate Limiting (429)
  [ErrorCodes.RATE_LIMITED]: 429,

  // Validation Errors (400)
  [ErrorCodes.VALIDATION_FAILED]: 400,
  [ErrorCodes.INVALID_REQUEST_BODY]: 400,
  [ErrorCodes.MISSING_REQUIRED_FIELD]: 400,

  // Webhook Errors (401, 500)
  [ErrorCodes.WEBHOOK_INVALID_SIGNATURE]: 401,
  [ErrorCodes.WEBHOOK_MISSING_SIGNATURE]: 401,
  [ErrorCodes.WEBHOOK_PROCESSING_FAILED]: 500,

  // Database Errors (500, 503)
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.DATABASE_CONNECTION_FAILED]: 503,

  // General Errors
  [ErrorCodes.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.METHOD_NOT_ALLOWED]: 405,
};

/**
 * Create a standardized API error response
 */
export function createErrorResponse(
  code: ErrorCode,
  details?: Record<string, unknown>,
  customMessage?: string,
): APIErrorResponse {
  return {
    error: customMessage || ErrorMessages[code],
    code,
    ...(details && { details }),
  };
}

/**
 * Create a rate limit error response
 */
export function createRateLimitError(retryAfter: number): APIErrorResponse {
  return {
    error: ErrorMessages[ErrorCodes.RATE_LIMITED],
    code: ErrorCodes.RATE_LIMITED,
    retryAfter,
  };
}

/**
 * Create a validation error response from Zod errors
 */
export function createValidationError(
  zodErrors: Record<string, string[]>,
): APIErrorResponse {
  return {
    error: ErrorMessages[ErrorCodes.VALIDATION_FAILED],
    code: ErrorCodes.VALIDATION_FAILED,
    details: zodErrors,
  };
}
