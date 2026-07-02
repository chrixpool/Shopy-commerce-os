import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import { auth } from './lib/auth';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);
const PUBLIC_PATHS = ['/sign-in', '/sign-up'];

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const segments = pathname.split('/');
  const locale = routing.locales.includes(segments[1] as (typeof routing.locales)[number])
    ? segments[1]
    : routing.defaultLocale;
  const pathWithoutLocale = pathname.replace(/^\/(en|fr|ar)/, '') || '/';
  const isPublic = PUBLIC_PATHS.some((path) => pathWithoutLocale.startsWith(path));

  if (!request.auth && !isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/sign-in`, request.url));
  }

  if (request.auth && isPublic) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return intlMiddleware(request);
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
