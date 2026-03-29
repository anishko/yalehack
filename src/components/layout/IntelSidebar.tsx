'use client';
import { useState } from 'react';
import IntelInput from '@/components/intel/IntelInput';
import IntelEntryCard from '@/components/intel/IntelEntry';
import type { IntelEntry } from '@/types';

export default function IntelSidebar() {
  const [entries, setEntries] = useState<IntelEntry[]>([]);

  const handleNew = (entry: IntelEntry) => {
    setEntries(prev => [entry, ...prev]);
  };

  return (
    <div style={{
      width: 300, minWidth: 300, maxWidth: 300,
      background: 'var(--bg-card)',
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      position: 'sticky',
      top: 0,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.05em' }}>
          INTEL SIDEBAR
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Paste URLs, tips, or what you know
        </p>
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
        <IntelInput onNewEntry={handleNew} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
            <p style={{ margin: 0 }}>Add intel to see reliability scores and market impact</p>
          </div>
        ) : (
          <>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              RECENT INTEL
            </p>
            {entries.map(e => <IntelEntryCard key={e.id} entry={e} />)}
          </>
        )}
      </div>
    </div>
  );
}
