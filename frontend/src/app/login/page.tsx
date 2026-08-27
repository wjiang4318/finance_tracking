import Link from 'next/link'
import { ArrowLeft, PieChart } from 'lucide-react'
import AuthForm from '@/components/AuthForm'

export default function LoginPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f4f4fb]">
      <header className="mx-auto flex h-[68px] w-full max-w-6xl items-center px-5 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-gray-600
                     transition-colors hover:text-gray-900"
        >
          <ArrowLeft size={15} strokeWidth={1.5} />
          Back
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-20 sm:px-8">
        <div className="w-full max-w-[26rem]">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <PieChart size={18} strokeWidth={2} className="text-white" />
          </span>

          <h1 className="mt-6 text-center text-2xl font-semibold tracking-[-0.02em] text-gray-900">
            Welcome back
          </h1>
          <p className="mt-2 text-center text-sm text-gray-500">
            Sign in to pick up where your spending left off.
          </p>

          <div className="mt-8 rounded-2xl border border-gray-200/80 bg-white p-7
                          shadow-[0_1px_2px_rgba(24,24,50,0.04),0_18px_40px_-24px_rgba(24,24,50,0.18)]">
            <AuthForm autoFocus />
          </div>
        </div>
      </main>
    </div>
  )
}
