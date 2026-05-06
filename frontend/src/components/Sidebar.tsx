'use client'
import { useRouter, usePathname } from 'next/navigation'
import { LayoutDashboard, ArrowUpFromLine, List, TrendingUp, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const NAV = [
  { label: 'Dashboard',    href: '/dashboard',    icon: LayoutDashboard },
  { label: 'Transactions', href: '/transactions',  icon: List },
  { label: 'Trends',       href: '/trends',        icon: TrendingUp },
]

interface SidebarProps {
  onUpload?: () => void
}

export default function Sidebar({ onUpload }: SidebarProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function handleUpload() {
    if (onUpload) {
      onUpload()
    } else {
      router.push('/upload')
    }
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 flex flex-col bg-gray-50 border-r border-gray-100 select-none">

      {/* Nav */}
      <nav className="flex-1 px-2 pt-3 space-y-0.5">
        {NAV.map(({ label, href, icon: Icon, soon }) => {
          const active = pathname === href
          return (
            <button
              key={href}
              onClick={() => !soon && router.push(href)}
              disabled={soon}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors text-left ${
                active
                  ? 'bg-white shadow-sm text-gray-900 font-medium'
                  : soon
                  ? 'text-gray-300 cursor-default'
                  : 'text-gray-600 hover:bg-white/70 hover:text-gray-900'
              }`}
            >
              <Icon size={15} className={active ? 'text-indigo-500' : 'text-gray-400'} />
              <span>{label}</span>
              {soon && <span className="ml-auto text-[10px] text-gray-300 font-medium">soon</span>}
            </button>
          )
        })}
      </nav>

      {/* Upload */}
      <div className="px-2 mb-2">
        <button
          onClick={handleUpload}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <ArrowUpFromLine size={15} />
          <span className="font-medium">Upload statement</span>
        </button>
      </div>

      <div className="mx-3 border-t border-gray-200 mb-2" />

      {/* Sign out */}
      <div className="px-2 pb-4">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-gray-400 hover:text-gray-700 hover:bg-white/70 transition-colors"
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
