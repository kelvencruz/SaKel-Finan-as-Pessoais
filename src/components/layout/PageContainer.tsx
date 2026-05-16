interface PageContainerProps {
  children: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const MAX_W = {
  sm:   'max-w-2xl',
  md:   'max-w-3xl',
  lg:   'max-w-4xl',
  xl:   'max-w-5xl',
  '2xl':'max-w-6xl',
}

export function PageContainer({ children, maxWidth = 'xl', className = '' }: PageContainerProps) {
  return (
    <div
      className={`min-h-screen p-6 mx-auto w-full ${MAX_W[maxWidth]} ${className}`}
      style={{ background: 'var(--bg)' }}
    >
      {children}
    </div>
  )
}