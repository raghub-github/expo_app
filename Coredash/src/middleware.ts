import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  COREDASH_ACCESS_COOKIE,
  COREDASH_AUTH_STORAGE_KEY,
  COREDASH_COOKIE_OPTIONS,
  isCoredashAuthCookie,
} from "@/lib/auth/access";
import { expireCoredashCookies } from "@/lib/auth/clear";

const PUBLIC_PATHS = new Set(["/login", "/auth/callback"]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  return false;
}

function loginRedirect(request: NextRequest, pathname: string, wipe = false) {
  const login = new URL("/login", request.url);
  if (pathname && pathname !== "/" && pathname !== "/login") login.searchParams.set("redirect", pathname);
  const dest = NextResponse.redirect(login, 303);
  dest.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (wipe) expireCoredashCookies(dest, request.cookies.getAll().map((c) => c.name));
  return dest;
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return response;
}

function unauthorizedApi(wipeNames?: string[]) {
  const dest = NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
  dest.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  if (wipeNames) expireCoredashCookies(dest, wipeNames);
  return dest;
}

function deny(request: NextRequest, pathname: string, wipe = false) {
  const names = wipe ? request.cookies.getAll().map((c) => c.name) : undefined;
  if (pathname.startsWith("/api/")) {
    return unauthorizedApi(names);
  }
  return loginRedirect(request, pathname, wipe);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (isPublic(pathname)) return noStore(NextResponse.next());
    return deny(request, pathname);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: COREDASH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll().filter((c) => isCoredashAuthCookie(c.name));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
    auth: {
      storageKey: COREDASH_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    if (pathname === "/login" || pathname === "/auth/callback" || pathname.startsWith("/api/auth/")) {
      return noStore(response);
    }
    return deny(request, pathname, true);
  }

  const accessUid = request.cookies.get(COREDASH_ACCESS_COOKIE)?.value ?? "";
  const identityOk = Boolean(user?.id && accessUid === user.id);

  if (user && pathname === "/login") {
    if (!identityOk) {
      return noStore(response);
    }
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    const safe =
      redirectParam?.startsWith("/") &&
      !redirectParam.startsWith("//") &&
      !redirectParam.startsWith("/login") &&
      !redirectParam.startsWith("/auth")
        ? redirectParam
        : "/overview";
    const dest = NextResponse.redirect(new URL(safe, request.url), 303);
    dest.headers.set("Cache-Control", "no-store, private");
    return dest;
  }

  if (isPublic(pathname)) {
    return noStore(response);
  }

  if (!user) {
    return deny(request, pathname, true);
  }

  if (!identityOk) {
    return deny(request, pathname, true);
  }

  return noStore(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
