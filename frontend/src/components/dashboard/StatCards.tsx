'use client'
import CountUp from 'react-countup'
import { TrendingDown, TrendingUp, Tag, Receipt } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCardsProps {
  currentMonthSpend: number
  lastMonthSpend: number
  topCategory: string
  transactionCount: number
  loading: boolean
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 animate-pulse">
      <div className="h-9 w-9 rounded-[10px] bg-gray-100 mb-4" />
      <div className="h-3 w-20 rounded bg-gray-100 mb-3" />
      <div className="h-8 w-28 rounded bg-gray-100 mb-2" />
      <div className="h-3 w-16 rounded bg-gray-100" />
    </div>
  )
}

export default function StatCards({ currentMonthSpend, lastMonthSpend, topCategory, transactionCount, loading }: StatCardsProps) {
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

  const cards: {
    label: string
    badge: React.ReactNode
    value: React.ReactNode
    sub: React.ReactNode
  }[] = [
    {
      label: 'This month',
      badge: (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-indigo-50 text-indigo-600">
          <Receipt size={16} strokeWidth={1.75} />
        </span>
      ),
      value: (
        <span className="text-[28px] font-semibold tracking-tight tabular-nums text-gray-900">
          $<CountUp end={currentMonthSpend} decimals={2} duration={1.2} separator="," />
        </span>
      ),
      sub: <span className="text-xs text-gray-400">total spend</span>,
    },
    {
      label: 'vs last month',
      badge: isOver ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-red-50 text-red-500">
          <TrendingUp size={16} strokeWidth={1.75} />
        </span>
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-600">
          <TrendingDown size={16} strokeWidth={1.75} />
        </span>
      ),
      value: (
        <span className={`text-[28px] font-semibold tracking-tight tabular-nums ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>
          {isOver ? '+' : '-'}$<CountUp end={Math.abs(delta)} decimals={2} duration={1.2} separator="," />
        </span>
      ),
      sub: deltaPercent
        ? <span className={`text-xs ${isOver ? 'text-red-500' : 'text-emerald-600'}`}>{deltaPercent}% {isOver ? 'more' : 'less'} than prior period</span>
        : <span className="text-xs text-gray-400">no data prior period</span>,
    },
    {
      label: 'Top category',
      badge: (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-amber-50 text-amber-600">
          <Tag size={16} strokeWidth={1.75} />
        </span>
      ),
      value: <span className="text-xl font-semibold tracking-tight text-gray-900">{topCategory || '—'}</span>,
      sub: <span className="text-xs text-gray-400">highest spend this month</span>,
    },
    {
      label: 'Transactions',
      badge: (
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-slate-100 text-slate-600">
          <Receipt size={16} strokeWidth={1.75} />
        </span>
      ),
      value: (
        <span className="text-[28px] font-semibold tracking-tight tabular-nums text-gray-900">
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
          className="rounded-2xl border border-gray-100 bg-white p-6"
        >
          {card.badge}

          <p className="mt-4 text-xs font-medium text-gray-400">{card.label}</p>
          <div className="mt-1.5 mb-1">{card.value}</div>
          {card.sub}
        </motion.div>
      ))}
    </div>
  )
}
