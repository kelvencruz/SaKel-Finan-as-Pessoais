import React from 'react';

interface DividerLineProps {
  /** Label central opcional */
  label?: string;
  /** Orientação */
  orientation?: 'horizontal' | 'vertical';
  /** Intensidade da linha */
  strength?: 'subtle' | 'normal' | 'strong';
  /** Usa gradiente de acento (brand) */
  accent?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const strengthColor: Record<string, string> = {
  subtle: 'var(--border-subtle)',
  normal: 'var(--border)',
  strong: 'var(--border-md)',
};

/**
 * DividerLine — TD-020
 * Separador visual padronizado para seções, modais e listas.
 * Suporta label central, orientação vertical e variante accent (brand gradient).
 * Compatível com todos os temas via CSS vars.
 */
export function DividerLine({
  label,
  orientation = 'horizontal',
  strength = 'normal',
  accent = false,
  className = '',
  style,
}: DividerLineProps) {
  const color = accent
    ? 'transparent'
    : strengthColor[strength];

  const background = accent
    ? 'var(--glass-accent-bar)'
    : color;

  /* Vertical */
  if (orientation === 'vertical') {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          width: '1px',
          alignSelf: 'stretch',
          background,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  /* Horizontal sem label */
  if (!label) {
    return (
      <hr
        className={className}
        style={{
          border: 'none',
          height: '1px',
          background,
          margin: 0,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  /* Horizontal com label */
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        ...style,
      }}
    >
      <span
        style={{
          flex: 1,
          height: '1px',
          background,
        }}
      />
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          height: '1px',
          background,
        }}
      />
    </div>
  );
}

export default DividerLine;
