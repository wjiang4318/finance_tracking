'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { CATEGORY_COLORS } from '@/components/dashboard/CategoryDonut'
import { Plus, Search, X } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import { motion } from 'framer-motion'
import DateRangePicker, { type DateRangeValue } from '@/components/DateRangePicker'
import SingleDatePicker from '@/components/SingleDatePicker'

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Travel',
  'Bills & Utilities', 'Entertainment', 'Health and Wellness', 'Personal', 'Income',
]

type TxRow = {
  id: string
  date: string
  description: string
  amount: number
  type: string
  category: string
  statement_id: string | null
  account_name: string
}

type AddForm = {
  date: string
  description: string
  amount: string
  category: string
  type: 'debit' | 'credit'
  account_name: string
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'
const selectCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'

export default function TransactionsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [loading, setLoading]             = useState(true)
  const [allTx, setAllTx]                 = useState<TxRow[]>([])
  const [accounts, setAccounts]           = useState<string[]>([])
  const [userId, setUserId]               = useState<string>('')
  // maps account_name → a valid statement_id for that account
  const [acctStmtMap, setAcctStmtMap]     = useState<Record<string, string>>({})

  // date range picker value (null = no bound)
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: null, to: null })

  // other filters
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [accFilter, setAccFilter] = useState('All')

  // edit modal
  const [editTx, setEditTx]             = useState<TxRow | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editDesc, setEditDesc]         = useState('')
  const [saving, setSaving]             = useState(false)

  // add modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>({
    date: new Date().toISOString().split('T')[0],
    description: '', amount: '', category: 'Food & Drink', type: 'debit', account_name: '',
  })
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const uid = session.user.id
      setUserId(uid)

      const [{ data: stmts }, { data: accts }] = await Promise.all([
        supabase.from('statements').select('statements_id, account_id').eq('user_id', uid),
        supabase.from('accounts').select('bank_acc_id, account_name').eq('user_id', uid),
      ])

      const acctMap: Record<string, string> = {}
      for (const a of accts ?? []) acctMap[a.bank_acc_id] = a.account_name

      // stmtMap: statement_id → account_name
      const stmtMap: Record<string, string> = {}
      // acctStmt: account_name → statement_id (last one wins, any valid id works)
      const acctStmt: Record<string, string> = {}
      for (const s of stmts ?? []) {
        const name = acctMap[s.account_id] ?? 'Unknown'
        stmtMap[s.statements_id] = name
        acctStmt[name] = s.statements_id
      }

      const { data: rows } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', uid)
        .order('date', { ascending: false })

      const enriched: TxRow[] = (rows ?? []).map(r => ({
        ...r,
        account_name: r.statement_id ? (stmtMap[r.statement_id] ?? 'Unknown') : 'Manual',
      }))

      const uniqueAccounts = [...new Set(enriched.map(t => t.account_name).filter(n => n !== 'Manual'))]
      setAllTx(enriched)
      setAccounts(uniqueAccounts)
      setAcctStmtMap(acctStmt)
      // Pre-select first account in the add form
      if (uniqueAccounts[0]) {
        setAddForm(f => ({ ...f, account_name: uniqueAccounts[0] }))
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  const fromStr = dateRange.from ? dateRange.from.toISOString().split('T')[0] : null
  const toStr   = dateRange.to   ? dateRange.to.toISOString().split('T')[0]   : null

  const filtered = allTx.filter(tx => {
    if (fromStr && tx.date < fromStr) return false
    if (toStr   && tx.date > toStr)   return false
    if (catFilter !== 'All' && tx.category !== catFilter) return false
    if (accFilter !== 'All' && tx.account_name !== accFilter) return false
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function handleSaveEdit() {
    if (!editTx) return
    setSaving(true)
    await supabase
      .from('transactions')
      .update({ category: editCategory, description: editDesc })
      .eq('id', editTx.id)
    setAllTx(prev => prev.map(t =>
      t.id === editTx.id ? { ...t, category: editCategory, description: editDesc } : t
    ))
    setSaving(false)
    setEditTx(null)
  }

  async function handleAddTransaction() {
    if (!addForm.description || !addForm.amount || !addForm.date) return
    setAdding(true)
    setAddError('')

    const stmtId = acctStmtMap[addForm.account_name]
    if (!stmtId) {
      setAddError('No account selected or no statements found for that account.')
      setAdding(false)
      return
    }

    const amount = parseFloat(addForm.amount)
    const finalAmount = addForm.type === 'credit' ? -Math.abs(amount) : Math.abs(amount)

    const { data: inserted, error } = await supabase
      .from('transactions')
      .insert({
        date: addForm.date,
        description: addForm.description,
        amount: finalAmount,
        type: addForm.type,
        category: addForm.category,
        user_id: userId,
        statement_id: stmtId,
      })
      .select()

    if (error) {
      setAddError(error.message)
      setAdding(false)
      return
    }

    if (inserted?.[0]) {
      setAllTx(prev => [{ ...inserted[0], account_name: addForm.account_name }, ...prev])
    }
    setAdding(false)
    setShowAdd(false)
    setAddForm(f => ({ date: new Date().toISOString().split('T')[0], description: '', amount: '', category: 'Food & Drink', type: 'debit', account_name: f.account_name }))
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">Finance Tracker</p>
          <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} /> Add Transaction
        </button>
      </div>

      {/* ── Filters ── */}
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-center gap-3">

        {/* Date range picker */}
        <DateRangePicker value={dateRange} onChange={setDateRange} />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search merchant…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={12} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* Category */}
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className={selectCls}>
          <option value="All">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Account */}
        <select value={accFilter} onChange={e => setAccFilter(e.target.value)} className={selectCls}>
          <option value="All">All accounts</option>
          {accounts.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* ── Table area ── */}
      <div className="px-6 pb-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-6 h-6 rounded-full border-2 border-gray-200 border-t-indigo-500 animate-spin" />
            <p className="text-sm text-gray-400">Loading transactions…</p>
          </div>
        ) : allTx.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm py-24 text-center">
            <p className="text-gray-500 text-sm mb-3">No transactions yet</p>
            <button
              onClick={() => router.push('/upload')}
              className="text-sm text-indigo-600 hover:underline"
            >
              Upload a PDF to get started →
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm py-24 text-center">
            <p className="text-gray-500 text-sm">No results for this filter</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-gray-50/60">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Account</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((tx, i) => {
                  const color    = CATEGORY_COLORS[tx.category] ?? '#6b7280'
                  const isIncome = tx.category === 'Income' || tx.amount < 0
                  return (
                    <motion.tr
                      key={tx.id ?? i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.2 }}
                      onClick={() => { setEditTx(tx); setEditCategory(tx.category); setEditDesc(tx.description) }}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3 text-gray-800 max-w-xs truncate font-medium">{tx.description}</td>
                      <td className="px-5 py-3">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {tx.category}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{tx.account_name}</td>
                      <td className={`px-5 py-3 text-right font-semibold whitespace-nowrap ${isIncome ? 'text-emerald-600' : 'text-gray-800'}`}>
                        {isIncome ? '+' : '-'}${Math.abs(tx.amount).toFixed(2)}
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
              {filtered.length !== allTx.length && ` (of ${allTx.length} total)`}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editTx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setEditTx(null)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Edit Transaction</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description</label>
                <input
                  type="text"
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <select
                  value={editCategory}
                  onChange={e => setEditCategory(e.target.value)}
                  className={inputCls}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Date</p>
                  <p className="text-sm text-gray-700 mt-0.5">
                    {new Date(editTx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">Amount</p>
                  <p className="text-sm text-gray-700 mt-0.5">${Math.abs(editTx.amount).toFixed(2)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-6">
              <button onClick={() => setEditTx(null)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ── */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAdd(false)}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-5">Add Transaction</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Date</label>
                <SingleDatePicker value={addForm.date} onChange={d => setAddForm(f => ({ ...f, date: d }))} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Description</label>
                <input type="text" placeholder="e.g. Coffee Shop" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Amount ($)</label>
                  <input type="number" placeholder="0.00" min="0" step="0.01" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} className={`${inputCls} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Type</label>
                  <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value as 'debit' | 'credit' }))} className={inputCls}>
                    <option value="debit">Expense</option>
                    <option value="credit">Income</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Category</label>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} className={inputCls}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Account</label>
                <select value={addForm.account_name} onChange={e => setAddForm(f => ({ ...f, account_name: e.target.value }))} className={inputCls}>
                  {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            {addError && (
              <p className="mt-4 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{addError}</p>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => { setShowAdd(false); setAddError('') }} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddTransaction} disabled={adding || !addForm.description || !addForm.amount} className="flex-1 text-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2 transition-colors">
                {adding ? 'Adding…' : 'Add Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
      </main>
    </div>
  )
}
