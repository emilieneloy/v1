import Link from "next/link";
import { getUser } from "@v1/supabase/queries";
import { redirect } from "next/navigation";
import { SignOut } from "@/components/sign-out";

// Mock user for development mode
const DEV_USER = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = await getUser();

  // Use mock user in development mode
  const user = data?.user ?? (process.env.NODE_ENV === "development" ? DEV_USER : null);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                  <span className="font-bold text-white text-sm">AB</span>
                </div>
                <span className="font-semibold text-lg">Price Testing</span>
              </Link>

              <nav className="hidden md:flex items-center gap-6">
                <Link
                  href="/"
                  className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/tests"
                  className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
                >
                  Tests
                </Link>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-zinc-500">
                {user.email}
              </span>
              <SignOut />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
