import { z } from "zod";

// ============================================
// Test Schemas
// ============================================

export const testStatusSchema = z.enum(["draft", "active", "paused", "completed"]);

export const createTestSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(500).optional(),
  product_ids: z.array(z.string()).min(1, "At least one product is required"),
  variants: z.array(z.object({
    name: z.string().min(1, "Variant name is required"),
    weight: z.number().min(0).max(100).default(50),
    discount_code: z.string().optional(),
    price_modifier_cents: z.number().optional(),
  })).min(2, "At least 2 variants required"),
});

export const updateTestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: testStatusSchema.optional(),
  product_ids: z.array(z.string()).optional(),
});

export const testIdSchema = z.object({
  id: z.string().uuid("Invalid test ID"),
});

// ============================================
// Variant Schemas
// ============================================

export const createVariantSchema = z.object({
  test_id: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  weight: z.number().min(0).max(100).default(50),
  discount_code: z.string().optional(),
  price_modifier_cents: z.number().optional(),
});

export const updateVariantSchema = z.object({
  name: z.string().min(1).optional(),
  weight: z.number().min(0).max(100).optional(),
  discount_code: z.string().optional(),
  price_modifier_cents: z.number().optional(),
});

// ============================================
// Bucketing Schemas
// ============================================

export const bucketRequestSchema = z.object({
  test_id: z.string().uuid(),
  visitor_id: z.string().min(1, "Visitor ID is required"),
  product_id: z.string().optional(),
});

export const bucketResponseSchema = z.object({
  variant_id: z.string().uuid(),
  variant_name: z.string(),
  discount_code: z.string().nullable(),
  price_modifier_cents: z.number().nullable(),
  is_new_assignment: z.boolean(),
});

// ============================================
// Event Tracking Schemas
// ============================================

export const eventTypeSchema = z.enum(["view", "add_to_cart", "purchase"]);

export const trackEventSchema = z.object({
  test_id: z.string().uuid(),
  variant_id: z.string().uuid(),
  visitor_id: z.string().min(1),
  event_type: eventTypeSchema,
  product_id: z.string().optional(),
  order_id: z.string().optional(),
  revenue_cents: z.number().int().min(0).optional(),
});

export const batchTrackEventsSchema = z.object({
  events: z.array(trackEventSchema).max(100, "Max 100 events per batch"),
});

// ============================================
// Webhook Schemas (Shopify)
// ============================================

export const shopifyOrderWebhookSchema = z.object({
  id: z.number(),
  order_number: z.number().optional(),
  total_price: z.string(),
  currency: z.string(),
  customer: z.object({
    id: z.number().optional(),
  }).optional(),
  line_items: z.array(z.object({
    product_id: z.number().nullable(),
    variant_id: z.number().nullable(),
    quantity: z.number(),
    price: z.string(),
  })),
  note_attributes: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
  discount_codes: z.array(z.object({
    code: z.string(),
    amount: z.string(),
    type: z.string(),
  })).optional(),
});

// ============================================
// API Response Schemas
// ============================================

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const testResultsSchema = z.object({
  test_id: z.string().uuid(),
  variant_stats: z.array(z.object({
    variant_id: z.string().uuid(),
    variant_name: z.string(),
    visitors: z.number(),
    conversions: z.number(),
    revenue_cents: z.number(),
    conversion_rate: z.number(),
    revenue_per_visitor: z.number(),
  })),
  analysis: z.object({
    winner: z.enum(["control", "variant", "none"]),
    recommendation: z.string(),
    conversion: z.object({
      controlRate: z.number(),
      variantRate: z.number(),
      relativeLift: z.number(),
      pValue: z.number(),
      significant: z.boolean(),
    }),
    revenue: z.object({
      controlRPV: z.number(),
      variantRPV: z.number(),
      relativeLift: z.number(),
      pValue: z.number(),
      significant: z.boolean(),
    }),
  }).optional(),
});

// ============================================
// Type Exports
// ============================================

export type TestStatus = z.infer<typeof testStatusSchema>;
export type CreateTest = z.infer<typeof createTestSchema>;
export type UpdateTest = z.infer<typeof updateTestSchema>;
export type CreateVariant = z.infer<typeof createVariantSchema>;
export type UpdateVariant = z.infer<typeof updateVariantSchema>;
export type BucketRequest = z.infer<typeof bucketRequestSchema>;
export type BucketResponse = z.infer<typeof bucketResponseSchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type TrackEvent = z.infer<typeof trackEventSchema>;
export type BatchTrackEvents = z.infer<typeof batchTrackEventsSchema>;
export type ShopifyOrderWebhook = z.infer<typeof shopifyOrderWebhookSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
export type TestResults = z.infer<typeof testResultsSchema>;
