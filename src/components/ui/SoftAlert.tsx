import React from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface SoftAlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  /** Ícone personalizado — substitui o padrão */
  icon?: React.ReactNode;
  /** Exibe botão de fechar */
  onDismiss?: () => void;
  className?: string;
}

const defaultIcons: Record<AlertVariant, string> = {
  info:    'ℹ',
  success: '✓',
  warning: '⚠',
  danger:  '✕',
};

const variantTokens: Record<AlertVariant, { bg: string; border: string; color: string; iconColor: string }> = {
  info: {
    bg:        'var(--info-light)',
    border:    'var(--info)',
    color:     'var(--text-secondary)',
    iconColor: 'var(--info)',
  },
  success: {
    bg:        'var(--success-light)',
    border:    'var(--success)',
    color:     'var(--text-secondary)',
    iconColor: 'var(--success)',
  },
  warning: {
    bg:        'var(--warning-light)',
    border:    'var(--warning)',
    color:     'var(--text-secondary)',
    iconColor: 'var(--warning)',
  },
  danger: {
    bg:        'var(--danger-light)',
    border:    'var(--danger)',
    color:     'var(--text-secondary)',
    iconColor: 'var(--danger)',
  },
};

/**
 * SoftAlert — TD-020
 * Alerta não-intrusivo para mensagens de contexto, avisos e erros.
 * Tom suave — não compete com o conteúdo principal.
 * Compatível com todos os temas via CSS vars.
 */
export function SoftAlert({
  variant = 'info',
  title,
  children,
  icon,
  onDismiss,
  className = '',
}: SoftAlertProps) {
  const tokens = variantTokens[variant];

  return (
    <div
      className={`animate-fade-in ${className}`}
      role="alert"
      style={{
        display: 'flex',
        gap: '10px',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        background: tokens.bg,
        borderLeft: `3px solid ${tokens.border}`,
        fontSize: '13px',
        lineHeight: 1.6,
        color: tokens.color,
        position: 'relative',
      }}
    >
      {/* Ícone */}
      <span
        style={{
          flexShrink: 0,
          fontSize: '14px',
          fontWeight: 700,
          color: tokens.iconColor,
          lineHeight: 1.6,
          marginTop: '1px',
        }}
      >
        {icon ?? defaultIcons[variant]}
      </span>

      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <p
            style={{
              margin: '0 0 2px',
              fontWeight: 600,
              color: 'var(--text)',
              fontSize: '13px',
            }}
          >
            {title}
          </p>
        )}
        <div>{children}</div>
      </div>

      {/* Dismiss */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Fechar"
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '14px',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 'var(--radius-xs)',
            alignSelf: 'flex-start',
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default SoftAlert;
