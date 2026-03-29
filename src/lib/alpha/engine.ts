import type { PolymarketMarket, RankedSignal, ScannerType } from '@/types';
import { scanArbitrage } from './scanners/arb';
import { scanSpread } from './scanners/spread';
import { scanVelocity } from './scanners/velocity';
import { scanDivergence } from './scanners/divergence';
import { scanSocial } from './scanners/social';
import { scanCrossDomain } from './scanners/cross-domain';
import { scanSports } from './scanners/sports';
import { scanBaseball } from './scanners/baseball';

export interface ScanResult {
  signals: RankedSignal[];
  byStrategy: Record<ScannerType, RankedSignal[]>;
  totalSignals: number;
  scanDuration: number;
  timestamp: number;
}

export async function runAllScanners(markets: PolymarketMarket[]): Promise<ScanResult> {
  const start = Date.now();

  const [arb, spread, velocity, divergence, social, crossDomain, sports, baseball] = await Promise.allSettled([
    scanArbitrage(markets),
    scanSpread(markets),
    scanVelocity(markets),
    scanDivergence(markets),
    scanSocial(markets),
    scanCrossDomain(markets),
    scanSports(markets),
    scanBaseball(markets),
  ]);

  const byStrategy: Record<ScannerType, RankedSignal[]> = {
    ARB:          arb.status          === 'fulfilled' ? arb.value          : [],
    SPREAD:       spread.status       === 'fulfilled' ? spread.value       : [],
    VELOCITY:     velocity.status     === 'fulfilled' ? velocity.value     : [],
    DIVERGENCE:   divergence.status   === 'fulfilled' ? divergence.value   : [],
    SOCIAL:       social.status       === 'fulfilled' ? social.value       : [],
    CROSS_DOMAIN: crossDomain.status  === 'fulfilled' ? crossDomain.value  : [],
    SPORTS:       sports.status       === 'fulfilled' ? sports.value       : [],
    BASEBALL:     baseball.status     === 'fulfilled' ? baseball.value     : [],
  };

  // Combine and rank all signals
  const allSignals = Object.values(byStrategy).flat();
  const ranked = rankSignals(allSignals);

  return {
    signals: ranked,
    byStrategy,
    totalSignals: ranked.length,
    scanDuration: Date.now() - start,
    timestamp: Date.now(),
  };
}

export async function runScanner(
  type: ScannerType,
  markets: PolymarketMarket[]
): Promise<RankedSignal[]> {
  switch (type) {
    case 'ARB':           return scanArbitrage(markets);
    case 'SPREAD':        return scanSpread(markets);
    case 'VELOCITY':      return scanVelocity(markets);
    case 'DIVERGENCE':    return scanDivergence(markets);
    case 'SOCIAL':        return scanSocial(markets);
    case 'CROSS_DOMAIN':  return scanCrossDomain(markets);
    case 'SPORTS':        return scanSports(markets);
    case 'BASEBALL':      return scanBaseball(markets);
  }
}

function rankSignals(signals: RankedSignal[]): RankedSignal[] {
  return signals
    .map(s => ({
      ...s,
      // Blended ranking: edgeScore * confidence, risk-adjusted
      _rank: (s.edgeScore * (s.confidence / 100)) / Math.max(1, s.riskScore / 50),
    }))
    .sort((a, b) => (b as RankedSignal & { _rank: number })._rank - (a as RankedSignal & { _rank: number })._rank)
    .map(({ ...s }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (s as any)._rank;
      return s;
    });
}
