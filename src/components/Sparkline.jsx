// Native-SVG sparkline. No charting library. Renders a flat mid-line when there
// is no meaningful variation, and nothing when there is no usable data.

export default function Sparkline({ samples, width = 96, height = 28, color = '#087F78' }) {
  const valid = (samples || []).filter((s) => typeof s.value === 'number' && Number.isFinite(s.value));

  if (valid.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline sparkline-empty" role="img" aria-label="No data">
        <line x1={2} y1={height / 2} x2={width - 2} y2={height / 2} stroke="#D8E0E3" strokeWidth="1.5" strokeDasharray="2,3" />
      </svg>
    );
  }

  const values = valid.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 2;
  const padY = 3;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const points = valid.map((s, i) => {
    const x = valid.length === 1 ? padX + innerW / 2 : padX + (i / (valid.length - 1)) * innerW;
    const y = padY + innerH - ((s.value - min) / span) * innerH;
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" role="img" aria-label={`Trend from ${min} to ${max}`}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={color} />
    </svg>
  );
}
