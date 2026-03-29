'use client';

const CATEGORIES = ['All', 'Crypto', 'Politics', 'Sports', 'Finance', 'Tech', 'Geopolitics', 'General'];

interface CategoryFilterProps {
  selected: string;
  onChange: (cat: string) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CATEGORIES.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          style={{
            padding: '5px 12px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid',
            transition: 'all 0.15s',
            background: selected === cat ? 'var(--cyan-dim)' : 'var(--bg-card)',
            borderColor: selected === cat ? 'var(--cyan)' : 'var(--border)',
            color: selected === cat ? 'var(--cyan)' : 'var(--text-secondary)',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
