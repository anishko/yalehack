'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Asset { symbol: string; label: string; quote: { c: number; dp: number } | null }

export default function Header({ onScan }: { onScan?: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [cash, setCash] = useState(10000);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    fetch('/api/finance/overview').then(r => r.json()).then(d => setAssets(d.assets || [])).catch(() => {});
    fetch('/api/portfolio').then(r => r.json()).then(d => setCash(d.cash || 10000)).catch(() => {});
  }, []);

  const handleScan = async () => {
    setIsScanning(true);
    onScan?.();
    setTimeout(() => setIsScanning(false), 3000);
  };

  const handleDeposit = async (amount: number) => {
    const res = await fetch('/api/portfolio/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount }) });
    const data = await res.json();
    if (data.newBalance) { setCash(data.newBalance); setShowDeposit(false); }
  };

  const assetDisplay = assets.slice(0, 6);

  return (
    <>
      <header style={{
        background: 'rgba(17,17,20,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '0 20px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 52 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan)', letterSpacing: '-0.5px' }}>
                LINEUP
              </span>
            </Link>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--green)' }}>
              <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
              LIVE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Ticker assets */}
            <div style={{ display: 'flex', gap: 12 }}>
              {assetDisplay.map(a => (
                <span key={a.symbol} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{a.label.split('/')[0]}</span>{' '}
                  {a.quote ? (
                    <span style={{ color: a.quote.dp >= 0 ? 'var(--green)' : 'var(--red)' }} data-mono>
                      {a.quote.dp >= 0 ? '+' : ''}{a.quote.dp.toFixed(2)}%
                    </span>
                  ) : '—'}
                </span>
              ))}
            </div>

            <button
              onClick={handleScan}
              disabled={isScanning}
              style={{
                padding: '7px 16px', borderRadius: 8,
                background: isScanning ? 'var(--bg-hover)' : 'var(--cyan-dim)',
                border: '1px solid var(--cyan)',
                color: 'var(--cyan)', fontSize: 12, fontWeight: 700,
                cursor: isScanning ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'transform 0.15s ease',
              }}
              onMouseDown={e => { if (!isScanning) (e.currentTarget.style.transform = 'scale(0.96)'); }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {isScanning ? 'SCANNING...' : '⚡ SCAN NOW'}
            </button>

            <Link href="/portfolio" style={{ textDecoration: 'none' }}>
              <button
                onClick={() => setShowDeposit(false)}
                style={{
                  padding: '7px 14px', borderRadius: 8,
                  background: 'var(--green-dim)', border: '1px solid var(--green)',
                  color: 'var(--green)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                💰 ${cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </button>
            </Link>

            <button
              onClick={() => setShowDeposit(true)}
              style={{
                padding: '7px 10px', borderRadius: 8,
                background: 'var(--bg-hover)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
              }}
            >
              + Deposit
            </button>
          </div>
        </div>

        {/* Nav row */}
        <div style={{ display: 'flex', gap: 20, paddingBottom: 8 }}>
          {[
            { href: '/', label: 'Dashboard' },
            { href: '/portfolio', label: 'Portfolio' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none', fontSize: 12, color: 'var(--text-secondary)', paddingBottom: 4 }}>
              {label}
            </Link>
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', paddingBottom: 4 }}>
            🔗 Connect Wallet — Coming Soon
          </span>
        </div>
      </header>

      {/* Deposit Modal */}
      {showDeposit && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowDeposit(false)}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 320,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Add Simulated Funds</h3>
            <input
              type="number"
              value={depositAmount}
              onChange={e => setDepositAmount(e.target.value)}
              placeholder="Amount ($)"
              style={{
                width: '100%', padding: '10px 12px', marginBottom: 12,
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', fontSize: 14, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[1000, 5000, 10000, 25000].map(amt => (
                <button key={amt} onClick={() => handleDeposit(amt)} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11,
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                }}>
                  ${(amt / 1000).toFixed(0)}K
                </button>
              ))}
            </div>
            <button onClick={() => depositAmount && handleDeposit(Number(depositAmount))} style={{
              width: '100%', padding: '10px', borderRadius: 8,
              background: 'var(--green-dim)', border: '1px solid var(--green)',
              color: 'var(--green)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}>
              Add Funds
            </button>
          </div>
        </div>
      )}
    </>
  );
}
