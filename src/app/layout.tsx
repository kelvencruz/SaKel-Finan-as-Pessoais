import Sidebar from '@/components/Sidebar'
import FloatingActionButton from '@/components/FloatingActionButton'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 min-w-0">
        {children}
      </div>
      <FloatingActionButton />
    </div>
  )
}