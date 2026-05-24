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
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Ambient glow — puramente decorativo, aria-hidden */}
      <div aria-hidden="true" style={{
        position: 'fixed', inset: 0,
        pointerEvents: 'none', zIndex: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', width: 700, height: 700,
          top: -200, left: -200, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--glow-ambient-brand) 0%, transparent 65%)',
          animation: 'pulseGlow 6s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', width: 500, height: 500,
          bottom: -150, right: -100, borderRadius: '50%',
          background: 'radial-gradient(circle, var(--glow-ambient-blue) 0%, transparent 65%)',
          animation: 'pulseGlow 8s ease-in-out infinite reverse',
        }} />
      </div>

      {/* Conteúdo acima do glow */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
