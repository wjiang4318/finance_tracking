"use client"
// Marks this as a client component — it runs in the browser, not on the server
// Required because we use useState and handle form interactions

import { useState } from 'react'
// useState → React hook for tracking values that change (email, password, loading, error)

import { useRouter } from 'next/navigation'
// useRouter → lets us redirect the user programmatically (e.g. push to /dashboard after login)

import { createClient } from '@/utils/supabase/client'
// Our browser Supabase client — handles signIn and signUp calls
// @/ is a shortcut for the src/ folder (configured in tsconfig.json)

export default function LoginPage() {
  // --- State: each useState tracks one piece of changing data ---
  const [email, setEmail]       = useState('')        // what the user types in email field
  const [password, setPassword] = useState('')        // what the user types in password field
  const [loading, setLoading]   = useState(false)     // true while waiting for Supabase response
  const [error, setError]       = useState('')         // error message to show under the form
  const [isSignUp, setIsSignUp] = useState(false)     // toggles between Sign In and Sign Up mode

  const router   = useRouter()       // for redirecting after successful login
  const supabase = createClient()    // our Supabase browser client

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // e.preventDefault() → stops the browser's default form behaviour (page reload)

    setLoading(true)   // show spinner on button
    setError('')       // clear any previous error

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      // signUp → creates a new account in Supabase Auth
      : await supabase.auth.signInWithPassword({ email, password })
      // signInWithPassword → checks credentials and returns a session

    if (error) {
      setError(error.message)   // show the error under the form (e.g. "Invalid login credentials")
      setLoading(false)         // re-enable the button
    } else {
      router.push('/dashboard') // redirect to dashboard on success
      router.refresh()          // tell Next.js to re-check the session (picks up new cookies)
    }
  }

  return (
    // min-h-screen → takes full viewport height
    // flex items-center justify-center → centres the card both vertically and horizontally
    // bg-gray-50 → light gray page background
    <div className="min-h-screen flex items-center justify-center bg-[#f4f4fb]">

      {/* The white card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

        {/* Title changes depending on mode */}
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          {isSignUp ? 'Create account' : 'Welcome back'}
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {isSignUp ? 'Sign up to track your spending' : 'Sign in to your finance tracker'}
        </p>

        {/* onSubmit → calls handleSubmit when the user hits the button */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Email field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}                          // controlled input — always shows state value
              onChange={e => setEmail(e.target.value)} // updates state on every keystroke
              required
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Password field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Error message — only renders if error string is non-empty */}
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            // disabled → prevents double-submits while waiting for Supabase
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Loading...' : isSignUp ? 'Create account' : 'Sign in'}
            {/* Shows different text depending on loading state and mode */}
          </button>
        </form>

        {/* Toggle between Sign In / Sign Up */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError('') }}
            // Flip the mode and clear any existing error when switching
            className="text-blue-600 font-medium hover:underline"
          >
            {isSignUp ? 'Sign in' : 'Sign up'}
          </button>
        </p>

      </div>
    </div>
  )
}
