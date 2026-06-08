import React from 'react';

interface EmptyStateProps {
  /** Ícone SVG ou emoji */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** CTA opcional */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Compacto — para listas inline */
  compact?: boolean;
  className?: string;
}

/**
 * EmptyState — TD-020
 * Estado vazio padronizado para todas as páginas e listas do Sakel.
 * Variante compact para uso inline em seções menores.
 * Consome CSS vars — compatível com todos os temas.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  const padding = compact ? '24px 16px' : '48px 24px';
  const iconSize = compact ? '32px' : '48px';
  const titleSize = compact ? '13px' : '15px';

  return (
    <div
      className={`animate-fade-in ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding,
        gap: compact ? '8px' : '12px',
      }}
    >
      {icon && (
        <span
          style={{
            fontSize: iconSize,
            lineHeight: 1,
            opacity: 0.45,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
          }}
        >
          {icon}
        </span>
      )}

      <p
        style={{
          margin: 0,
          fontSize: titleSize,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
        }}
      >
        {title}
      </p>

      {description && (
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            maxWidth: '280px',
          }}
        >
          {description}
        </p>
      )}

      {action && (
        <button
          className="btn-primary"
          onClick={action.onClick}
          style={{
            marginTop: compact ? '4px' : '8px',
            display: 'inline-flex',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
