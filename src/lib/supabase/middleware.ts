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
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  console.log('Middleware Path:', request.nextUrl.pathname);
  console.log('All Cookies:', request.cookies.getAll().map(c => c.name));
  console.log('User ID:', user?.id, 'User Error:', userError?.message);

  const isProtected = request.nextUrl.pathname.startsWith('/mentor') ||
                      request.nextUrl.pathname.startsWith('/mentee') ||
                      request.nextUrl.pathname.startsWith('/admin');

  if (isProtected && !user) {
    console.log('Redirecting to /login because !user');
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // Only check DB if we are hitting a page route that needs it
    const isAppPage = request.nextUrl.pathname === '/login' ||
                      request.nextUrl.pathname === '/signup' ||
                      request.nextUrl.pathname === '/pending' ||
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
        .select('role, approval_status')
        .eq('id', user.id)
        .single();

      if (profile) {
        // Enforce approval status
        if (profile.role !== 'admin' && profile.approval_status !== 'approved') {
          // If not approved, force them to /pending (unless they are admin)
          if (request.nextUrl.pathname !== '/pending') {
            return NextResponse.redirect(new URL('/pending', request.url));
          }
        } else {
          // They are approved (or admin). Let's redirect if they are on auth/pending pages
          if (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup' || request.nextUrl.pathname === '/pending') {
            if (profile.role === 'admin') {
              return NextResponse.redirect(new URL('/admin', request.url));
            } else if (profile.role === 'mentor') {
              return NextResponse.redirect(new URL('/mentor', request.url));
            } else {
              return NextResponse.redirect(new URL('/mentee', request.url));
            }
          }
          
          // Role-based protection
          if (request.nextUrl.pathname.startsWith('/admin') && profile.role !== 'admin') {
            return NextResponse.redirect(new URL(profile.role === 'mentor' ? '/mentor' : '/mentee', request.url));
          }
        }
      }
    }
  }

  return response;
}
