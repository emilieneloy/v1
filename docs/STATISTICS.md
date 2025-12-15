# Statistics Documentation

This document explains the statistical methods used in the A/B Testing application for analyzing test results and determining significance.

## Table of Contents

1. [Overview](#overview)
2. [Key Metrics](#key-metrics)
3. [Statistical Tests](#statistical-tests)
4. [Confidence Intervals](#confidence-intervals)
5. [Sample Size Requirements](#sample-size-requirements)
6. [When to Stop Tests](#when-to-stop-tests)
7. [Common Pitfalls](#common-pitfalls)
8. [Practical Guidelines](#practical-guidelines)

---

## Overview

The application uses frequentist statistical methods to determine if observed differences between variants are statistically significant or likely due to random chance.

### Key Concepts

| Term | Definition |
|------|------------|
| **Conversion Rate** | Percentage of visitors who complete a goal (purchase) |
| **Statistical Significance** | Probability that results are not due to chance |
| **Confidence Level** | How certain we are in the result (typically 95%) |
| **p-value** | Probability of seeing results this extreme if no real difference exists |
| **Lift** | Percentage improvement of test variant over control |
| **Power** | Probability of detecting a real effect when one exists |

---

## Key Metrics

### Conversion Metrics

```typescript
interface VariantStats {
  visitors: number;        // Unique visitors assigned to variant
  views: number;           // Product page views
  conversions: number;     // Purchase events
  conversionRate: number;  // conversions / visitors
  revenue: number;         // Total revenue in cents
  averageOrderValue: number; // revenue / conversions
}
```

### Calculating Conversion Rate

```typescript
function calculateConversionRate(conversions: number, visitors: number): number {
  if (visitors === 0) return 0;
  return conversions / visitors;
}

// Example
const rate = calculateConversionRate(50, 1000); // 0.05 = 5%
```

### Calculating Lift

```typescript
function calculateLift(control: number, test: number): number {
  if (control === 0) return 0;
  return ((test - control) / control) * 100;
}

// Example: Control 5%, Test 6%
const lift = calculateLift(0.05, 0.06); // 20% lift
```

---

## Statistical Tests

### Two-Proportion Z-Test (Conversion Rate)

Used to compare conversion rates between two variants.

#### Formula

```
Z = (p1 - p2) / sqrt(p_pooled * (1 - p_pooled) * (1/n1 + 1/n2))

where:
- p1, p2 = conversion rates of each variant
- n1, n2 = sample sizes of each variant
- p_pooled = (x1 + x2) / (n1 + n2)
- x1, x2 = number of conversions
```

#### Implementation

```typescript
function calculateConversionSignificance(
  control: { conversions: number; visitors: number },
  test: { conversions: number; visitors: number }
): ConversionTestResult {
  const p1 = control.conversions / control.visitors;
  const p2 = test.conversions / test.visitors;

  // Pooled proportion
  const pPooled =
    (control.conversions + test.conversions) /
    (control.visitors + test.visitors);

  // Standard error
  const se = Math.sqrt(
    pPooled * (1 - pPooled) * (1 / control.visitors + 1 / test.visitors)
  );

  // Z-score
  const z = se === 0 ? 0 : (p2 - p1) / se;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return {
    controlRate: p1,
    testRate: p2,
    lift: calculateLift(p1, p2),
    zScore: z,
    pValue,
    significant: pValue < 0.05,
    confidenceLevel: 0.95,
  };
}
```

### Welch's T-Test (Revenue)

Used to compare average order values between variants when variances may differ.

#### Formula

```
t = (x̄1 - x̄2) / sqrt(s1²/n1 + s2²/n2)

Degrees of freedom (Welch-Satterthwaite):
df = (s1²/n1 + s2²/n2)² / ((s1²/n1)²/(n1-1) + (s2²/n2)²/(n2-1))
```

#### Implementation

```typescript
function calculateRevenueSignificance(
  control: { revenues: number[]; mean: number; variance: number },
  test: { revenues: number[]; mean: number; variance: number }
): RevenueTestResult {
  const n1 = control.revenues.length;
  const n2 = test.revenues.length;

  if (n1 < 2 || n2 < 2) {
    return { significant: false, reason: "Insufficient data" };
  }

  // Standard error
  const se = Math.sqrt(control.variance / n1 + test.variance / n2);

  // T-statistic
  const t = se === 0 ? 0 : (test.mean - control.mean) / se;

  // Welch-Satterthwaite degrees of freedom
  const v1 = control.variance / n1;
  const v2 = test.variance / n2;
  const df = Math.pow(v1 + v2, 2) / (
    Math.pow(v1, 2) / (n1 - 1) + Math.pow(v2, 2) / (n2 - 1)
  );

  // P-value from t-distribution
  const pValue = 2 * (1 - tCDF(Math.abs(t), df));

  return {
    controlMean: control.mean,
    testMean: test.mean,
    lift: calculateLift(control.mean, test.mean),
    tStatistic: t,
    degreesOfFreedom: df,
    pValue,
    significant: pValue < 0.05,
  };
}
```

---

## Confidence Intervals

### For Conversion Rate (Wilson Score)

The Wilson score interval is preferred for proportions as it handles edge cases better:

```typescript
function wilsonConfidenceInterval(
  conversions: number,
  visitors: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  const p = conversions / visitors;
  const n = visitors;
  const z = normalInverseCDF(1 - (1 - confidence) / 2);

  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt(
    (p * (1 - p) + z * z / (4 * n)) / n
  );

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

// Example: 50 conversions out of 1000 visitors
const ci = wilsonConfidenceInterval(50, 1000);
// { lower: 0.038, upper: 0.065 } = 3.8% to 6.5%
```

### For Revenue (Standard)

```typescript
function revenueConfidenceInterval(
  mean: number,
  stdDev: number,
  n: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  const z = normalInverseCDF(1 - (1 - confidence) / 2);
  const margin = z * (stdDev / Math.sqrt(n));

  return {
    lower: mean - margin,
    upper: mean + margin,
  };
}
```

---

## Sample Size Requirements

### Minimum Sample Size Calculator

To detect a given effect size with adequate power (typically 80%):

```typescript
function calculateRequiredSampleSize(
  baselineRate: number,      // Current conversion rate (e.g., 0.05)
  minimumDetectableEffect: number, // Minimum lift to detect (e.g., 0.1 for 10%)
  power: number = 0.8,        // Statistical power (typically 80%)
  significance: number = 0.05 // Significance level (typically 5%)
): number {
  const p1 = baselineRate;
  const p2 = baselineRate * (1 + minimumDetectableEffect);

  const zAlpha = normalInverseCDF(1 - significance / 2);
  const zBeta = normalInverseCDF(power);

  const pBar = (p1 + p2) / 2;

  const n =
    Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) /
    Math.pow(p2 - p1, 2);

  return Math.ceil(n);
}

// Example: 5% baseline, detect 10% lift
const required = calculateRequiredSampleSize(0.05, 0.1);
// ~31,000 visitors per variant
```

### Quick Reference Table

| Baseline Rate | Minimum Lift | Required per Variant |
|---------------|--------------|---------------------|
| 1% | 10% | ~390,000 |
| 1% | 20% | ~100,000 |
| 2% | 10% | ~190,000 |
| 2% | 20% | ~48,000 |
| 5% | 10% | ~73,000 |
| 5% | 20% | ~19,000 |
| 10% | 10% | ~35,000 |
| 10% | 20% | ~9,000 |

### Time Estimation

```typescript
function estimateDaysToSignificance(
  requiredSamplePerVariant: number,
  dailyTraffic: number,
  numVariants: number = 2
): number {
  const totalRequired = requiredSamplePerVariant * numVariants;
  return Math.ceil(totalRequired / dailyTraffic);
}

// Example: Need 20,000 per variant, 1,000 daily visitors
const days = estimateDaysToSignificance(20000, 1000, 2);
// 40 days
```

---

## When to Stop Tests

### Decision Rules

| Scenario | Action | Criteria |
|----------|--------|----------|
| **Clear winner** | Stop & implement | p < 0.05 with practical significance |
| **No effect** | Stop & keep control | p > 0.05 after full sample |
| **Harmful** | Stop immediately | Significant negative effect |
| **Inconclusive** | Continue or abandon | Insufficient sample size |

### Stopping Guidelines

1. **Never stop early for positive results** - This inflates false positive rate
2. **Pre-define stopping rules** - Decide criteria before starting
3. **Reach minimum sample size** - Wait for statistical power
4. **Consider practical significance** - A 0.1% lift may be significant but not valuable

### Sequential Testing (Optional)

For tests that need early stopping, use sequential analysis:

```typescript
function checkSequentialSignificance(
  currentStats: TestStats,
  targetSampleSize: number,
  alphaSpend: number = 0.025 // O'Brien-Fleming spending function
): SequentialResult {
  const fractionComplete = currentStats.visitors / targetSampleSize;

  // Adjust significance threshold based on fraction complete
  const adjustedAlpha = alphaSpend * Math.pow(fractionComplete, 2);

  return {
    canStop: currentStats.pValue < adjustedAlpha,
    currentAlpha: adjustedAlpha,
    fractionComplete,
  };
}
```

---

## Common Pitfalls

### 1. Peeking Problem

**Problem:** Checking results repeatedly inflates false positive rate.

**Solution:** Pre-define check points or use sequential testing.

```
❌ Check results daily and stop when p < 0.05
✅ Wait for target sample size, then check once
✅ Use sequential testing with alpha spending
```

### 2. Multiple Comparisons

**Problem:** Testing many variants increases false positives.

**Solution:** Apply Bonferroni correction.

```typescript
function bonferroniCorrection(
  pValues: number[],
  alpha: number = 0.05
): number[] {
  const adjustedAlpha = alpha / pValues.length;
  return pValues.map(p => p < adjustedAlpha);
}
```

### 3. Sample Ratio Mismatch

**Problem:** Unequal traffic split suggests implementation issues.

**Solution:** Check split before analyzing results.

```typescript
function checkSampleRatioMismatch(
  expected: number[], // [50, 50] for 50/50 split
  observed: number[]  // [4800, 5200] actual counts
): { hasMismatch: boolean; chiSquare: number } {
  const total = observed.reduce((a, b) => a + b, 0);
  const expectedCounts = expected.map(e => (e / 100) * total);

  let chiSquare = 0;
  for (let i = 0; i < observed.length; i++) {
    chiSquare += Math.pow(observed[i] - expectedCounts[i], 2) / expectedCounts[i];
  }

  // 1 degree of freedom for 2 variants
  const pValue = 1 - chiSquareCDF(chiSquare, expected.length - 1);

  return {
    hasMismatch: pValue < 0.001, // Very strict threshold
    chiSquare,
  };
}
```

### 4. Novelty Effect

**Problem:** New variants may perform better initially due to novelty.

**Solution:** Run tests for at least 2 full business cycles (typically 2+ weeks).

### 5. Selection Bias

**Problem:** Only tracking certain visitors skews results.

**Solution:** Ensure all visitors are tracked, even those who don't convert.

---

## Practical Guidelines

### Test Design Checklist

- [ ] Define primary metric (conversion rate or revenue)
- [ ] Set minimum detectable effect (typically 5-20%)
- [ ] Calculate required sample size
- [ ] Estimate test duration
- [ ] Define stopping rules
- [ ] Document hypothesis

### Interpreting Results

#### Significant Positive Result (p < 0.05, positive lift)

```
✅ The test variant performs better than control
✅ Safe to implement with confidence
⚠️ Consider practical significance (is the lift valuable?)
```

#### Significant Negative Result (p < 0.05, negative lift)

```
❌ The test variant performs worse than control
❌ Do NOT implement
✅ Keep the control variant
```

#### Non-Significant Result (p >= 0.05)

```
⚠️ Cannot conclude there is a difference
⚠️ Does NOT mean variants are equal
Options:
  1. Continue collecting data
  2. Accept control as winner (conservative)
  3. Run new test with larger effect size
```

### Reporting Results

```typescript
interface TestReport {
  testName: string;
  duration: string;
  primaryMetric: "conversion_rate" | "revenue";

  control: {
    visitors: number;
    conversions: number;
    rate: string; // "5.2%"
    confidenceInterval: string; // "4.8% - 5.6%"
  };

  test: {
    visitors: number;
    conversions: number;
    rate: string;
    confidenceInterval: string;
  };

  results: {
    lift: string; // "+12.5%"
    pValue: number;
    significant: boolean;
    recommendation: "IMPLEMENT" | "KEEP_CONTROL" | "CONTINUE" | "INCONCLUSIVE";
  };
}
```

### Example Report

```
Test: Homepage CTA Color Change
Duration: 14 days (2024-01-01 to 2024-01-14)
Primary Metric: Conversion Rate

CONTROL (Blue CTA)
  Visitors: 25,432
  Conversions: 1,271
  Conversion Rate: 5.00% (95% CI: 4.73% - 5.27%)

TEST (Green CTA)
  Visitors: 25,567
  Conversions: 1,432
  Conversion Rate: 5.60% (95% CI: 5.32% - 5.89%)

RESULTS
  Lift: +12.0%
  p-value: 0.0023
  Statistical Significance: YES (95% confidence)

RECOMMENDATION: IMPLEMENT
The green CTA shows a statistically significant 12% improvement
in conversion rate. Implement the change.
```

---

## Mathematical Functions

### Normal CDF

```typescript
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}
```

### Normal Inverse CDF

```typescript
function normalInverseCDF(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error("p must be between 0 and 1");
  }

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}
```
