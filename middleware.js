import { next } from '@vercel/functions';
import {
  SESSION_COOKIE,
  parseCookies,
  verifySession,
} from './lib/auth.js';

export const config = {
  runtime: 'nodejs',
  matcher: [
    '/members.html',
    '/bidding.html',
    '/guides.html',
    '/planner.html',
    '/profile.html',
    '/roster.html'
  ],
};

export default function middleware(request) {
  const secret = process.env.SESSION_SECRET;
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const session = verifySession(cookies[SESSION_COOKIE], secret);

  if (!session) {
    const url = new URL('/login.html', request.url);
    const current = new URL(request.url);
    url.searchParams.set('next', current.pathname + current.search);
    return Response.redirect(url, 302);
  }

  const pathname = new URL(request.url).pathname;
  if (pathname === '/roster.html' && !['Council', 'Officer'].includes(session.role)) {
    return Response.redirect(new URL('/members.html', request.url), 302);
  }

  return next();
}
