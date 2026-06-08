// src/components/ui/AnimatedValue.tsx

import React, { useEffect, useRef, useState } from 'react';

interface AnimatedValueProps {
  value: number;
  format?: 'currency' | 'number' | 'percent';
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  trigger?: boolean;
  delay?: number;
  group?: string;
  colorize?: boolean;
}

function fmt(
  val: number,
  format: 'currency' | 'number' | 'percent',
  decimals: number,
  prefix: string,
  suffix: string,
): string {
  if (format === 'number') {
    return `${prefix}${Math.round(val)}${suffix}`;
  }
  if (format === 'percent') {
    return `${prefix}${new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(val)}%${suffix}`;
  }
  // currency (default)
  return `${prefix}${new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val)}${suffix}`;
}

export function AnimatedValue({
  value,
  format = 'currency',
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 800,
  glow = false,
  className = '',
  style,
  trigger = true,
  delay = 0,
  group: _group,      // aceito, ignorado — reservado para animação coordenada futura
  colorize = true,
}: AnimatedValueProps) {
  const [display, setDisplay] = useState(fmt(0, format, decimals, prefix, suffix));
  const prev = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger) return;

    const timeout = delay
      ? window.setTimeout(() => animate(), delay)
      : null;

    if (!delay) animate();

    return () => {
      if (timeout) clearTimeout(timeout);
      if (frame.current) cancelAnimationFrame(frame.current);
    };

    function animate() {
      const start = prev.current;
      const end = value;
      const startTime = performance.now();

      function step(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current = start + (end - start) * eased;
        setDisplay(fmt(current, format, decimals, prefix, suffix));
        if (progress < 1) {
          frame.current = requestAnimationFrame(step);
        } else {
          prev.current = end;
        }
      }

      frame.current = requestAnimationFrame(step);
    }
  }, [value, trigger, delay, duration, format, decimals, prefix, suffix]);

  const colorStyle: React.CSSProperties =
    colorize && !style?.color
      ? { color: value >= 0 ? 'var(--success)' : 'var(--danger)' }
      : {};

  return (
    <span
      className={`${glow ? 'drop-shadow-glow' : ''} ${className}`}
      style={{ ...colorStyle, ...style }}
    >
      {display}
    </span>
  );
}

export default AnimatedValue;