import React from 'react';

type StatusVariant =
  | 'primary'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'muted';

interface StatusChipProps {
  label: string;
  variant?: StatusVariant;
  /** Ícone opcional à esquerda do label */
  icon?: React.ReactNode;
  /** Tamanho — padrão md */
  size?: 'sm' | 'md';
  className?: string;
}

const variantStyles: Record<StatusVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--primary-light)',
    color: 'var(--primary)',
    border: '1px solid var(--border-hover)',
  },
  success: {
    background: 'var(--success-light)',
    color: 'var(--success)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-light)',
    color: 'var(--danger)',
    border: '1px solid transparent',
  },
  warning: {
    background: 'var(--warning-light)',
    color: 'var(--warning)',
    border: '1px solid transparent',
  },
  info: {
    background: 'var(--info-light)',
    color: 'var(--info)',
    border: '1px solid transparent',
  },
  muted: {
    background: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  },
};

const sizeStyles = {
  sm: { fontSize: '10px', padding: '2px 6px', gap: '3px' },
  md: { fontSize: '11px', padding: '3px 8px', gap: '4px' },
};

/**
 * StatusChip — TD-020
 * Badge semântico para status de transações, faturas, recorrências.
 * Variantes: primary | success | danger | warning | info | muted.
 * Consume CSS vars — compatível com todos os temas.
 */
export function StatusChip({
  label,
  variant = 'muted',
  icon,
  size = 'md',
  className = '',
}: StatusChipProps) {
  return (
    <span
      className={`badge ${className}`}
      style={{
        ...variantStyles[variant],
        ...sizeStyles[size],
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-full)',
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {icon && (
        <span style={{ display: 'flex', alignItems: 'center', lineHeight: 1 }}>
          {icon}
        </span>
      )}
      {label}
    </span>
  );
}

export default StatusChip;
