import { riskLabel, riskColor, riskEmoji } from '@/lib/risk/scorer';

export default function RiskBadge({ score, size = 'sm' }: { score: number; size?: 'sm' | 'md' }) {
  const label = riskLabel(score);
  const color = riskColor(score);
  const emoji = riskEmoji(score);
  const pad = size === 'md' ? '4px 10px' : '2px 7px';
  const fs = size === 'md' ? 12 : 10;

  return (
    <span
      data-mono
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: pad,
        background: `${color}22`,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        fontSize: fs,
        color,
        fontWeight: 600,
        letterSpacing: '0.05em',
      }}
    >
      {emoji} {label}
    </span>
  );
}
