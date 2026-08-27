import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
// NextResponse → lets middleware return responses (redirect, continue, etc.)
// NextRequest  → the incoming request object (has URL, cookies, headers)

export async function proxy(request: NextRequest) {
  // This function runs on EVERY page request before anything else loads
  // Think of it as a security guard checking IDs at the door

  let supabaseResponse = NextResponse.next({ request })
  // Default: let the request through (we'll override this if the user isn't logged in)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
          // Read cookies from the incoming request to find the user's session
        },
        setAll(cookiesToSet) {
          // When Supabase refreshes the session token, write updated cookies
          // to both the request and the response so they stay in sync
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  // Ask Supabase: is there a logged-in user for this session?
  // user → the logged-in user object, or null if not logged in

  const { pathname } = request.nextUrl

  // Pages a signed-out visitor is allowed to see: the landing page and the sign-in page
  const isPublicPage = pathname === '/' || pathname.startsWith('/login')

  if (!user && !isPublicPage) {
    // Not logged in AND trying to access a protected page (dashboard, transactions, etc.)
    // → redirect them to /login
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isPublicPage) {
    // Already signed in, so the landing and sign-in pages have nothing to offer
    // → redirect them to /dashboard
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
  // All checks passed → let the request through normally
}

export const config = {
  matcher: [
    // Run middleware on all routes EXCEPT Next.js internals and static files
    // (no point checking auth on .svg, .png, .css files etc.)
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
