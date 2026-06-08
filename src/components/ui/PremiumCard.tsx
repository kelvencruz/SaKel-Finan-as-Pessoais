import React from 'react';

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  /** Adiciona accent bar no hover (usa glass-card) */
  glass?: boolean;
  /** Eleva sombra — usa card-elevated */
  elevated?: boolean;
  /** Desabilita hover interativo */
  static?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * PremiumCard — TD-020
 * Card base do design system Sakel.
 * Suporta três variantes: padrão (.card), glass (.glass-card) e elevado (.card-elevated).
 * Consome apenas CSS vars do globals.css — compatível com light, dark e arcade.
 */
export function PremiumCard({
  children,
  className = '',
  glass = false,
  elevated = false,
  static: isStatic = false,
  onClick,
  style,
}: PremiumCardProps) {
  const base = glass ? 'glass-card' : elevated ? 'card-elevated' : 'card';
  const cursor = onClick ? 'cursor-pointer' : '';
  const noHover = isStatic ? 'pointer-events-none' : '';

  return (
    <div
      className={`${base} ${cursor} ${noHover} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

export default PremiumCard;
