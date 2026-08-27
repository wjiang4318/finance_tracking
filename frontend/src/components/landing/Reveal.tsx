'use client'
import { motion, useReducedMotion } from 'framer-motion'

/** Fades a section in as it enters the viewport. Static when reduced motion is on. */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const reduce = useReducedMotion()

  // `initial` stays constant across server and client. Branching it on useReducedMotion
  // would render differently on each and trip a hydration mismatch, so reduced motion
  // collapses the duration to zero instead: the element still lands, just instantly.
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.div>
  )
}
