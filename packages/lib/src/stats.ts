/**
 * A/B Testing Statistical Engine
 *
 * Implements statistical significance calculations for A/B testing:
 * - Two-proportion z-test for conversion rates
 * - Welch's t-test for revenue per visitor
 * - Confidence intervals
 * - Sample size calculations
 */

// Standard normal cumulative distribution function
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

// Inverse normal CDF (for confidence intervals)
export function normalInverseCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.383577518672690e2,
    -3.066479806614716e1,
    2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838e0,
    -2.549732539343734e0,
    4.374664141464968e0,
    2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export interface VariantStats {
  visitors: number;
  conversions: number;
  revenue_cents: number;
}

export interface ConversionTestResult {
  controlRate: number;
  variantRate: number;
  absoluteLift: number;
  relativeLift: number;
  zScore: number;
  pValue: number;
  significant: boolean;
  confidenceLevel: number;
  controlCI: [number, number];
  variantCI: [number, number];
  sampleSizeReached: boolean;
  recommendedSampleSize: number;
}

export interface RevenueTestResult {
  controlRPV: number;
  variantRPV: number;
  absoluteLift: number;
  relativeLift: number;
  tStatistic: number;
  pValue: number;
  significant: boolean;
  confidenceLevel: number;
}

/**
 * Two-proportion z-test for conversion rate comparison
 */
export function calculateConversionSignificance(
  control: VariantStats,
  variant: VariantStats,
  confidenceLevel: number = 0.95
): ConversionTestResult {
  const { visitors: n1, conversions: x1 } = control;
  const { visitors: n2, conversions: x2 } = variant;

  // Conversion rates
  const p1 = n1 > 0 ? x1 / n1 : 0;
  const p2 = n2 > 0 ? x2 / n2 : 0;

  // Pooled proportion
  const pPooled = (n1 + n2) > 0 ? (x1 + x2) / (n1 + n2) : 0;

  // Standard error
  const se = n1 > 0 && n2 > 0
    ? Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2))
    : 0;

  // Z-score
  const z = se > 0 ? (p2 - p1) / se : 0;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  // Confidence intervals for each variant
  const alpha = 1 - confidenceLevel;
  const zCritical = normalInverseCDF(1 - alpha / 2);

  const se1 = n1 > 0 ? Math.sqrt((p1 * (1 - p1)) / n1) : 0;
  const se2 = n2 > 0 ? Math.sqrt((p2 * (1 - p2)) / n2) : 0;

  const controlCI: [number, number] = [
    Math.max(0, p1 - zCritical * se1),
    Math.min(1, p1 + zCritical * se1),
  ];
  const variantCI: [number, number] = [
    Math.max(0, p2 - zCritical * se2),
    Math.min(1, p2 + zCritical * se2),
  ];

  // Calculate recommended sample size for 80% power, 5% MDE
  const mde = 0.05; // Minimum detectable effect (5% relative lift)
  const power = 0.8;
  const zAlpha = normalInverseCDF(1 - alpha / 2);
  const zBeta = normalInverseCDF(power);
  const baseRate = p1 > 0 ? p1 : 0.03; // Use control rate or default 3%
  const recommendedSampleSize = Math.ceil(
    2 * Math.pow((zAlpha + zBeta), 2) * baseRate * (1 - baseRate) / Math.pow(baseRate * mde, 2)
  );

  return {
    controlRate: p1,
    variantRate: p2,
    absoluteLift: p2 - p1,
    relativeLift: p1 > 0 ? ((p2 - p1) / p1) * 100 : 0,
    zScore: z,
    pValue,
    significant: pValue < alpha,
    confidenceLevel,
    controlCI,
    variantCI,
    sampleSizeReached: Math.min(n1, n2) >= recommendedSampleSize,
    recommendedSampleSize,
  };
}

/**
 * Revenue per visitor comparison using Welch's t-test approximation
 * Note: For more accurate results with revenue data, consider using
 * bootstrap methods or Bayesian approaches
 */
export function calculateRevenueSignificance(
  control: VariantStats,
  variant: VariantStats,
  controlRevenues: number[] = [],
  variantRevenues: number[] = [],
  confidenceLevel: number = 0.95
): RevenueTestResult {
  const { visitors: n1, revenue_cents: rev1 } = control;
  const { visitors: n2, revenue_cents: rev2 } = variant;

  // Revenue per visitor
  const rpv1 = n1 > 0 ? rev1 / n1 : 0;
  const rpv2 = n2 > 0 ? rev2 / n2 : 0;

  // If we have individual revenue data, calculate variance properly
  let var1: number;
  let var2: number;

  if (controlRevenues.length > 0 && variantRevenues.length > 0) {
    // Calculate sample variance from individual data
    const mean1 = controlRevenues.reduce((a, b) => a + b, 0) / controlRevenues.length;
    const mean2 = variantRevenues.reduce((a, b) => a + b, 0) / variantRevenues.length;

    var1 = controlRevenues.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (controlRevenues.length - 1);
    var2 = variantRevenues.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (variantRevenues.length - 1);
  } else {
    // Estimate variance assuming Poisson-like distribution
    // This is a rough approximation; for production use, store individual revenues
    var1 = rpv1 > 0 ? rpv1 * rpv1 : 0;
    var2 = rpv2 > 0 ? rpv2 * rpv2 : 0;
  }

  // Welch's t-test
  const se = Math.sqrt((var1 / Math.max(n1, 1)) + (var2 / Math.max(n2, 1)));
  const t = se > 0 ? (rpv2 - rpv1) / se : 0;

  // Welch-Satterthwaite degrees of freedom
  const v1 = var1 / Math.max(n1, 1);
  const v2 = var2 / Math.max(n2, 1);
  const df = (v1 + v2) > 0
    ? Math.pow(v1 + v2, 2) / (
        Math.pow(v1, 2) / Math.max(n1 - 1, 1) +
        Math.pow(v2, 2) / Math.max(n2 - 1, 1)
      )
    : 1;

  // Approximate p-value using normal distribution (good for large samples)
  // For small samples, would need proper t-distribution
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));

  const alpha = 1 - confidenceLevel;

  return {
    controlRPV: rpv1,
    variantRPV: rpv2,
    absoluteLift: rpv2 - rpv1,
    relativeLift: rpv1 > 0 ? ((rpv2 - rpv1) / rpv1) * 100 : 0,
    tStatistic: t,
    pValue,
    significant: pValue < alpha,
    confidenceLevel,
  };
}

export interface TestAnalysis {
  conversion: ConversionTestResult;
  revenue: RevenueTestResult;
  winner: "control" | "variant" | "none";
  recommendation: string;
}

/**
 * Complete test analysis combining conversion and revenue metrics
 */
export function analyzeTest(
  control: VariantStats,
  variant: VariantStats,
  confidenceLevel: number = 0.95
): TestAnalysis {
  const conversion = calculateConversionSignificance(control, variant, confidenceLevel);
  const revenue = calculateRevenueSignificance(control, variant, [], [], confidenceLevel);

  // Determine winner
  let winner: "control" | "variant" | "none" = "none";
  let recommendation = "";

  if (!conversion.sampleSizeReached) {
    recommendation = `Need more data. Current: ${Math.min(control.visitors, variant.visitors)} visitors. Recommended: ${conversion.recommendedSampleSize} per variant.`;
  } else if (!conversion.significant && !revenue.significant) {
    recommendation = "No statistically significant difference detected. Consider running longer or with a larger effect size.";
  } else if (conversion.significant && conversion.relativeLift > 0) {
    winner = "variant";
    recommendation = `Variant shows ${conversion.relativeLift.toFixed(1)}% lift in conversion rate (p=${conversion.pValue.toFixed(4)}). Consider implementing.`;
  } else if (conversion.significant && conversion.relativeLift < 0) {
    winner = "control";
    recommendation = `Control performs better. Variant shows ${Math.abs(conversion.relativeLift).toFixed(1)}% decrease in conversion rate.`;
  } else if (revenue.significant && revenue.relativeLift > 0) {
    winner = "variant";
    recommendation = `Variant shows ${revenue.relativeLift.toFixed(1)}% lift in revenue per visitor (p=${revenue.pValue.toFixed(4)}).`;
  } else if (revenue.significant && revenue.relativeLift < 0) {
    winner = "control";
    recommendation = `Control generates more revenue. Variant shows ${Math.abs(revenue.relativeLift).toFixed(1)}% decrease.`;
  }

  return {
    conversion,
    revenue,
    winner,
    recommendation,
  };
}

/**
 * Calculate the minimum sample size needed for a test
 */
export function calculateRequiredSampleSize(
  baselineConversionRate: number,
  minimumDetectableEffect: number, // relative, e.g., 0.1 for 10% lift
  power: number = 0.8,
  significanceLevel: number = 0.05
): number {
  const alpha = significanceLevel;
  const zAlpha = normalInverseCDF(1 - alpha / 2);
  const zBeta = normalInverseCDF(power);

  const p1 = baselineConversionRate;
  const p2 = p1 * (1 + minimumDetectableEffect);
  const pBar = (p1 + p2) / 2;

  const n = Math.ceil(
    (2 * pBar * (1 - pBar) * Math.pow(zAlpha + zBeta, 2)) / Math.pow(p2 - p1, 2)
  );

  return n;
}

/**
 * Estimate how many days until a test reaches significance
 */
export function estimateDaysToSignificance(
  dailyVisitors: number,
  baselineConversionRate: number,
  minimumDetectableEffect: number,
  numVariants: number = 2
): number {
  const requiredPerVariant = calculateRequiredSampleSize(
    baselineConversionRate,
    minimumDetectableEffect
  );
  const totalRequired = requiredPerVariant * numVariants;
  return Math.ceil(totalRequired / dailyVisitors);
}

/**
 * Format stats for display
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatLift(lift: number): string {
  const sign = lift >= 0 ? "+" : "";
  return `${sign}${lift.toFixed(1)}%`;
}
