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

  // Refresh the session — this keeps the user logged in
  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = request.nextUrl.pathname.startsWith('/dashboard') ||
                      request.nextUrl.pathname.startsWith('/admin') ||
                      request.nextUrl.pathname.startsWith('/profile');

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Only check DB if we are hitting a page route that needs it
    const isAppPage = request.nextUrl.pathname === '/login' ||
                      request.nextUrl.pathname === '/signup' ||
                      request.nextUrl.pathname === '/pending' ||
                      request.nextUrl.pathname === '/onboarding' ||
                      isProtected;

    if (isAppPage) {
      const supabaseAdmin = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll() {},
          },
        }
      );
      
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('role, approval_status, roll_number, year')
        .eq('id', user.id)
        .single();

      // 1. Incomplete profile check (e.g. fresh Google OAuth sign-in)
      const isProfileIncomplete = !profile || !profile.roll_number || !profile.year;
      if (isProfileIncomplete && profile?.role !== 'admin') {
        if (request.nextUrl.pathname !== '/onboarding') {
          return NextResponse.redirect(new URL('/onboarding', request.url));
        }
        return response;
      }

      // 2. Already completed profile trying to visit /onboarding
      if (request.nextUrl.pathname === '/onboarding') {
        if (profile?.role === 'admin') {
          return NextResponse.redirect(new URL('/admin', request.url));
        } else if (profile?.approval_status === 'approved') {
          return NextResponse.redirect(new URL('/dashboard', request.url));
        } else {
          return NextResponse.redirect(new URL('/pending', request.url));
        }
      }

      if (profile) {
        // Enforce approval status
        if (profile.role !== 'admin' && profile.approval_status !== 'approved') {
          // If not approved, force them to /pending (unless they are admin)
          if (request.nextUrl.pathname !== '/pending') {
            return NextResponse.redirect(new URL('/pending', request.url));
          }
        } else {
          // They are approved (or admin). Let's redirect if they are on auth/pending pages
          if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup' || request.nextUrl.pathname === '/pending' || request.nextUrl.pathname === '/') {
            if (profile.role === 'admin') {
              return NextResponse.redirect(new URL('/admin', request.url));
            } else {
              return NextResponse.redirect(new URL('/dashboard', request.url));
            }
          }
          
          // Role-based protection
          if (request.nextUrl.pathname.startsWith('/admin') && profile.role !== 'admin') {
            return NextResponse.redirect(new URL('/dashboard', request.url));
          }
        }
      }
    }
  }

  return response;
}
