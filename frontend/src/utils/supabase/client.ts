import { createBrowserClient } from '@supabase/ssr'
// createBrowserClient → Supabase's helper specifically for browser/client-side code

export function createClient() {
  // This function is called wherever a component needs to talk to Supabase
  // It returns a Supabase client pre-configured with your project's URL and anon key
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,       // your Supabase project URL from .env.local
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!   // safe public key (not the service key)
    // The ! at the end tells TypeScript "trust me, this value exists" (it's in .env.local)
  )
}
