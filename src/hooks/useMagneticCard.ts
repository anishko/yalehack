'use client';
import { useRef, useCallback, useEffect, useState } from 'react';

export function useMagneticCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const rafId = useRef(0);

  useEffect(() => {
    setIsDesktop(window.matchMedia('(pointer: fine)').matches);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDesktop || !ref.current) return;
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(800px) rotateY(${x * 3}deg) rotateX(${-y * 3}deg)`;

        // Spotlight cursor effect
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        el.style.setProperty('--mouse-x', `${mx}px`);
        el.style.setProperty('--mouse-y', `${my}px`);
      });
    },
    [isDesktop],
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg)';
  }, []);

  return { ref, handleMouseMove, handleMouseLeave, isDesktop };
}
