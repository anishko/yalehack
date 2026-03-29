export default function Skeleton({ w = '100%', h = 16, rounded = 4 }: { w?: string | number; h?: number; rounded?: number }) {
  return (
    <div style={{
      width: w,
      height: h,
      background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s ease-in-out infinite',
      borderRadius: rounded,
    }} />
  );
}

export function SkeletonCard() {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton h={14} w="60%" />
      <Skeleton h={10} w="90%" />
      <Skeleton h={10} w="75%" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Skeleton h={24} w={60} />
        <Skeleton h={24} w={80} />
      </div>
    </div>
  );
}
