'use client'

const TAP_PATTERN = 10
const SUCCESS_PATTERN = [10, 40, 10]
const ERROR_PATTERN = [15, 60, 15, 60, 15]

interface Haptics {
  tap: () => void
  success: () => void
  error: () => void
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  navigator.vibrate(pattern)
}

/** Retour haptique leger, feature-detecte (no-op sur iOS Safari qui n'implemente pas vibrate). */
export function useHaptics(): Haptics {
  return {
    tap: () => vibrate(TAP_PATTERN),
    success: () => vibrate(SUCCESS_PATTERN),
    error: () => vibrate(ERROR_PATTERN),
  }
}
