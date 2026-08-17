import { auth } from '@/auth';
import { isAllowedAdminEmail } from '@/lib/adminAccess';

const protectedPrefixes = ['/exam', '/test', '/practical', '/sqld', '/aiprompt', '/mypage'];
const requireLoginForProtectedRoutes = String(process.env.REQUIRE_LOGIN_FOR_PROTECTED_ROUTES || '0') === '1';

export default auth((req) => {
  const { pathname, origin } = req.nextUrl;
  const isPublicAiLab = pathname === '/admin/ai-lab';
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isPublicAiLab || (!isProtected && !isAdminPage && !isAdminApi)) return;

  const email = String(req.auth?.user?.email || '').trim();
  const isSignedIn = Boolean(email);

  if (isProtected) {
    if (!requireLoginForProtectedRoutes) return;
    if (isSignedIn) return;
    return Response.redirect(new URL('/', origin));
  }

  if (isAdminPage || isAdminApi) {
    if (isSignedIn && isAllowedAdminEmail(email)) return;

    if (isAdminApi) {
      return Response.json({ ok: false, message: 'forbidden' }, { status: 403 });
    }
    return Response.redirect(new URL(`/api/auth/signin?callbackUrl=${encodeURIComponent(req.nextUrl.pathname)}`, origin));
  }

  return;
});

export const config = {
  matcher: [
    '/exam/:path*',
    '/test/:path*',
    '/practical/:path*',
    '/sqld/:path*',
    '/aiprompt/:path*',
    '/mypage/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
