import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Helper to preserve session cookies on all redirects
  const createRedirect = (pathOrUrl: string | URL) => {
    const redirectResponse = NextResponse.redirect(
      typeof pathOrUrl === 'string' ? new URL(pathOrUrl, request.url) : pathOrUrl
    );
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  };

  // Refresh the session — this keeps the user logged in
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = request.nextUrl.pathname.startsWith('/dashboard') ||
                      request.nextUrl.pathname.startsWith('/admin') ||
                      request.nextUrl.pathname.startsWith('/profile');

  if (isProtected && !user) {
    return createRedirect('/login');
  }

  if (user) {
    // Only check DB if we are hitting a page route that needs it
    const isAppPage = request.nextUrl.pathname === '/login' ||
                      request.nextUrl.pathname === '/signup' ||
                      request.nextUrl.pathname === '/pending' ||
                      request.nextUrl.pathname === '/onboarding' ||
                      isProtected;

    if (isAppPage) {
      const { data: profile } = await supabase
        .from('users')
        .select('role, approval_status, roll_number, year')
        .eq('id', user.id)
        .single();

      // Admin routing
      if (profile?.role === 'admin') {
        if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup' || request.nextUrl.pathname === '/pending' || request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/onboarding') {
          return createRedirect('/admin');
        }
        return response;
      }

      // 1. Incomplete profile check (e.g. fresh Google OAuth sign-in)
      const isProfileIncomplete = !profile || !profile.roll_number || !profile.year;
      if (isProfileIncomplete) {
        if (request.nextUrl.pathname !== '/onboarding') {
          return createRedirect('/onboarding');
        }
        return response;
      }

      // 2. Already completed profile trying to visit /onboarding
      if (request.nextUrl.pathname === '/onboarding') {
        if (profile?.approval_status === 'approved') {
          return createRedirect('/dashboard');
        } else {
          return createRedirect('/pending');
        }
      }

      if (profile) {
        // Enforce approval status
        if (profile.approval_status !== 'approved') {
          // If not approved, force them to /pending
          if (request.nextUrl.pathname !== '/pending') {
            return createRedirect('/pending');
          }
        } else {
          // They are approved. Let's redirect if they are on auth/pending pages
          if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup' || request.nextUrl.pathname === '/pending' || request.nextUrl.pathname === '/') {
            return createRedirect('/dashboard');
          }
          
          // Role-based protection: non-admins cannot access /admin
          if (request.nextUrl.pathname.startsWith('/admin')) {
            return createRedirect('/dashboard');
          }
        }
      }
    }
  }

  return response;
}
