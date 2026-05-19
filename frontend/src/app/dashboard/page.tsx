'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'
import StatCards from '@/components/dashboard/StatCards'
import SpendingChart from '@/components/dashboard/SpendingChart'
import CategoryDonut from '@/components/dashboard/CategoryDonut'
import RecentTransactions from '@/components/dashboard/RecentTransactions'
import NetAccumulatedChart from '@/components/dashboard/NetAccumulatedChart'
import PageBanner from '@/components/PageBanner'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'duplicate' | 'error'

type TxRow = {
  date: string
  description: string
  amount: number
  category: string
  type: string
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function buildMonthlySpend(rows: TxRow[]): { month: string; spend: number }[] {
  const now = new Date()
  const result = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']
    const spend = rows
      .filter(tx => tx.date.startsWith(key) && !TRANSFERS.includes(tx.category) && tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0)
    result.push({ month: MONTH_LABELS[d.getMonth()], spend: Math.round(spend * 100) / 100 })
  }
  return result
}

function buildNetAccumulated(rows: TxRow[]): { month: string; cumulative: number }[] {
  const now = new Date()
  const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']
  let running = 0
  const result = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthRows = rows.filter(tx => tx.date.startsWith(key))
    const income   = monthRows.filter(tx => tx.category === 'Income' || tx.amount < 0)
                              .reduce((s, tx) => s + Math.abs(tx.amount), 0)
    const spending = monthRows.filter(tx => !TRANSFERS.includes(tx.category) && tx.amount > 0)
                              .reduce((s, tx) => s + tx.amount, 0)
    running += income - spending
    result.push({ month: MONTH_LABELS[d.getMonth()], cumulative: Math.round(running * 100) / 100 })
  }
  return result
}

function buildCategoryData(rows: TxRow[]): { name: string; value: number }[] {
  const map: Record<string, number> = {}
  const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']
  for (const tx of rows) {
    if (TRANSFERS.includes(tx.category) || tx.amount <= 0) continue
    map[tx.category] = (map[tx.category] ?? 0) + tx.amount
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
}

export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading]           = useState(true)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadMsg, setUploadMsg]       = useState('')

  const [currentMonthSpend, setCurrentMonthSpend] = useState(0)
  const [lastMonthSpend, setLastMonthSpend]         = useState(0)
  const [topCategory, setTopCategory]               = useState('')
  const [transactionCount, setTransactionCount]     = useState(0)
  const [monthlyData, setMonthlyData]               = useState<{ month: string; spend: number }[]>([])
  const [categoryData, setCategoryData]             = useState<{ name: string; value: number }[]>([])
  const [netAccumulatedData, setNetAccumulatedData] = useState<{ month: string; cumulative: number }[]>([])
  const [recentTx, setRecentTx]                     = useState<TxRow[]>([])
  const [currentMonthLabel, setCurrentMonthLabel]   = useState('')
  const [lastMonthLabel, setLastMonthLabel]         = useState('')

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const userId = session.user.id
      const now = new Date()
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0]

      const { data: rows } = await supabase
        .from('transactions')
        .select('date, description, amount, category, type')
        .eq('user_id', userId)
        .gte('date', sixMonthsAgo)
        .order('date', { ascending: false })

      if (!rows) { setLoading(false); return }

      // Anchor to the most recent transaction's month so statement upload lag doesn't show $0
      const latestDate = rows.length > 0 ? new Date(rows[0].date + 'T00:00:00') : now
      const anchorYear  = latestDate.getFullYear()
      const anchorMonth = latestDate.getMonth()

      const currentMonthStart = new Date(anchorYear, anchorMonth, 1).toISOString().split('T')[0]
      const lastMonthStart    = new Date(anchorYear, anchorMonth - 1, 1).toISOString().split('T')[0]
      const lastMonthEnd      = new Date(anchorYear, anchorMonth, 0).toISOString().split('T')[0]

      const fmt = (y: number, m: number) =>
        new Date(y, m, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
      setCurrentMonthLabel(fmt(anchorYear, anchorMonth))
      setLastMonthLabel(fmt(anchorYear, anchorMonth - 1))

      const currentRows = rows.filter(tx => tx.date >= currentMonthStart)
      const lastRows    = rows.filter(tx => tx.date >= lastMonthStart && tx.date <= lastMonthEnd)

      const TRANSFERS = ['Income', 'Investment', 'Internal Transfers', 'Credit Card Payment']
      const isSpend = (tx: TxRow) => !TRANSFERS.includes(tx.category) && tx.amount > 0

      const expenseSum = (txs: TxRow[]) =>
        txs.filter(isSpend).reduce((s, tx) => s + tx.amount, 0)

      const curSpend  = expenseSum(currentRows)
      const lastSpend = expenseSum(lastRows)
      const expCount  = currentRows.filter(isSpend).length

      const catMap: Record<string, number> = {}
      for (const tx of currentRows) {
        if (isSpend(tx))
          catMap[tx.category] = (catMap[tx.category] ?? 0) + tx.amount
      }
      const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''

      setCurrentMonthSpend(Math.round(curSpend * 100) / 100)
      setLastMonthSpend(Math.round(lastSpend * 100) / 100)
      setTopCategory(topCat)
      setTransactionCount(expCount)
      setMonthlyData(buildMonthlySpend(rows))
      setCategoryData(buildCategoryData(currentRows))
      setNetAccumulatedData(buildNetAccumulated(rows))
      setRecentTx(rows.slice(0, 5))
      setLoading(false)
    }
    fetchData()
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadStatus('uploading')
    setUploadMsg('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('user_id', session.user.id)

    try {
      const res = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      const data = await res.json()
      if (data.skipped) {
        setUploadStatus('duplicate')
        setUploadMsg(`${data.account_name} — already uploaded`)
      } else {
        setUploadStatus('success')
        setUploadMsg(`${data.inserted} transactions imported from ${data.account_name}`)
        setLoading(true)
        setTimeout(() => window.location.reload(), 1200)
      }
    } catch (err: unknown) {
      setUploadStatus('error')
      setUploadMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  const totalCategorySpend = categoryData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="min-h-screen bg-[#f4f4fb]">

      <PageBanner
        eyebrow="Personal"
        title="Finance Tracker"
        right={
          <>
            {uploadStatus === 'success' && (
              <span className="text-xs text-emerald-300 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">✓ {uploadMsg}</span>
            )}
            {uploadStatus === 'duplicate' && (
              <span className="text-xs text-yellow-300 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">⚠ {uploadMsg}</span>
            )}
            {uploadStatus === 'error' && (
              <span className="text-xs text-red-300 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full">✗ {uploadMsg}</span>
            )}
          </>
        }
      />

      {/* ── Sidebar + Content (sidebar sticks once banner scrolls away) ── */}
      <div className="flex">
        <Sidebar onUpload={() => fileInputRef.current?.click()} />

        <main className="flex-1 px-6 py-6 flex flex-col gap-6">
          <StatCards
            currentMonthSpend={currentMonthSpend}
            lastMonthSpend={lastMonthSpend}
            topCategory={topCategory}
            transactionCount={transactionCount}
            loading={loading}
            currentMonthLabel={currentMonthLabel}
            lastMonthLabel={lastMonthLabel}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Left column: spending chart + net accumulated */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              <SpendingChart data={monthlyData} loading={loading} />
              <NetAccumulatedChart data={netAccumulatedData} loading={loading} />
            </div>
            {/* Right column: category donut + compact transactions */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <CategoryDonut data={categoryData} total={totalCategorySpend} loading={loading} monthLabel={currentMonthLabel} />
              <RecentTransactions transactions={recentTx} loading={loading} />
            </div>
          </div>
        </main>
      </div>

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />

      {/* Upload overlay */}
      {uploadStatus === 'uploading' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm">
          <img src="/uploading.gif" alt="Uploading…" className="w-64 h-64 object-contain drop-shadow-lg" />
          <p className="mt-4 text-base font-semibold text-gray-700">Crunching your statement…</p>
          <p className="text-sm text-gray-400 mt-1">This takes about 10–15 seconds ✨</p>
        </div>
      )}
    </div>
  )
}
