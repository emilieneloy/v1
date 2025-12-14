import Link from "next/link";
import { getTests } from "@v1/supabase/queries";

export const metadata = {
  title: "Tests - A/B Price Testing",
};

export default async function TestsPage() {
  const { data: tests } = await getTests();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Tests</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Manage your A/B price tests
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

      {/* Tests Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {tests && tests.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Test
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Variants
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-zinc-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {tests.map((test) => (
                <tr
                  key={test.id}
                  className="hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/tests/${test.id}`}
                      className="flex items-center gap-3"
                    >
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
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
                        <p className="font-medium text-zinc-100 hover:text-emerald-400 transition-colors">
                          {test.name}
                        </p>
                        {test.description && (
                          <p className="text-sm text-zinc-500 truncate max-w-md">
                            {test.description}
                          </p>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
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
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {test.variants?.length || 0} variants
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-400">
                    {test.created_at
                      ? new Date(test.created_at).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/tests/${test.id}`}
                      className="text-sm text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
