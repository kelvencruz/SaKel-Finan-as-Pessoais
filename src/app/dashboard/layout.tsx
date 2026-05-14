import Sidebar from '@/components/Sidebar'
import FloatingActionButton from '@/components/FloatingActionButton'
import { ToastManagerProvider } from '@/components/core/ToastManager'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0 md:ml-0">
        {/* Espacamento no mobile para nao esconder conteudo atras do hamburguer */}
        <div className="pt-14 md:pt-0">
          {children}
        </div>
      </div>
      <FloatingActionButton />
      <ToastManagerProvider />
    </div>
  )
}
