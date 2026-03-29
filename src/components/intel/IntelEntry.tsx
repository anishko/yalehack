'use client';
import { useState } from 'react';
import type { IntelEntry } from '@/types';

const TIER_COLORS = { VERIFIED: '#22c55e', LIKELY: '#06b6d4', UNCERTAIN: '#eab308', UNVERIFIED: '#ef4444' };

export default function IntelEntryCard({ entry }: { entry: IntelEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = TIER_COLORS[entry.tier];

  const claimTruncated  = entry.claim.length > 120;
  const analysisTruncated = entry.aiAnalysis && entry.aiAnalysis.length > 150;
  const canExpand = claimTruncated || analysisTruncated || entry.relatedMarkets.length > 2;

  return (
    <div style={{
      background: 'var(--bg)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 4,
          background: `${color}22`, color, fontSize: 10, fontWeight: 700,
        }}>
          {entry.tier}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }} data-mono>
          {entry.reliability}% reliable
        </span>
      </div>

      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
        {expanded || !claimTruncated
          ? entry.claim
          : `${entry.claim.slice(0, 120)}…`}
      </p>

      {entry.aiAnalysis && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {expanded || !analysisTruncated
            ? entry.aiAnalysis
            : `${entry.aiAnalysis.slice(0, 150)}…`}
        </p>
      )}

      {/* Matched Polymarket contracts via vector search */}
      {entry.relatedMarkets.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--cyan)', letterSpacing: '0.05em', marginBottom: 4 }}>
            MATCHED CONTRACTS ({entry.relatedMarkets.length})
          </div>
          {entry.relatedMarkets.slice(0, expanded ? 5 : 3).map((q, i) => (
            <div key={i} style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 8, borderLeft: '2px solid var(--cyan)33', marginBottom: 3 }}>
              {q.length > 80 ? `${q.slice(0, 80)}…` : q}
            </div>
          ))}
          {!expanded && entry.relatedMarkets.length > 3 && (
            <div style={{ fontSize: 9, color: 'var(--text-muted)', paddingLeft: 8 }}>
              +{entry.relatedMarkets.length - 3} more
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
        <span>{entry.sources} source{entry.sources !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {canExpand && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--cyan)', fontSize: 10, fontWeight: 700, padding: 0,
              }}
            >
              {expanded ? 'Show less ↑' : 'Read more ↓'}
            </button>
          )}
          <span
            title={
              entry.riskDelta < 0
                ? `Intel CONFIRMS market direction — reduces position risk by ${Math.abs(entry.riskDelta)} pts (scaled by ${entry.reliability}% reliability)`
                : entry.riskDelta > 0
                ? `Intel CONTRADICTS market direction — raises position risk by ${entry.riskDelta} pts (scaled by ${entry.reliability}% reliability)`
                : 'Neutral intel — no risk adjustment applied'
            }
            style={{
              cursor: 'help',
              color: entry.riskDelta > 0 ? 'var(--red)' : entry.riskDelta < 0 ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            {entry.riskDelta < 0 ? '✓ Confirms' : entry.riskDelta > 0 ? '⚠ Contradicts' : '— Neutral'}{' '}
            Risk {entry.riskDelta > 0 ? `+${entry.riskDelta}` : entry.riskDelta < 0 ? entry.riskDelta : '0'}
          </span>
        </div>
      </div>
    </div>
  );
}
