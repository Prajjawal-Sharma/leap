import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { decideRoute } from "@/lib/auth/route-guard";

// Next 16's `proxy` convention (formerly `middleware`). It runs on the Node.js
// runtime, where middleware ran on Edge; nothing below depends on either —
// @supabase/ssr only reads and writes cookies through the callbacks given
// here. The route lists and the decision live in src/lib/auth/route-guard.ts.
export async function proxy(request: NextRequest) {
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
  const decision = decideRoute(pathname, searchParams.get("next"), Boolean(user));

  if (decision.action === "to-login") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", decision.next);
    return NextResponse.redirect(url);
  }

  if (decision.action === "to-app") {
    const url = request.nextUrl.clone();
    url.pathname = decision.pathname;
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
