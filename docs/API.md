# API Documentation

## Overview

The A/B Testing API provides endpoints for managing tests, bucketing visitors, tracking events, and handling Shopify webhooks.

**Base URL**: `https://your-domain.com/api`

## Authentication

Most API endpoints do not require authentication as they are called from the Shopify storefront. The webhook endpoint validates requests using Shopify's HMAC signature.

## Endpoints

### Visitor Bucketing

#### `GET /api/bucket/{testId}`

Assigns a visitor to a test variant or returns their existing assignment.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `visitor_id` | string | Yes | Unique visitor identifier (from cookie) |
| `product_id` | string | No | Shopify product ID for targeted tests |

**Response:**

```json
{
  "variant_id": "uuid",
  "variant_name": "Control",
  "discount_code": "SAVE10",
  "price_modifier_cents": -500,
  "is_new_assignment": true
}
```

**Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `404 Not Found` - Test not found or inactive
- `500 Internal Server Error` - Server error

**Example:**
```bash
curl "https://your-domain.com/api/bucket/550e8400-e29b-41d4-a716-446655440000?visitor_id=abc123&product_id=12345"
```

---

### Event Tracking

#### `POST /api/track`

Records an event (view, add_to_cart, or purchase) for analytics.

**Request Body:**

```json
{
  "test_id": "uuid",
  "variant_id": "uuid",
  "visitor_id": "string",
  "event_type": "view" | "add_to_cart" | "purchase",
  "product_id": "string (optional)",
  "order_id": "string (optional)",
  "revenue_cents": 0
}
```

**Response:**

```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK` - Event recorded
- `400 Bad Request` - Invalid parameters
- `500 Internal Server Error` - Server error

**Event Types:**
- `view` - Product page view
- `add_to_cart` - Added to cart
- `purchase` - Completed purchase (include `revenue_cents`)

---

### Tests Management

#### `GET /api/tests`

List all A/B tests.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | all | Filter by status (draft, active, paused, completed) |

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Holiday Price Test",
      "description": "Testing 10% discount",
      "status": "active",
      "product_ids": ["123", "456"],
      "created_at": "2024-01-01T00:00:00Z",
      "variants": [
        {
          "id": "uuid",
          "name": "Control",
          "weight": 50,
          "discount_code": null,
          "price_modifier_cents": 0
        }
      ]
    }
  ]
}
```

#### `POST /api/tests`

Create a new A/B test.

**Request Body:**

```json
{
  "name": "Holiday Price Test",
  "description": "Testing 10% discount (optional)",
  "product_ids": ["123456789"],
  "variants": [
    {
      "name": "Control",
      "weight": 50,
      "discount_code": "",
      "price_modifier_cents": 0
    },
    {
      "name": "10% Off",
      "weight": 50,
      "discount_code": "HOLIDAY10",
      "price_modifier_cents": -500
    }
  ]
}
```

**Response:**

```json
{
  "data": {
    "id": "uuid",
    "name": "Holiday Price Test",
    "status": "draft"
  }
}
```

**Validation:**
- `name`: 1-100 characters
- `product_ids`: At least 1 product
- `variants`: At least 2 variants
- Variant weights must sum to 100

#### `GET /api/tests/{id}`

Get a test with real-time statistics.

**Response:**

```json
{
  "data": {
    "test": {
      "id": "uuid",
      "name": "Holiday Price Test",
      "status": "active",
      "product_ids": ["123"]
    },
    "variant_stats": [
      {
        "variant_id": "uuid",
        "variant_name": "Control",
        "visitors": 1000,
        "conversions": 30,
        "revenue_cents": 30000,
        "conversion_rate": 0.03,
        "revenue_per_visitor": 30
      }
    ],
    "analysis": {
      "winner": "variant",
      "recommendation": "Variant shows 33% lift...",
      "conversion": {
        "controlRate": 0.03,
        "variantRate": 0.04,
        "relativeLift": 33.33,
        "pValue": 0.01,
        "significant": true
      },
      "revenue": {
        "controlRPV": 30,
        "variantRPV": 40,
        "relativeLift": 33.33,
        "pValue": 0.02,
        "significant": true
      }
    }
  }
}
```

#### `PATCH /api/tests/{id}`

Update a test (name, description, status).

**Request Body:**

```json
{
  "name": "New Name (optional)",
  "description": "New description (optional)",
  "status": "active" | "paused" | "completed"
}
```

#### `DELETE /api/tests/{id}`

Delete a test and all associated data.

---

### Shopify Webhook

#### `POST /api/webhooks/shopify`

Handles Shopify order webhooks for purchase attribution.

**Headers:**
- `X-Shopify-Topic`: orders/paid
- `X-Shopify-HMAC-SHA256`: Webhook signature

The webhook looks for A/B test data in:
1. Order note attributes (`ab_test_id`, `ab_variant_id`)
2. Discount codes matching test variants
3. Product IDs in line items

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE (optional)",
  "details": { "field": "error details (optional)" }
}
```

## Rate Limits

No explicit rate limits, but consider implementing them for production:
- Bucketing: 1000 requests/min per IP
- Tracking: 100 events/min per visitor
- Management: 60 requests/min per user

## CORS

The bucketing and tracking endpoints support CORS for cross-origin requests from Shopify storefronts:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
