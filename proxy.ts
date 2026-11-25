import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminEmail } from "@/lib/admin-access";

const PUBLIC = [/^\/$/, /^\/signin/, /^\/j\//, /^\/api\/cron/, /^\/auth\//, /^\/api\/auth\//];

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet, headers) {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          // a response that carries a session must never be stored by anything on the way
          Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // Refreshes the session cookie when needed. Keep this call directly after creating the client.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const path = request.nextUrl.pathname;

  // The admin pages don't exist for anyone else, signed in or not: a plain 404, no sign-in redirect.
  // The pages check again themselves (lib/admin.ts); this just keeps /admin from showing up at all.
  if (/^\/admin(\/|$)/.test(path) && !isAdminEmail(data?.claims?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = "/_not-found";
    url.search = "";
    const notFound = NextResponse.rewrite(url, { status: 404 });
    response.cookies.getAll().forEach((c) => notFound.cookies.set(c));
    return notFound;
  }

  if (!signedIn && !PUBLIC.some((r) => r.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // Pages are never saved by the browser. Without no-store, iOS keeps a copy in the Home Screen app's own folder and
  // puts it back, however old, after it ends the app's page in the background. Only pages: data requests and
  // prefetches don't ask for HTML, and the shell in front of them is still cached at the edge.
  if (request.headers.get("accept")?.includes("text/html")) response.headers.set("Cache-Control", NO_STORE);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_vercel|favicon.ico|sw.js|manifest.webmanifest|icons/|apple-icon|icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
