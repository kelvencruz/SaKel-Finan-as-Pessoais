import React from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}

export function PageHeader({ title, description, backHref = '/dashboard', backLabel = '← Dashboard', action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6 gap-4">
      <div>
        {backHref && <a href={backHref} className="text-sm hover:underline" style={{ color: 'var(--text-muted)' }}>{backLabel}</a>}
        <h1 className="text-xl font-semibold mt-1 leading-tight" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}>{title}</h1>
        {description && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}