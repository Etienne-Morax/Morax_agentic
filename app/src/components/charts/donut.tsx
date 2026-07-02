/** Anneau de repartition (categories/parts) : cercles empiles via stroke-dasharray, rendu serveur. */

export interface DonutSegment {
  value: number
  label: string
  colorVar: string
}

interface DonutProps {
  segments: readonly DonutSegment[]
  size?: number
  thickness?: number
  centerValue?: string
  centerLabel?: string
  ariaLabel: string
}

const DEFAULT_SIZE = 160
const DEFAULT_THICKNESS = 18

interface Arc {
  segment: DonutSegment
  dashLength: number
  dashOffset: number
}

function buildArcs(segments: readonly DonutSegment[], circumference: number, total: number): Arc[] {
  return segments.reduce<Arc[]>((acc, segment) => {
    const fraction = total > 0 ? segment.value / total : 0
    const dashLength = fraction * circumference
    const cumulativeLength = acc.reduce((sum, arc) => sum + arc.dashLength, 0)
    const dashOffset = circumference - cumulativeLength
    return [...acc, { segment, dashLength, dashOffset }]
  }, [])
}

export function Donut({
  segments,
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  centerValue,
  centerLabel,
  ariaLabel,
}: DonutProps) {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const center = size / 2
  const arcs = buildArcs(segments, circumference, total)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--chart-track)" strokeWidth={thickness} />
      {total > 0 &&
        arcs.map((arc) => (
          <circle
            key={arc.segment.label}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.segment.colorVar}
            strokeWidth={thickness}
            strokeDasharray={`${arc.dashLength} ${circumference - arc.dashLength}`}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap={arcs.length === 1 ? 'round' : 'butt'}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ))}
      {centerValue && (
        <text
          x={center}
          y={centerLabel ? center - size * 0.04 : center}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.15}
          fontWeight={700}
          fill="var(--color-text)"
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x={center}
          y={center + size * 0.13}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size * 0.065}
          fill="var(--color-text-faint)"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  )
}
