import { createServerClient } from '@supabase/ssr'
// createServerClient → Supabase's helper for server-side code (runs before page is sent to browser)

import { cookies } from 'next/headers'
// Next.js built-in: lets server code read/write the browser's cookies
// Supabase stores your login session in a cookie — this is how the server reads it

export async function createClient() {
  const cookieStore = await cookies()
  // Get the current request's cookies (contains the user's session if they're logged in)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
          // Supabase calls this to read your session cookie and know who you are
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
              // Supabase calls this to update/refresh your session cookie
            )
          } catch {
            // If called from a pure Server Component, cookies can't be set
            // That's fine — middleware.ts handles the actual cookie refresh
          }
        },
      },
    }
  )
}
