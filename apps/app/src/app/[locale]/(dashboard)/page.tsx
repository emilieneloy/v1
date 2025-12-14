import Link from "next/link";
import { getTests } from "@v1/supabase/queries";
import { formatCurrency, formatPercentage } from "@v1/lib/stats";

export const metadata = {
  title: "Dashboard - A/B Price Testing",
};

export default async function DashboardPage() {
  const { data: tests } = await getTests();

  const activeTests = tests?.filter((t) => t.status === "active") || [];
  const totalTests = tests?.length || 0;

  // Calculate aggregate stats from all tests
  const stats = {
    activeTests: activeTests.length,
    totalTests,
    totalVisitors: 0,
    totalConversions: 0,
    totalRevenue: 0,
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Overview of your A/B price testing performance
          </p>
        </div>
        <Link
          href="/tests/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Test
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <svg
                className="w-5 h-5 text-emerald-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Active Tests</p>
              <p className="text-2xl font-semibold text-zinc-100">
                {stats.activeTests}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <svg
                className="w-5 h-5 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Total Tests</p>
              <p className="text-2xl font-semibold text-zinc-100">
                {stats.totalTests}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <svg
                className="w-5 h-5 text-purple-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Total Visitors</p>
              <p className="text-2xl font-semibold text-zinc-100">
                {stats.totalVisitors.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <svg
                className="w-5 h-5 text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Total Revenue</p>
              <p className="text-2xl font-semibold text-zinc-100">
                {formatCurrency(stats.totalRevenue)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tests */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">Recent Tests</h2>
            <Link
              href="/tests"
              className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
            >
              View all
            </Link>
          </div>
        </div>

        {tests && tests.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {tests.slice(0, 5).map((test) => (
              <Link
                key={test.id}
                href={`/tests/${test.id}`}
                className="flex items-center justify-between p-6 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      test.status === "active"
                        ? "bg-emerald-500"
                        : test.status === "paused"
                        ? "bg-amber-500"
                        : test.status === "completed"
                        ? "bg-blue-500"
                        : "bg-zinc-500"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-zinc-100">{test.name}</p>
                    <p className="text-sm text-zinc-500">
                      {test.variants?.length || 0} variants
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
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
                  <svg
                    className="w-5 h-5 text-zinc-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-zinc-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-zinc-100 mb-2">
              No tests yet
            </h3>
            <p className="text-sm text-zinc-500 mb-6">
              Create your first A/B test to start optimizing prices
            </p>
            <Link
              href="/tests/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Create Test
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
