import Link from 'next/link'
import { FileText, Sparkles, PieChart, ShieldCheck } from 'lucide-react'
import Hero from '@/components/landing/Hero'
import Reveal from '@/components/landing/Reveal'
import { BreakdownPreview, LedgerPreview } from '@/components/landing/previews'
import AuthForm from '@/components/AuthForm'

const STEPS = [
  {
    icon: FileText,
    label: 'Upload',
    body: 'Drop in the statement PDF your bank already emails you. Chase, Capital One, Bank of America and Marcus are supported.',
  },
  {
    icon: Sparkles,
    label: 'Categorize',
    body: 'Each line is read and sorted into one of twelve categories. Duplicate statements are detected and skipped.',
  },
  {
    icon: PieChart,
    label: 'Review',
    body: 'See the month by category, compare it against last year, and correct anything that landed in the wrong place.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#f4f4fb]">

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-[#f4f4fb]/85 backdrop-blur-md">
        <nav className="mx-auto flex h-[68px] w-full max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 rounded-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <PieChart size={15} strokeWidth={2} className="text-white" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-gray-900">
              Expense Tracker
            </span>
          </Link>
          <Link
            href="#sign-in"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-[10px]
                       bg-indigo-600 px-4 py-2 text-sm font-semibold text-white
                       transition-[background-color,transform] duration-200
                       hover:bg-indigo-700 active:translate-y-px"
          >
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <Hero />

        {/* Bento: one wide cell, two supporting cells */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
          <Reveal>
            <h2 className="max-w-[20ch] text-3xl font-semibold tracking-[-0.025em] text-gray-900 sm:text-4xl">
              A month of spending, already sorted.
            </h2>
            <p className="mt-4 max-w-[58ch] text-base leading-relaxed text-gray-600">
              The work of reading a statement line by line is done before you open it.
            </p>
          </Reveal>

          <Reveal delay={0.05} className="mt-10">
            <div className="grid gap-4 lg:grid-cols-5">
              <div className="rounded-2xl border border-gray-200/80 bg-white p-6 lg:col-span-3">
                <BreakdownPreview />
              </div>
              <div className="rounded-2xl border border-gray-200/80 bg-white p-6 lg:col-span-2">
                <LedgerPreview />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Process flow: icons sitting on a continuous rule */}
        <section className="border-y border-gray-200/70 bg-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <Reveal>
              <h2 className="max-w-[26ch] text-3xl font-semibold tracking-[-0.025em] text-gray-900 sm:text-4xl">
                Three steps, then you are done.
              </h2>
            </Reveal>

            <Reveal delay={0.05} className="mt-12">
              <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
                {STEPS.map(({ icon: Icon, label, body }, i) => (
                  <li key={label} className="relative">
                    {/* Rule bridging this marker to the next one, so the three read
                        as a sequence rather than three separate columns */}
                    {i < STEPS.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute left-12 right-[-2rem] top-5 hidden h-px bg-gray-200 md:block"
                      />
                    )}
                    <span
                      className="relative flex h-10 w-10 items-center justify-center rounded-full
                                 border border-gray-200 bg-white text-indigo-600"
                    >
                      <Icon size={17} strokeWidth={1.5} />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight text-gray-900">
                      {label}
                    </h3>
                    <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-gray-600">
                      {body}
                    </p>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>

        {/* Trust statement */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
          <Reveal>
            <div className="rounded-2xl bg-indigo-50 px-7 py-12 sm:px-12 lg:px-16 lg:py-16">
              <ShieldCheck size={26} strokeWidth={1.5} className="text-indigo-600" />
              <h2 className="mt-6 max-w-[22ch] text-3xl font-semibold tracking-[-0.025em] text-gray-900 sm:text-4xl">
                It never asks for your bank login.
              </h2>
              <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-indigo-950/70">
                There is no account linking and no third party sitting between you and your
                bank. You hand over the same PDF you could print yourself, and it stays tied
                to your account and nobody else&rsquo;s.
              </p>
            </div>
          </Reveal>
        </section>

        {/* Sign in */}
        <section id="sign-in" className="scroll-mt-[68px] border-t border-gray-200/70 bg-white">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
            <div className="mx-auto w-full max-w-[26rem]">
              <h2 className="text-center text-3xl font-semibold tracking-[-0.025em] text-gray-900">
                Start with one statement.
              </h2>
              <p className="mx-auto mt-3 max-w-[34ch] text-center text-base leading-relaxed text-gray-600">
                Create an account, upload a PDF, and your first month is ready in about
                fifteen seconds.
              </p>
              <div className="mt-9">
                <AuthForm />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200/70 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row
                        sm:items-center sm:justify-between sm:px-8">
          <span className="text-sm font-semibold tracking-tight text-gray-900">
            Expense Tracker
          </span>
          <span className="text-sm text-gray-500">
            A personal project for tracking your own spending.
          </span>
        </div>
      </footer>
    </div>
  )
}
