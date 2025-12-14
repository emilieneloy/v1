import Link from "next/link";
import { notFound } from "next/navigation";
import { getTest, getTestResultsRealtime } from "@v1/supabase/queries";
import { analyzeTest, formatCurrency, formatPercentage, formatLift, type VariantStats } from "@v1/lib/stats";
import { TestActions } from "@/components/tests/test-actions";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { data: test } = await getTest(id);

  return {
    title: test ? `${test.name} - A/B Testing` : "Test Not Found",
  };
}

export default async function TestDetailPage({ params }: Props) {
  const { id } = await params;
  const { data: test, error } = await getTest(id);

  if (error || !test) {
    notFound();
  }

  // Get real-time results
  const { data: variantStats } = await getTestResultsRealtime(id);

  // Perform statistical analysis if we have data
  let analysis = null;
  if (variantStats && variantStats.length >= 2) {
    const control = variantStats[0];
    const variant = variantStats[1];

    if (control.visitors > 0 || variant.visitors > 0) {
      const controlStats: VariantStats = {
        visitors: control.visitors,
        conversions: control.conversions,
        revenue_cents: control.revenue_cents,
      };

      const variantStatsData: VariantStats = {
        visitors: variant.visitors,
        conversions: variant.conversions,
        revenue_cents: variant.revenue_cents,
      };

      analysis = analyzeTest(controlStats, variantStatsData);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/tests"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-100">{test.name}</h1>
            <span
              className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                test.status === "active"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : test.status === "paused"
                  ? "bg-amber-500/10 text-amber-500"
                  : test.status === "completed"
                  ? "bg-blue-500/10 text-blue-500"
                  : "bg-zinc-500/10 text-zinc-500"
              }`}
            >
              {test.status}
            </span>
          </div>
          {test.description && (
            <p className="text-sm text-zinc-500">{test.description}</p>
          )}
        </div>

        <TestActions testId={test.id} status={test.status || "draft"} />
      </div>

      {/* Analysis Summary */}
      {analysis && (
        <div
          className={`p-4 rounded-lg border ${
            analysis.winner === "variant"
              ? "bg-emerald-500/5 border-emerald-500/20"
              : analysis.winner === "control"
              ? "bg-amber-500/5 border-amber-500/20"
              : "bg-zinc-800/50 border-zinc-700"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg ${
                analysis.winner === "variant"
                  ? "bg-emerald-500/10"
                  : analysis.winner === "control"
                  ? "bg-amber-500/10"
                  : "bg-zinc-700"
              }`}
            >
              <svg
                className={`w-5 h-5 ${
                  analysis.winner === "variant"
                    ? "text-emerald-500"
                    : analysis.winner === "control"
                    ? "text-amber-500"
                    : "text-zinc-400"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-zinc-100">
                {analysis.winner === "none"
                  ? "No clear winner yet"
                  : analysis.winner === "variant"
                  ? "Variant is winning!"
                  : "Control is performing better"}
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                {analysis.recommendation}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {variantStats?.map((stat, index) => (
          <div
            key={stat.variant_id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-zinc-400">
                {stat.variant_name}
              </span>
              {index === 0 && (
                <span className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded">
                  Control
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-2xl font-semibold text-zinc-100">
                  {stat.visitors.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-500">Visitors</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-lg font-semibold text-zinc-100">
                    {stat.conversions.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-500">Conversions</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-zinc-100">
                    {formatPercentage(stat.conversion_rate)}
                  </p>
                  <p className="text-xs text-zinc-500">Conv. Rate</p>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Revenue</span>
                  <span className="font-semibold text-zinc-100">
                    {formatCurrency(stat.revenue_cents)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-sm text-zinc-500">RPV</span>
                  <span className="font-semibold text-zinc-100">
                    {formatCurrency(stat.revenue_per_visitor)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Statistical Significance */}
      {analysis && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-zinc-100 mb-4">
            Statistical Analysis
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Conversion Rate Analysis */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400">
                Conversion Rate
              </h3>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Control Rate</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {formatPercentage(analysis.conversion.controlRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Variant Rate</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {formatPercentage(analysis.conversion.variantRate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Relative Lift</span>
                  <span
                    className={`text-sm font-medium ${
                      analysis.conversion.relativeLift > 0
                        ? "text-emerald-500"
                        : analysis.conversion.relativeLift < 0
                        ? "text-red-500"
                        : "text-zinc-100"
                    }`}
                  >
                    {formatLift(analysis.conversion.relativeLift)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">P-Value</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {analysis.conversion.pValue.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Significant?</span>
                  <span
                    className={`text-sm font-medium ${
                      analysis.conversion.significant
                        ? "text-emerald-500"
                        : "text-zinc-400"
                    }`}
                  >
                    {analysis.conversion.significant ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>

            {/* Revenue Analysis */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-zinc-400">
                Revenue per Visitor
              </h3>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Control RPV</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {formatCurrency(analysis.revenue.controlRPV)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Variant RPV</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {formatCurrency(analysis.revenue.variantRPV)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Relative Lift</span>
                  <span
                    className={`text-sm font-medium ${
                      analysis.revenue.relativeLift > 0
                        ? "text-emerald-500"
                        : analysis.revenue.relativeLift < 0
                        ? "text-red-500"
                        : "text-zinc-100"
                    }`}
                  >
                    {formatLift(analysis.revenue.relativeLift)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">P-Value</span>
                  <span className="text-sm font-medium text-zinc-100">
                    {analysis.revenue.pValue.toFixed(4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Significant?</span>
                  <span
                    className={`text-sm font-medium ${
                      analysis.revenue.significant
                        ? "text-emerald-500"
                        : "text-zinc-400"
                    }`}
                  >
                    {analysis.revenue.significant ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variants Configuration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-6 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">
            Variant Configuration
          </h2>
        </div>

        <div className="divide-y divide-zinc-800">
          {test.variants?.map((variant: any, index: number) => (
            <div key={variant.id} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      index === 0 ? "bg-zinc-500" : "bg-emerald-500"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-zinc-100">{variant.name}</p>
                    <p className="text-sm text-zinc-500">
                      Weight: {variant.weight}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  {variant.discount_code && (
                    <div>
                      <span className="text-zinc-500">Discount: </span>
                      <code className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-300">
                        {variant.discount_code}
                      </code>
                    </div>
                  )}
                  {variant.price_modifier_cents && (
                    <div>
                      <span className="text-zinc-500">Price Modifier: </span>
                      <span
                        className={
                          variant.price_modifier_cents < 0
                            ? "text-emerald-500"
                            : "text-red-500"
                        }
                      >
                        {formatCurrency(variant.price_modifier_cents)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-zinc-100 mb-4">
          Test Information
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-zinc-500">Created</p>
            <p className="text-zinc-100">
              {test.created_at
                ? new Date(test.created_at).toLocaleDateString()
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Started</p>
            <p className="text-zinc-100">
              {test.started_at
                ? new Date(test.started_at).toLocaleDateString()
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Ended</p>
            <p className="text-zinc-100">
              {test.ended_at
                ? new Date(test.ended_at).toLocaleDateString()
                : "-"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500">Products</p>
            <p className="text-zinc-100">
              {test.product_ids?.length || 0} products
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
