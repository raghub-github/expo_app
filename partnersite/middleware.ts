import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

/** Thin wrapper so the middleware entry emits a stable `middleware` export for the bundler. */
export async function middleware(request: NextRequest) {
  return proxy(request);
}

// Must live in this file (not re-exported) so Next can statically parse route segment config.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
