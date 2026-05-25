// src/components/layout/PageHeader.tsx
import React from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  backHref = '/dashboard',
  backLabel = 'Dashboard',
  action,
}: PageHeaderProps) {
  return (
    <div
      className="flex items-start justify-between mb-6 gap-4 rounded-2xl"
      style={{
        padding: '16px 20px',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        border: '1px solid var(--glass-border)',
      }}
    >
      <div>
        {backHref && (
          
           <a href={backHref}
            className="text-sm transition-opacity duration-200 hover:opacity-100"
            style={{ color: 'var(--text-muted)', opacity: 0.7 }}
          >
            {backLabel}
          </a>
        )}
        <h1
          className="text-xl font-semibold mt-1 leading-tight"
          style={{
            background: 'linear-gradient(135deg, var(--chart-line-start), var(--chart-line-mid))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="text-sm mt-0.5"
            style={{ color: 'var(--text-muted)' }}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}