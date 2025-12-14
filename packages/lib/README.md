# @v1/lib

Core A/B testing utilities for the Shopify price testing system.

## Modules

### stats

Statistical analysis for A/B testing.

```typescript
import {
  calculateConversionSignificance,
  calculateRevenueSignificance,
  analyzeTest,
  calculateRequiredSampleSize,
  formatPercentage,
  formatCurrency,
} from "@v1/lib/stats";

// Analyze conversion rates with two-proportion z-test
const result = calculateConversionSignificance(
  { visitors: 1000, conversions: 30, revenue_cents: 30000 },
  { visitors: 1000, conversions: 40, revenue_cents: 40000 }
);

console.log(result.significant);  // true/false
console.log(result.pValue);       // 0.0342
console.log(result.relativeLift); // 33.33%
```

#### Functions

| Function | Description |
|----------|-------------|
| `normalCDF(x)` | Standard normal cumulative distribution |
| `normalInverseCDF(p)` | Inverse normal CDF (for confidence intervals) |
| `calculateConversionSignificance(control, variant, confidence)` | Two-proportion z-test |
| `calculateRevenueSignificance(control, variant, ...)` | Welch's t-test for revenue |
| `analyzeTest(control, variant)` | Complete analysis with recommendations |
| `calculateRequiredSampleSize(baseline, mde, power, alpha)` | Sample size calculator |
| `estimateDaysToSignificance(dailyVisitors, baseline, mde)` | Test duration estimate |
| `formatPercentage(value)` | Format as "X.XX%" |
| `formatCurrency(cents)` | Format as "$X.XX" |
| `formatLift(lift)` | Format as "+X.X%" or "-X.X%" |

### schemas

Zod validation schemas for API requests and responses.

```typescript
import {
  createTestSchema,
  trackEventSchema,
  bucketResponseSchema,
} from "@v1/lib/schemas";

// Validate API input
const result = createTestSchema.safeParse(requestBody);
if (!result.success) {
  console.error(result.error.flatten());
}
```

#### Schemas

| Schema | Description |
|--------|-------------|
| `testStatusSchema` | Test status enum |
| `createTestSchema` | Create test request |
| `updateTestSchema` | Update test request |
| `bucketRequestSchema` | Bucket API request |
| `bucketResponseSchema` | Bucket API response |
| `trackEventSchema` | Event tracking request |
| `shopifyOrderWebhookSchema` | Shopify order webhook |
| `testResultsSchema` | Test results with analysis |

### shopify

Shopify Admin API client for discount code management.

```typescript
import { ShopifyClient } from "@v1/lib/shopify";

const client = new ShopifyClient(
  "your-store.myshopify.com",
  "shpat_xxxxx"
);

// Create a discount
const discount = await client.createDiscount({
  code: "ABTEST10",
  type: "fixed_amount",
  value: 500,  // $5.00
  productIds: ["123456789"],
});
```

## Testing

```bash
# Run tests
bun test

# Run with watch mode
bun test:watch

# Run with coverage
bun test:coverage
```

## Statistical Methods

### Conversion Rate Testing

Uses the **two-proportion z-test** to compare conversion rates:

```
z = (p2 - p1) / sqrt(p_pooled * (1 - p_pooled) * (1/n1 + 1/n2))
```

Where:
- p1, p2 = conversion rates
- p_pooled = pooled proportion
- n1, n2 = sample sizes

### Revenue Testing

Uses **Welch's t-test** for revenue per visitor comparison, which handles unequal variances.

### Sample Size Calculation

Calculates required sample size for specified:
- Baseline conversion rate
- Minimum detectable effect (MDE)
- Statistical power (default: 80%)
- Significance level (default: 5%)

### Confidence Intervals

95% confidence intervals are calculated using the normal approximation:

```
CI = p +/- z_critical * sqrt(p * (1 - p) / n)
```
