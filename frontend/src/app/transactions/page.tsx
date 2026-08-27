'use client'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { API_URL } from '@/utils/api'
import { CATEGORY_COLORS } from '@/components/dashboard/CategoryDonut'
import { countsTowardSpend } from '@/utils/spend'
import { Plus, Search, X, Trash2, FileX, ArrowLeftRight } from 'lucide-react'
import Sidebar from '@/components/Sidebar'
import PageBanner from '@/components/PageBanner'
import { motion } from 'framer-motion'
import DateRangePicker, { type DateRangeValue } from '@/components/DateRangePicker'
import SingleDatePicker from '@/components/SingleDatePicker'

const CATEGORIES = [
  'Food & Drink', 'Groceries', 'Shopping', 'Travel',
  'Bills & Utilities', 'Entertainment', 'Health and Wellness',
  'Investment', 'Internal Transfers', 'Credit Card Payment',
  'Income', 'Uncategorized',
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

type StatementRow = {
  id: string
  filename: string
  account_name: string
  period_start: string | null
  period_end: string | null
  txCount: number
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'
const selectCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200'

export default function TransactionsPage() {
  const router       = useRouter()
  const supabase     = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading]         = useState(false)
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
  const [editAmount, setEditAmount]     = useState('')
  const [applyToAll, setApplyToAll]     = useState(false)
  const [saving, setSaving]             = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)

  // add modal
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<AddForm>({
    date: new Date().toISOString().split('T')[0],
    description: '', amount: '', category: 'Food & Drink', type: 'debit', account_name: '',
  })
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState('')

  // manage statements modal
  const [showManageStatements, setShowManageStatements] = useState(false)
  const [statements, setStatements] = useState<StatementRow[]>([])
  const [confirmDeleteStmtId, setConfirmDeleteStmtId] = useState<string | null>(null)
  const [deletingStmt, setDeletingStmt] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const uid = session.user.id
      setUserId(uid)

      const [{ data: stmts }, { data: accts }] = await Promise.all([
        supabase.from('statements').select('statements_id, account_id, filename, period_start, period_end').eq('user_id', uid),
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

      const stmtRows: StatementRow[] = (stmts ?? []).map(s => ({
        id: s.statements_id,
        filename: s.filename,
        account_name: acctMap[s.account_id] ?? 'Unknown',
        period_start: s.period_start,
        period_end: s.period_end,
        txCount: enriched.filter(t => t.statement_id === s.statements_id).length,
      }))
      setStatements(stmtRows)
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('user_id', session.user.id)

    try {
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || `Server error ${res.status}`)
      }
      setTimeout(() => window.location.reload(), 1200)
    } catch {
      setUploading(false)
    }
  }

  async function handleSaveEdit() {
    if (!editTx) return
    setSaving(true)
    const newAmount = parseFloat(editAmount) || Math.abs(editTx.amount)
    const isCredit = editTx.type === 'credit'

    if (applyToAll) {
      // Bulk update all rows with the same description for this user
      await supabase
        .from('transactions')
        .update({ category: editCategory })
        .eq('user_id', userId)
        .eq('description', editTx.description)
      // Also update description + amount on just this row if they changed
      if (editDesc !== editTx.description || newAmount !== Math.abs(editTx.amount)) {
        await supabase
          .from('transactions')
          .update({ description: editDesc, amount: newAmount })
          .eq('id', editTx.id)
      }
      // Store the user's preference so future uploads use it automatically
      const form = new FormData()
      form.append('user_id', userId)
      form.append('description', editTx.description)
      form.append('category', editCategory)
      await fetch(`${API_URL}/set-override`, { method: 'POST', body: form })

      setAllTx(prev => prev.map(t =>
        t.description === editTx.description
          ? { ...t, category: editCategory, ...(t.id === editTx.id ? { description: editDesc, amount: isCredit ? -newAmount : newAmount } : {}) }
          : t
      ))
    } else {
      await supabase
        .from('transactions')
        .update({ category: editCategory, description: editDesc, amount: newAmount })
        .eq('id', editTx.id)
      setAllTx(prev => prev.map(t =>
        t.id === editTx.id ? { ...t, category: editCategory, description: editDesc, amount: isCredit ? -newAmount : newAmount } : t
      ))
    }

    setSaving(false)
    setEditTx(null)
  }

  async function handleDeleteTx() {
    if (!editTx) return
    setDeleting(true)
    await supabase.from('transactions').delete().eq('id', editTx.id)
    setAllTx(prev => prev.filter(t => t.id !== editTx.id))
    setDeleting(false)
    setEditTx(null)
  }

  async function handleDeleteStatement(id: string) {
    setDeletingStmt(true)
    // Deleting the statement cascades to every transaction tied to it (schema:
    // transactions.statement_id references statements on delete cascade) — no
    // separate transactions delete needed.
    const { error } = await supabase.from('statements').delete().eq('statements_id', id)
    if (!error) {
      setStatements(prev => prev.filter(s => s.id !== id))
      setAllTx(prev => prev.filter(t => t.statement_id !== id))
    }
    setDeletingStmt(false)
    setConfirmDeleteStmtId(null)
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
    <div className="min-h-screen bg-[#f4f4fb]">
      <PageBanner
        eyebrow="Expense Tracker"
        title="Transactions"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowManageStatements(true)}
              className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border border-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <FileX size={14} /> Manage Statements
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white border border-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={14} /> Add Transaction
            </button>
          </div>
        }
      />
      <div className="flex">
        <Sidebar onUpload={() => fileInputRef.current?.click()} />
        <main className="flex-1 min-w-0 overflow-y-auto pt-14 lg:pt-0">

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
          <div className="rounded-2xl border border-gray-100 bg-white py-24 text-center">
            <p className="text-gray-500 text-sm mb-3">No transactions yet</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm text-indigo-600 hover:underline"
            >
              Upload a PDF to get started →
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white py-24 text-center">
            <p className="text-gray-500 text-sm">No results for this filter</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
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
                  const color     = CATEGORY_COLORS[tx.category] ?? '#6b7280'
                  const isIncome  = tx.category === 'Income' || tx.amount < 0
                  const isExpense = countsTowardSpend(tx)
                  return (
                    <motion.tr
                      key={tx.id ?? i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.2 }}
                      onClick={() => { setEditTx(tx); setEditCategory(tx.category); setEditDesc(tx.description); setEditAmount(Math.abs(tx.amount).toFixed(2)); setConfirmDelete(false); setApplyToAll(false) }}
                      className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3 text-gray-800 max-w-xs truncate font-medium">{tx.description}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${color}20`, color }}
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
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 flex items-center justify-between">
              <span>
                {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== allTx.length && ` (of ${allTx.length} total)`}
              </span>
              <span className="flex items-center gap-1">
                <ArrowLeftRight size={11} className="text-gray-500" />
                excluded from spending totals
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Modal ── */}
      {editTx && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setEditTx(null); setConfirmDelete(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-gray-900">Edit Transaction</h2>
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete transaction"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {confirmDelete ? (
              <div className="py-4">
                <p className="text-sm text-gray-700 mb-1">Delete this transaction?</p>
                <p className="text-xs text-gray-400 mb-6">{editTx.description} · ${Math.abs(editTx.amount).toFixed(2)}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleDeleteTx} disabled={deleting} className="flex-1 text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg py-2 transition-colors">
                    {deleting ? 'Deleting…' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            ) : (
              <>
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
                    {(() => {
                      const matchCount = allTx.filter(t => t.description === editTx?.description).length
                      return matchCount > 1 ? (
                        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={e => setApplyToAll(e.target.checked)}
                            className="accent-indigo-400 w-3 h-3 opacity-70"
                          />
                          <span className="text-xs text-gray-400">
                            Apply to all {matchCount} &ldquo;{editTx?.description}&rdquo; transactions
                          </span>
                        </label>
                      ) : null
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                      <p className="text-xs text-gray-400">Date</p>
                      <p className="text-sm text-gray-700 mt-0.5">
                        {new Date(editTx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Amount ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editAmount}
                        onChange={e => setEditAmount(e.target.value)}
                        className={`${inputCls} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                      />
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
              </>
            )}
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

      {/* ── Manage Statements Modal ── */}
      {showManageStatements && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => { setShowManageStatements(false); setConfirmDeleteStmtId(null) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">Manage Statements</h2>
            <p className="text-xs text-gray-400 mb-4">Deleting a statement removes all of its transactions too.</p>

            {statements.length === 0 ? (
              <p className="text-sm text-gray-500 py-8 text-center">No statements uploaded yet</p>
            ) : (
              <div className="border border-gray-100 rounded-xl max-h-96 overflow-y-auto">
                {statements.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.filename}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.account_name}
                        {s.period_start && s.period_end && (
                          <> · {new Date(s.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' – '}
                            {new Date(s.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                        )}
                        {' · '}{s.txCount} transaction{s.txCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {confirmDeleteStmtId === s.id ? (
                      <div className="flex items-center gap-1.5 shrink-0 ml-3">
                        <button
                          onClick={() => setConfirmDeleteStmtId(null)}
                          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteStatement(s.id)}
                          disabled={deletingStmt}
                          className="text-xs bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          {deletingStmt ? 'Deleting…' : 'Confirm'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteStmtId(s.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0 ml-3"
                        title="Delete statement and its transactions"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { setShowManageStatements(false); setConfirmDeleteStmtId(null) }}
              className="w-full mt-4 text-sm border border-gray-200 rounded-lg py-2 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
      </main>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Portaled to <body> so it always paints above page content (e.g. Recharts SVG),
          regardless of DOM nesting */}
      {uploading && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#f4f4fb]">
          <img src="/uploading.gif" alt="Uploading…" className="w-64 h-64 object-contain drop-shadow-lg" />
          <p className="mt-4 text-base font-semibold text-gray-700">Crunching your statement…</p>
          <p className="text-sm text-gray-400 mt-1">This takes about 10–15 seconds ✨</p>
        </div>,
        document.body
      )}
    </div>
  )
}
