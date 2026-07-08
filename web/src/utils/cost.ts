/**
 * Maps total itinerary cost (sum of stop costs) to a dollar-sign indicator.
 * Edit the `max` values to adjust thresholds. Currency-agnostic —
 * assumes all stops use the same currency.
 */
export const COST_TIERS = [
  {max: 0, symbol: 'Free'},
  {max: 30, symbol: '$'},
  {max: 75, symbol: '$$'},
  {max: 150, symbol: '$$$'},
  {max: Infinity, symbol: '$$$$'},
] as const;

export function costIndicator(total: number): string {
  for (const tier of COST_TIERS) {
    if (total <= tier.max) return tier.symbol;
  }
  return '$$$$';
}
