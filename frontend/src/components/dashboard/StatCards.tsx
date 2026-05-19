'use client'
import Image from 'next/image'
import CountUp from 'react-countup'
import { TrendingDown, TrendingUp, Tag, Receipt } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCardsProps {
  currentMonthSpend: number
  lastMonthSpend: number
  topCategory: string
  transactionCount: number
  loading: boolean
  currentMonthLabel: string
  lastMonthLabel: string
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse shadow-sm">
      <div className="h-3 w-24 rounded bg-gray-200 mb-4" />
      <div className="h-8 w-32 rounded bg-gray-100 mb-3" />
      <div className="h-3 w-16 rounded bg-gray-100" />
    </div>
  )
}

export default function StatCards({ currentMonthSpend, lastMonthSpend, topCategory, transactionCount, loading, currentMonthLabel, lastMonthLabel }: StatCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0,1,2,3].map(i => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const delta = currentMonthSpend - lastMonthSpend
  const deltaPercent = lastMonthSpend > 0 ? Math.abs((delta / lastMonthSpend) * 100).toFixed(0) : null
  const isOver = delta > 0

  const cards: { label: string; icon: React.ReactNode; value: React.ReactNode; sub: React.ReactNode; gif?: string }[] = [
    {
      label: 'This Month',
      icon: <Receipt size={14} className="text-gray-400" />,
      value: (
        <span className="text-3xl font-bold text-gray-900">
          $<CountUp end={currentMonthSpend} decimals={2} duration={1.2} separator="," />
        </span>
      ),
      sub: <span className="text-xs text-gray-400">total spend</span>,
    },
    {
      label: 'vs Last Month',
      icon: isOver
        ? <TrendingUp size={14} className="text-red-400" />
        : <TrendingDown size={14} className="text-emerald-500" />,
      value: (
        <span className={`text-3xl font-bold ${isOver ? 'text-red-400' : 'text-emerald-500'}`}>
          {isOver ? '+' : '-'}$<CountUp end={Math.abs(delta)} decimals={2} duration={1.2} separator="," />
        </span>
      ),
      sub: deltaPercent
        ? <span className={`text-xs ${isOver ? 'text-red-400' : 'text-emerald-500'}`}>{deltaPercent}% {isOver ? 'more' : 'less'} than prior period</span>
        : <span className="text-xs text-gray-400">no data prior period</span>,
      gif: isOver ? '/spending-up.gif' : '/spending-down.gif',
    },
    {
      label: 'Top Category',
      icon: <Tag size={14} className="text-gray-400" />,
      value: <span className="text-2xl font-bold text-gray-900">{topCategory || '—'}</span>,
      sub: <span className="text-xs text-gray-400">highest spend this month</span>,
    },
    {
      label: 'Transactions',
      icon: <Receipt size={14} className="text-gray-400" />,
      value: (
        <span className="text-3xl font-bold text-gray-900">
          <CountUp end={transactionCount} duration={1.2} />
        </span>
      ),
      sub: <span className="text-xs text-gray-400">this month</span>,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.label}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
              {card.icon}
              {card.label}
            </div>
            <div className="mb-1">{card.value}</div>
            {card.sub}
          </div>
          {card.gif && (
            <div className="relative flex-shrink-0">
              <Image
                src={card.gif}
                alt=""
                width={80}
                height={80}
                className="rounded-lg object-cover opacity-90"
                unoptimized
              />
              {isOver && (
                <div className="absolute inset-0 rounded-lg bg-red-400/30 mix-blend-multiply" />
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}
