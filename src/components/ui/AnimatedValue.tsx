'use client';

import React, { useEffect, useRef, useState } from 'react';

interface AnimatedValueProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  trigger?: boolean;
  group?: string;
  delay?: number;
  colorize?: boolean;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function fmt(val: number, dec: number, pre: string, suf: string): string {
  return `${pre}${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(val)}${suf}`;
}

export function AnimatedValue({
  value, prefix = '', suffix = '', decimals = 2,
  duration = 800, glow = false, className = '', style,
  trigger = true, delay = 0,
}: AnimatedValueProps) {
  const [display, setDisplay] = useState(fmt(0, decimals, prefix, suffix));
  const prev = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger) return;
    const run = () => {
      const s = prev.current, e = value, t0 = performance.now();
      if (frame.current) cancelAnimationFrame(frame.current);
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        setDisplay(fmt(s + (e - s) * easeOutExpo(p), decimals, prefix, suffix));
        if (p < 1) frame.current = requestAnimationFrame(tick);
        else prev.current = e;
      };
      frame.current = requestAnimationFrame(tick);
    };
    const t = delay > 0 ? setTimeout(run, delay) : null;
    if (!t) run();
    return () => { if (t) clearTimeout(t); if (frame.current) cancelAnimationFrame(frame.current); };
  }, [value, duration, decimals, prefix, suffix, trigger, delay]);

  return (
    <span className={`${glow ? 'text-glow-value' : ''} ${className}`} style={style}>
      {display}
    </span>
  );
}

export default AnimatedValue;