import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('No authorization code provided.')}`);
  }

  // Temporary response to capture cookies set by Supabase
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message || 'Authentication failed.')}`);
  }

  const email = data.user.email?.toLowerCase().trim() || '';

  // 1. Verify official college domain (@nitkkr.ac.in)
  if (!email.endsWith('@nitkkr.ac.in')) {
    await supabase.auth.signOut();
    const deniedResponse = NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Access denied: Only official @nitkkr.ac.in college Google accounts are permitted.')}`
    );
    // Remove session cookies
    res.cookies.getAll().forEach((cookie) => deniedResponse.cookies.delete(cookie.name));
    return deniedResponse;
  }

  // 2. Check profile state
  const { data: profile } = await supabase
    .from('users')
    .select('role, approval_status, roll_number, year')
    .eq('id', data.user.id)
    .single();

  let targetPath = '/dashboard';

  if (!profile || !profile.roll_number || !profile.year) {
    // Incomplete profile -> onboarding
    targetPath = '/onboarding';
  } else if (profile.role === 'admin') {
    targetPath = '/admin';
  } else if (profile.approval_status !== 'approved') {
    targetPath = '/pending';
  }

  const redirectResponse = NextResponse.redirect(`${origin}${targetPath}`);
  
  // Forward all auth cookies to the redirect response
  res.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
  });

  return redirectResponse;
}
