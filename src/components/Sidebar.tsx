'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'

const navItems = [
  { href: '/dashboard',     label: 'Dashboard',    icon: '📊' },
  { href: '/transacoes',    label: 'Transações',   icon: '💸' },
  { href: '/contas',        label: 'Contas',        icon: '🏦' },
  { href: '/categorias',    label: 'Categorias',    icon: '🏷️' },
  { href: '/importar',      label: 'Importar CSV',  icon: '📥' },
]

export default function Sidebar() {
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-200 px-4 py-6">
      {/* Logo */}
      <div className="mb-8 px-2">
        <h1 className="text-xl font-bold text-gray-900">💰 SaKel</h1>
        <p className="text-xs text-gray-400 mt-0.5">Finanças Pessoais</p>
      </div>

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors mt-4"
      >
        <span className="text-base">🚪</span>
        Sair
      </button>
    </aside>
  )
}
