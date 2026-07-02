/** Mini-graphe d'evolution : polyline + aire degradee, rendu serveur, zero JS client. */

interface SparklineProps {
  points: readonly number[]
  width?: number
  height?: number
  colorVar?: string
  ariaLabel: string
}

const DEFAULT_WIDTH = 320
const DEFAULT_HEIGHT = 56

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
}

export function Sparkline({
  points,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  colorVar = 'var(--color-accent)',
  ariaLabel,
}: SparklineProps) {
  if (points.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
      </svg>
    )
  }

  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const stepX = width / (points.length - 1)
  const gradientId = `spark-${slug(ariaLabel)}`

  const coords = points.map((value, index) => ({
    x: index * stepX,
    y: height - ((value - min) / range) * (height - 2) - 1,
  }))

  const linePath = coords
    .map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(2)},${coord.y.toFixed(2)}`)
    .join(' ')
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      <title>{ariaLabel}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colorVar} stopOpacity="0.2" />
          <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={colorVar}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
