'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartTooltip } from 'recharts';
import type { PricePoint } from '@/types';

export default function PriceChart({ history }: { history: PricePoint[] }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        No price history available
      </div>
    );
  }

  const first = history[0].p;
  const last = history[history.length - 1].p;
  const isUp = last >= first;
  const color = isUp ? '#22c55e' : '#ef4444';

  return (
    <div style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <RechartTooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [`${(v * 100).toFixed(1)}¢`, 'YES']}
            labelFormatter={() => ''}
          />
          <Area type="monotone" dataKey="p" stroke={color} fill="url(#priceGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
