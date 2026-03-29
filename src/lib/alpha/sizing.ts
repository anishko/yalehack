import type { RankedSignal } from '@/types';

export function computeOptimalBetSize(
  signal: RankedSignal,
  portfolioCash: number,
  strategyWeight: number,
  confidence: number
): number {
  const winProb = confidence / 100;
  const lossProb = 1 - winProb;
  const odds = signal.expectedEdge > 0 ? (1 / signal.expectedEdge) : 2;

  const kellyFraction = Math.max(0, (odds * winProb - lossProb) / odds);
  const halfKelly = kellyFraction / 2;

  const maxAllocation = portfolioCash * strategyWeight;
  const kellySize = portfolioCash * halfKelly;

  const betSize = Math.min(kellySize, maxAllocation);
  return Math.max(10, Math.min(betSize, portfolioCash * 0.10));
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  ARB: 0.05,
  SPREAD: 0.20,
  VELOCITY: 0.25,
  DIVERGENCE: 0.15,
  SOCIAL: 0.10,
  CROSS_DOMAIN: 0.25,
};
