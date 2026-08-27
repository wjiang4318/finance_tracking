'use client'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { SpendPreview } from './previews'

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * Asymmetric split hero: copy on the left, a live preview of the spending chart on
 * the right. The only choreographed entrance on the page; sections below use Reveal.
 */
export default function Hero() {
  const reduce = useReducedMotion()

  // `initial` must not depend on useReducedMotion: it resolves differently on the server
  // than in the browser and would trip a hydration mismatch. Reduced motion zeroes the
  // duration instead, so the hero lands in place with no animation.
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { duration: 0.6, delay, ease: EASE },
  })

  return (
    <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-20 sm:px-8 lg:pt-24 lg:pb-28">
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">

        <div className="lg:col-span-6">
          <motion.h1
            {...rise(0)}
            className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.03em]
                       text-gray-900 sm:text-5xl lg:text-[3.5rem]"
          >
            Know where your money went.
          </motion.h1>

          <motion.p
            {...rise(0.08)}
            className="mt-5 max-w-[46ch] text-lg leading-relaxed text-gray-600"
          >
            Upload a statement PDF. Every transaction gets sorted automatically, so you can
            see the month at a glance.
          </motion.p>

          <motion.div {...rise(0.16)} className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="#sign-in"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[10px]
                         bg-indigo-600 px-5 py-3 text-sm font-semibold text-white
                         transition-[background-color,transform] duration-200
                         hover:bg-indigo-700 active:translate-y-px"
            >
              Create an account
            </Link>
            <Link
              href="#sign-in"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-[10px]
                         border border-gray-300 bg-white px-5 py-3 text-sm font-semibold
                         text-gray-800 transition-[border-color,background-color,transform]
                         duration-200 hover:border-gray-400 hover:bg-gray-50 active:translate-y-px"
            >
              Sign in
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.75, delay: 0.2, ease: EASE }}
          className="lg:col-span-6"
        >
          <div className="rounded-2xl border border-gray-200/80 bg-white p-6
                          shadow-[0_1px_2px_rgba(24,24,50,0.04),0_18px_40px_-24px_rgba(24,24,50,0.22)]">
            <SpendPreview />
          </div>
        </motion.div>

      </div>
    </section>
  )
}
