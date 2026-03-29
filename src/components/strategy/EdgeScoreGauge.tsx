'use client';
import { edgeScoreColor, edgeScoreLabel } from '@/lib/alpha/sharpe';
import Tooltip from '@/components/shared/Tooltip';

interface EdgeScoreGaugeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export default function EdgeScoreGauge({ score, size = 'md', label }: EdgeScoreGaugeProps) {
  const color = edgeScoreColor(score);
  const scoreLabel = edgeScoreLabel(score);

  const sizes = {
    sm:  { r: 28, stroke: 5, numFs: 18, labelFs: 9 },
    md:  { r: 44, stroke: 7, numFs: 28, labelFs: 11 },
    lg:  { r: 60, stroke: 8, numFs: 40, labelFs: 13 },
  };
  const { r, stroke, numFs, labelFs } = sizes[size];
  const cx = r + stroke;
  const cy = r + stroke;
  const total = r * 2 * Math.PI;

  // Map 0-5 score to 0-100% arc (270 degree arc)
  const pct = Math.min(1, Math.max(0, score / 5));
  const arcLen = pct * total * 0.75;
  const offset = total * 0.25 * 0.5 + total * 0.25;

  return (
    <Tooltip content="Sharpe Ratio: Above 1 = solid, Above 2 = great, Above 3 = exceptional. Risk-free rate = 4.4% US 10-yr Treasury.">
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}>
        <div style={{ position: 'relative', width: (r + stroke) * 2, height: (r + stroke) * 2 }}>
          <svg width={(r + stroke) * 2} height={(r + stroke) * 2} style={{ transform: 'rotate(135deg)' }}>
            {/* Track */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none" stroke="var(--border)"
              strokeWidth={stroke}
              strokeDasharray={`${total * 0.75} ${total}`}
              strokeLinecap="round"
            />
            {/* Value */}
            <circle
              cx={cx} cy={cy} r={r}
              fill="none" stroke={color}
              strokeWidth={stroke}
              strokeDasharray={`${arcLen} ${total}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 6px ${color}88)` }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span data-mono style={{ fontSize: numFs, fontWeight: 800, color, lineHeight: 1 }}>
              {score.toFixed(2)}
            </span>
            <span style={{ fontSize: labelFs, color: 'var(--text-muted)', fontWeight: 600 }}>
              {scoreLabel}
            </span>
          </div>
        </div>
        {label && <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>}
      </div>
    </Tooltip>
  );
}
