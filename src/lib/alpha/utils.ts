export function nanoid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
