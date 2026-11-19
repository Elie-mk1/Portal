import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, sessionToken } from './lib/auth';

// Every page needs the portal passcode (fake data, but still candidate profiles).
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();
  if (!process.env.PORTAL_PASSWORD) return NextResponse.next(); // no password configured → open (local dev)
  const ok = req.cookies.get(COOKIE)?.value === (await sessionToken());
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '?next=' + encodeURIComponent(pathname + search);
  return NextResponse.redirect(url);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
