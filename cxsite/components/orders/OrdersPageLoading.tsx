/** Shared loading shell — keep identical wherever orders page waits (Suspense, auth, fetch). */
export default function OrdersPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-[#16c2a5] border-t-transparent" />
        <p className="text-sm text-gray-500">Loading your orders…</p>
      </div>
    </div>
  )
}
