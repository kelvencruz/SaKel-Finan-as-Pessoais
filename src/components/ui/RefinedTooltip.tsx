'use client';

import React, { useRef, useState } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface RefinedTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: TooltipPosition;
  /** Delay de abertura em ms */
  delay?: number;
  className?: string;
}

const positionStyles: Record<TooltipPosition, React.CSSProperties> = {
  top: {
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  bottom: {
    top: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  left: {
    right: 'calc(100% + 8px)',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  right: {
    left: 'calc(100% + 8px)',
    top: '50%',
    transform: 'translateY(-50%)',
  },
};

/**
 * RefinedTooltip — TD-020
 * Tooltip leve sem dependência externa.
 * Usa CSS vars do design system — compatível com todos os temas.
 * Abre com delay configurável para evitar flickering em hover rápido.
 */
export function RefinedTooltip({
  content,
  children,
  position = 'top',
  delay = 180,
  className = '',
}: RefinedTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }

  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }

  return (
    <span
      className={className}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}

      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 50,
            ...positionStyles[position],
            background: 'var(--surface)',
            border: '1px solid var(--border-md)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            fontWeight: 500,
            lineHeight: 1.5,
            padding: '6px 10px',
              pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease both',
            maxWidth: '240px',
            whiteSpace: 'normal',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}

export default RefinedTooltip;
