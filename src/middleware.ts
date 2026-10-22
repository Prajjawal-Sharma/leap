import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { safeNext } from "@/lib/auth/safe-next";

// /auth/reset-password is deliberately absent: this list bounces
// authenticated users away, and a recovery-link user gains a session the
// moment the code is exchanged — bouncing them would break the reset flow.
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];
const DASHBOARD_PREFIXES = [
  "/dashboard",
  "/jobs",
  "/resume",
  "/applications",
  "/chat",
  "/insights",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, searchParams } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.some((p) => pathname.startsWith(p));
  const isDashboardRoute = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && isDashboardRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    // Setting .pathname alone can't change the host, but route ?next=
    // through the shared guard anyway: one rule for every read site, and it
    // also blocks attacker-forced internal paths like "/\evil.com".
    url.pathname = safeNext(searchParams.get("next"));
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
