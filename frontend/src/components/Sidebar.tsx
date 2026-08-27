'use client'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowUpFromLine, List, TrendingUp, LogOut, PieChart, Menu, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { API_URL } from '@/utils/api'

const NAV = [
  { label: 'Dashboard',    href: '/dashboard',   icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions', icon: List },
  { label: 'Trends',       href: '/trends',       icon: TrendingUp },
]

interface SidebarProps {
  onUpload?: () => void
}

export default function Sidebar({ onUpload }: SidebarProps) {
  const router      = useRouter()
  const pathname    = usePathname()
  const supabase    = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('')
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setStatusMsg('')
    setStatusType('')

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
      const data = await res.json()
      setStatusType('success')
      setStatusMsg(
        data.skipped
          ? `Already uploaded`
          : `${data.inserted} transactions imported`
      )
      setTimeout(() => { setStatusMsg(''); setStatusType(''); window.location.reload() }, 2000)
    } catch (err: unknown) {
      setStatusType('error')
      setStatusMsg(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function handleUploadClick() {
    setMobileOpen(false)
    if (onUpload) {
      onUpload()
    } else {
      fileInputRef.current?.click()
    }
  }

  function handleNavigate(href: string) {
    setMobileOpen(false)
    router.push(href)
  }

  // Shared between the desktop rail and the mobile drawer so both stay in sync
  function NavList() {
    return (
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href
          return (
            <button
              key={href}
              onClick={() => handleNavigate(href)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
                active
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : 'text-gray-700 hover:bg-white/70 hover:text-gray-900'
              }`}
            >
              <Icon size={15} className={active ? 'text-indigo-500' : 'text-gray-500'} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  function Footer() {
    return (
      <>
        {statusMsg && (
          <div className={`mx-2 mb-1 px-3 py-2 rounded-lg text-xs ${
            statusType === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}>
            {statusMsg}
          </div>
        )}

        <div className="px-2 mb-2">
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40"
          >
            <ArrowUpFromLine size={15} />
            <span className="font-medium">{uploading ? 'Uploading…' : 'Upload statement'}</span>
          </button>
        </div>

        <div className="mx-3 border-t border-gray-100 mb-2" />

        <div className="px-2 pb-4">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-700 hover:bg-white/70 transition-colors"
          >
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:flex w-56 shrink-0 h-screen sticky top-0 flex-col bg-[#f4f4fb] border-r border-gray-100 select-none">
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <PieChart size={15} strokeWidth={2} className="text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            Expense Tracker
          </span>
        </div>
        <NavList />
        <Footer />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-gray-100 bg-[#f4f4fb]/90 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
            <PieChart size={15} strokeWidth={2} className="text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">
            Expense Tracker
          </span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-white/70"
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-gray-900/30 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-[#f4f4fb] shadow-xl">
            <div className="flex items-center justify-between px-4 pt-5 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
                  <PieChart size={15} strokeWidth={2} className="text-white" />
                </span>
                <span className="text-[15px] font-semibold tracking-tight text-gray-900">
                  Expense Tracker
                </span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-white/70"
              >
                <X size={17} />
              </button>
            </div>
            <NavList />
            <Footer />
          </aside>
        </div>,
        document.body
      )}

      {/* Hidden file input, shared by desktop and mobile upload buttons */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Upload overlay for non-dashboard pages — portaled to <body> so it always
          paints above page content (e.g. Recharts SVG), regardless of DOM nesting */}
      {uploading && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center bg-[#f4f4fb]">
          <img src="/uploading.gif" alt="Uploading…" className="w-64 h-64 object-contain drop-shadow-lg" />
          <p className="mt-4 text-base font-semibold text-gray-700">Crunching your statement…</p>
          <p className="text-sm text-gray-400 mt-1">This takes about 10–15 seconds ✨</p>
        </div>,
        document.body
      )}
    </>
  )
}
