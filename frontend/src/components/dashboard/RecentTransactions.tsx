'use client'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { ArrowLeftRight } from 'lucide-react'
import { CATEGORY_COLORS } from './CategoryDonut'

// Categories excluded from spending totals, marked with a ↔ indicator on the row.
const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']

interface Transaction {
  date: string
  description: string
  amount: number
  category: string
}

interface RecentTransactionsProps {
  transactions: Transaction[]
  loading: boolean
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-gray-100" />
      <div className="flex-1 h-3 rounded bg-gray-100" />
      <div className="h-5 w-20 rounded-full bg-gray-100" />
      <div className="h-3 w-16 rounded bg-gray-100" />
    </div>
  )
}

export default function RecentTransactions({ transactions, loading }: RecentTransactionsProps) {
  const router = useRouter()

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <p className="text-xs text-gray-400 mb-1">Recent Transactions</p>
        <p className="text-sm font-semibold text-gray-800 mb-4">Latest activity</p>
        <div className="divide-y divide-gray-100">
          {[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Recent Transactions</p>
          <p className="text-sm font-semibold text-gray-800">Latest activity</p>
        </div>
        <button
          onClick={() => router.push('/transactions')}
          className="text-xs text-indigo-600 hover:underline shrink-0 mt-1"
        >
          View all →
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          No transactions yet — upload a PDF to get started
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {transactions.map((tx, i) => {
            const color = CATEGORY_COLORS[tx.category] ?? '#6b7280'
            const isIncome = tx.category === 'Income'
            const isExpense = !TRANSFERS.includes(tx.category) && tx.amount > 0
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.04, duration: 0.3 }}
                className="flex items-center gap-4 py-3"
              >
                <span className="text-xs text-gray-400 w-20 shrink-0">
                  {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="flex-1 text-sm text-gray-700 truncate">{tx.description}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: `${color}18`, color }}
                  >
                    {tx.category}
                  </span>
                  {!isExpense && (
                    <ArrowLeftRight
                      size={11}
                      className="text-gray-500 shrink-0"
                      aria-label="Excluded from spending totals"
                    >
                      <title>Excluded from spending totals — transfer, payment, or income, not new spending</title>
                    </ArrowLeftRight>
                  )}
                </div>
                <span className={`text-sm font-medium w-20 text-right shrink-0 ${isIncome ? 'text-emerald-500' : 'text-gray-800'}`}>
                  {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                </span>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
