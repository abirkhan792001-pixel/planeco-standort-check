import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        // No-cache headers from @supabase/ssr: a response that sets auth cookies must never be cached by a CDN.
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  // C-4: a server-action POST must not get an HTML redirect (the client cannot parse it and the action crashes). The
  // action checks the session itself and answers with an action redirect to /login. Pages still guard with requireUser().
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');
  if (!user && !isServerAction && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    // 307 for GET/HEAD; a form POST (e.g. the export) gets 303 so the browser follows with GET instead of re-posting.
    return NextResponse.redirect(url, request.method === 'GET' || request.method === 'HEAD' ? 307 : 303);
  }
  return response;
}

export const config = { matcher: ['/dashboard/:path*', '/login'] };
