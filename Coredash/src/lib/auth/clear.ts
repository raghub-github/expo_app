import { NextResponse } from "next/server";
import {
  COREDASH_ACCESS_COOKIE,
  COREDASH_AUTH_COOKIE_NAME,
  accessCookieOptions,
  isCoredashSessionCookie,
} from "@/lib/auth/access";

export function expireCoredashCookies(response: NextResponse, names: string[] = []) {
  const seen = new Set<string>();
  const expire = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    response.cookies.set(name, "", {
      ...accessCookieOptions(),
      maxAge: 0,
    });
  };

  for (const name of names) {
    if (isCoredashSessionCookie(name)) expire(name);
  }
  expire(COREDASH_ACCESS_COOKIE);
  expire(COREDASH_AUTH_COOKIE_NAME);
  expire(`${COREDASH_AUTH_COOKIE_NAME}-code-verifier`);
  for (let i = 0; i < 8; i += 1) {
    expire(`${COREDASH_AUTH_COOKIE_NAME}.${i}`);
  }
}
