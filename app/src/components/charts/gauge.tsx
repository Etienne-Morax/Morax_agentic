/** Jauge semi-circulaire pour un pourcentage zone (quota, usage). */

export type GaugeZone = 'green' | 'orange' | 'red'

interface GaugeProps {
  pct: number
  zone: GaugeZone
  centerValue: string
  centerLabel?: string
  size?: number
}

const ZONE_COLOR: Record<GaugeZone, string> = {
  green: 'var(--color-success)',
  orange: 'var(--color-warning)',
  red: 'var(--color-danger)',
}

const DEFAULT_SIZE = 176

export function Gauge({ pct, zone, centerValue, centerLabel, size = DEFAULT_SIZE }: GaugeProps) {
  const clamped = Math.min(100, Math.max(0, pct))
  const strokeWidth = size * 0.11
  const radius = size / 2 - strokeWidth
  const center = size / 2
  const halfCircumference = Math.PI * radius
  const dashLength = (clamped / 100) * halfCircumference
  const startX = center - radius
  const endX = center + radius
  const viewHeight = center + strokeWidth / 2
  const ariaLabel = `${centerLabel ?? 'Jauge'} : ${Math.round(clamped)} pour cent`

  return (
    <svg
      viewBox={`0 0 ${size} ${viewHeight}`}
      width="100%"
      height={viewHeight}
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      <path
        d={`M ${startX} ${center} A ${radius} ${radius} 0 0 1 ${endX} ${center}`}
        fill="none"
        stroke="var(--chart-track)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${startX} ${center} A ${radius} ${radius} 0 0 1 ${endX} ${center}`}
        fill="none"
        stroke={ZONE_COLOR[zone]}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dashLength} ${halfCircumference}`}
      />
      <text
        x={center}
        y={center - strokeWidth * 0.15}
        textAnchor="middle"
        fontSize={size * 0.19}
        fontWeight={700}
        fill="var(--color-text)"
      >
        {centerValue}
      </text>
      {centerLabel && (
        <text
          x={center}
          y={center + strokeWidth * 0.9}
          textAnchor="middle"
          fontSize={size * 0.07}
          fill="var(--color-text-faint)"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  )
}
