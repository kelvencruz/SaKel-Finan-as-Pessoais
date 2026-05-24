import { useEffect, useRef, useState } from 'react'

interface UseCountUpOptions {
  /** Valor final a ser exibido */
  target: number
  /** Duração da animação em ms (default: 2000) */
  duration?: number
  /** Atraso antes de iniciar em ms (default: 0) */
  delay?: number
  /** Se true, inicia a animação (default: true) */
  trigger?: boolean
}

/**
 * Anima um número de 0 até `target` usando easeOutCubic via requestAnimationFrame.
 * Retorna o valor atual interpolado (float — formatar fora do hook).
 *
 * @example
 * const value = useCountUp({ target: saldo, trigger: !loading })
 */
export function useCountUp({
  target,
  duration = 2000,
  delay = 0,
  trigger = true,
}: UseCountUpOptions): number {
  const [current, setCurrent] = useState(0)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!trigger) {
      setCurrent(0)
      return
    }

    // Cancela animação anterior se existir
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)

    const start = () => {
      const startTime = performance.now()

      const tick = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / duration, 1)

        // easeOutCubic: desacelera suavemente no final
        const eased = 1 - Math.pow(1 - progress, 3)

        setCurrent(eased * target)

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick)
        } else {
          setCurrent(target)
          rafRef.current = null
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    if (delay > 0) {
      timeoutRef.current = setTimeout(start, delay)
    } else {
      start()
    }

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [target, duration, delay, trigger])

  return current
}
