import Link from "next/link";

/** Lightweight 404 — avoids relying only on Next's builtin global-not-found bundle. */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#E6F6F5] px-4">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="text-sm text-gray-600">The page you requested does not exist.</p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
