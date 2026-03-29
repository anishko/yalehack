'use client';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_STEPS = [
  { text: 'INITIALIZING CORE SYSTEMS', delay: 0 },
  { text: 'CONNECTING TO POLYMARKET', delay: 1200 },
  { text: 'LOADING MARKET DATA', delay: 2400 },
  { text: 'SCANNING 8 STRATEGY ENGINES', delay: 3800 },
  { text: 'CALIBRATING SIGNAL PIPELINE', delay: 5200 },
  { text: 'RUNNING RISK ANALYSIS', delay: 6400 },
  { text: 'BUILDING EDGE MODELS', delay: 7600 },
  { text: 'FINALIZING PORTFOLIO STATE', delay: 8800 },
  { text: 'READY', delay: 9600 },
];

const TOTAL_DURATION = 10200;

// ─── Scramble text decode effect ─────────────────────────────────────────────
function ScrambleText({ text, duration = 280 }: { text: string; duration?: number }) {
  const [display, setDisplay] = useState('');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';

  useEffect(() => {
    const len = text.length;
    let frame = 0;
    const totalFrames = Math.ceil(duration / 16);
    const interval = setInterval(() => {
      frame++;
      const progress = Math.min(frame / totalFrames, 1);
      const revealed = Math.floor(progress * len);
      let result = '';
      for (let i = 0; i < len; i++) {
        if (i < revealed) result += text[i];
        else if (text[i] === ' ') result += ' ';
        else result += chars[Math.floor(Math.random() * chars.length)];
      }
      setDisplay(result);
      if (frame >= totalFrames) clearInterval(interval);
    }, 16);
    return () => clearInterval(interval);
  }, [text, duration]);

  return <>{display}</>;
}

// ─── Animated data stream (falling characters) ──────────────────────────────
function DataStream({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const fontSize = 10;
    const columns = Math.floor(width / fontSize);
    const drops = new Array(columns).fill(0).map(() => Math.random() * -50);
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ'.split('');

    let raf: number;
    const draw = () => {
      ctx.fillStyle = 'rgba(9, 9, 11, 0.12)';
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < columns; i++) {
        if (drops[i] < 0) { drops[i] += 0.3; continue; }
        const char = chars[Math.floor(Math.random() * chars.length)];
        const brightness = Math.random();
        if (brightness > 0.96) {
          ctx.fillStyle = 'rgba(6, 182, 212, 0.9)'; // cyan flash
        } else {
          ctx.fillStyle = `rgba(6, 182, 212, ${0.06 + brightness * 0.12})`;
        }
        ctx.font = `${fontSize}px monospace`;
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        drops[i]++;
        if (drops[i] * fontSize > height && Math.random() > 0.975) drops[i] = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, opacity: 0.5 }} />;
}

// ─── Radar sweep ring ────────────────────────────────────────────────────────
function RadarSweep() {
  return (
    <div style={{ position: 'relative', width: 180, height: 180, marginBottom: 24 }}>
      {/* Concentric rings */}
      {[1, 0.7, 0.4].map((scale, i) => (
        <div key={i} style={{
          position: 'absolute', inset: 0, margin: 'auto',
          width: `${scale * 100}%`, height: `${scale * 100}%`,
          borderRadius: '50%',
          border: '1px solid rgba(6, 182, 212, 0.1)',
        }} />
      ))}
      {/* Cross hairs */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(6, 182, 212, 0.08)' }} />
      <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(6, 182, 212, 0.08)' }} />
      {/* Rotating sweep */}
      <div style={{
        position: 'absolute', inset: 0,
        animation: 'radarSweep 3s linear infinite',
      }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', width: '50%', height: 2,
          transformOrigin: 'left center',
          background: 'linear-gradient(90deg, rgba(6,182,212,0.6), transparent)',
          boxShadow: '0 0 12px rgba(6,182,212,0.3)',
        }} />
      </div>
      {/* Blips that appear and fade */}
      {[
        { x: 30, y: 25, delay: 0.5 }, { x: 70, y: 40, delay: 1.8 },
        { x: 45, y: 75, delay: 0.2 }, { x: 80, y: 65, delay: 2.5 },
        { x: 20, y: 55, delay: 1.1 }, { x: 60, y: 20, delay: 3.2 },
      ].map((blip, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${blip.x}%`, top: `${blip.y}%`,
          width: 4, height: 4, borderRadius: '50%',
          background: 'var(--cyan)',
          boxShadow: '0 0 6px var(--cyan)',
          animation: `blipPulse 3s ease-in-out infinite ${blip.delay}s`,
        }} />
      ))}
      {/* Center dot */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 6, height: 6, borderRadius: '50%',
        background: 'var(--cyan)', boxShadow: '0 0 8px var(--cyan)',
      }} />
    </div>
  );
}

// ─── Stat counters that tick up ──────────────────────────────────────────────
function TickingStats({ progress }: { progress: number }) {
  const stats = [
    { label: 'MARKETS', target: 847, fmt: (v: number) => v.toFixed(0) },
    { label: 'SIGNALS', target: 33, fmt: (v: number) => v.toFixed(0) },
    { label: 'LATENCY', target: 42, fmt: (v: number) => `${v.toFixed(0)}ms` },
    { label: 'SCANNERS', target: 8, fmt: (v: number) => `${v.toFixed(0)}/8` },
  ];

  return (
    <div style={{ display: 'flex', gap: 32, marginBottom: 28 }}>
      {stats.map((s, i) => {
        const staggered = Math.max(0, Math.min(1, (progress - i * 0.1) / 0.7));
        const val = s.target * staggered;
        return (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 18, fontWeight: 800, color: 'var(--cyan)',
              fontFamily: "'JetBrains Mono', monospace",
              opacity: 0.4 + staggered * 0.6,
            }}>
              {s.fmt(val)}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main overlay ────────────────────────────────────────────────────────────
export default function LoadingOverlay() {
  const [visible, setVisible] = useState(true);
  const [statusIdx, setStatusIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = STATUS_STEPS.map((step, i) =>
      setTimeout(() => setStatusIdx(i), step.delay),
    );
    const exitTimer = setTimeout(() => setVisible(false), TOTAL_DURATION);

    // Smooth progress
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / TOTAL_DURATION, 1));
      if (elapsed < TOTAL_DURATION) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(exitTimer);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="loading-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Background data stream */}
          <DataStream width={1920} height={1080} />

          {/* Vignette overlay */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, transparent 30%, var(--bg) 80%)',
            pointerEvents: 'none',
          }} />

          {/* Content layer */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Logo — staggered character reveal */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {'LINEUP'.split('').map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontSize: 56, fontWeight: 800, color: 'var(--cyan)',
                    letterSpacing: '0.06em',
                    textShadow: '0 0 40px rgba(6,182,212,0.4), 0 0 80px rgba(6,182,212,0.15)',
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </div>

            {/* Subtitle */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.6 }}
              style={{ fontSize: 11, letterSpacing: '0.2em', color: 'var(--text-muted)', marginBottom: 32, fontWeight: 600 }}
            >
              PREDICTION MARKET ALPHA ENGINE
            </motion.div>

            {/* Radar sweep */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <RadarSweep />
            </motion.div>

            {/* Ticking stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.6 }}
            >
              <TickingStats progress={progress} />
            </motion.div>

            {/* Status text with scramble */}
            <div style={{
              height: 20, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--text-muted)',
              marginBottom: 8,
            }}>
              <ScrambleText key={statusIdx} text={STATUS_STEPS[statusIdx].text} duration={300} />
            </div>

            {/* Percentage */}
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--cyan)',
              fontFamily: "'JetBrains Mono', monospace",
              opacity: 0.6,
            }}>
              {Math.round(progress * 100)}%
            </div>
          </div>

          {/* Progress bar at bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
            background: 'rgba(255,255,255,0.03)',
          }}>
            <div style={{
              height: '100%', width: `${progress * 100}%`,
              background: 'var(--cyan)',
              boxShadow: '0 0 12px var(--cyan), 0 0 24px rgba(6,182,212,0.3)',
              transition: 'width 0.1s linear',
            }} />
          </div>

          {/* Top-left version tag */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2, duration: 0.5 }}
            style={{
              position: 'absolute', top: 16, left: 20,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
              color: 'var(--text-muted)', opacity: 0.4,
            }}
          >
            v1.0.0 — ALPHA
          </motion.div>

          {/* Top-right connection status */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            style={{
              position: 'absolute', top: 16, right: 20,
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
              color: progress > 0.3 ? 'var(--green)' : 'var(--text-muted)',
            }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: progress > 0.3 ? 'var(--green)' : 'var(--border)',
              boxShadow: progress > 0.3 ? '0 0 6px var(--green)' : 'none',
            }} />
            {progress > 0.3 ? 'CONNECTED' : 'CONNECTING'}
          </motion.div>

          <style>{`
            @keyframes radarSweep {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @keyframes blipPulse {
              0%, 100% { opacity: 0; transform: scale(0.5); }
              20%, 40% { opacity: 1; transform: scale(1); }
              60% { opacity: 0.3; transform: scale(0.8); }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
