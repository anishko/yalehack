'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RechartTooltip } from 'recharts';

export default function EquityCurve({ data }: { data: Array<{ t: number; equity: number }> }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        No equity history yet — place some trades!
      </div>
    );
  }

  const start = data[0].equity;
  const end = data[data.length - 1].equity;
  const isUp = end >= start;
  const color = isUp ? '#22c55e' : '#ef4444';

  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <RechartTooltip
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Equity']}
            labelFormatter={() => ''}
          />
          <Area type="monotone" dataKey="equity" stroke={color} fill="url(#equityGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
