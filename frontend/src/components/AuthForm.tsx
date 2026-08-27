'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

/**
 * Email + password auth, shared by the landing page's sign-in section and /login
 * so both surfaces stay in sync. Toggles between sign in and sign up in place.
 */
export default function AuthForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [notice, setNotice]     = useState('')

  const router   = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    const { data, error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Sign-up with email confirmation on returns a user but no session — the account
    // is not usable until the link is clicked, so say that instead of bouncing them.
    if (isSignUp && !data.session) {
      setNotice('Check your inbox to confirm your email, then sign in.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const field =
    'w-full rounded-[10px] border border-gray-200 bg-white px-3.5 py-2.5 text-sm ' +
    'text-gray-900 placeholder:text-gray-400 transition-colors ' +
    'hover:border-gray-300 focus:border-indigo-600 focus:outline-none ' +
    'focus:ring-4 focus:ring-indigo-600/10'

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate={false}>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus={autoFocus}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className={field}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
            className={field}
          />
          {isSignUp && (
            <p className="text-xs text-gray-500">Use at least 6 characters.</p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-[10px] bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-[10px]
                     bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white
                     transition-[background-color,transform] duration-200
                     hover:bg-indigo-700 active:translate-y-px
                     disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 size={15} strokeWidth={2} className="animate-spin" />}
          {loading ? 'Working' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-500">
        {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
        <button
          type="button"
          onClick={() => { setIsSignUp(!isSignUp); setError(''); setNotice('') }}
          className="rounded-sm font-semibold text-indigo-600 underline-offset-4 hover:underline"
        >
          {isSignUp ? 'Sign in' : 'Create an account'}
        </button>
      </p>
    </div>
  )
}
