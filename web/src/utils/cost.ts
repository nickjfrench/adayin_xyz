export interface PriceRange {
  value: number | null;
}

export interface Currency {
  code?: string;
  name?: string;
  icon?: { provider: string; name: string; svg?: string };
  ranges?: PriceRange[] | null;
}

interface StopCost {
  cost?: number | null;
  currency?: Currency | null;
}

interface StopLike {
  _type?: string;
  [key: string]: unknown;
}

/** Count only real stops, excluding travel segments. */
export function countStops(stops?: StopLike[] | null): number {
  return (stops ?? []).filter((s) => s._type === 'stop').length;
}

/** Sum costs from a projected array of stop/travel cost objects. Missing values count as 0. */
export function sumCosts(stops?: (StopCost | null)[] | null): number {
  return (stops ?? []).reduce((sum, s) => sum + (s?.cost ?? 0), 0);
}

/** Find the first priced stop's currency for trip display. */
export function tripCurrencyFrom(stops?: (StopCost | null)[] | null): Currency | null {
  return (stops ?? []).find((s) => s?.cost != null && s.cost > 0 && s?.currency)?.currency ?? null;
}

/**
 * Returns the 1-based symbol repeat count for a price within the currency's
 * configured ranges (range i → i+1 symbols), or null when the currency has no
 * ranges configured (caller falls back to numeric priceText).
 * Amount above every defined value → ranges.length + 1 (open-ended catch-all).
 */
export function priceTier(
  amount: number,
  currency?: Currency | null,
): number | null {
  const ranges = currency?.ranges;
  if (!ranges || ranges.length === 0) return null;
  const values = ranges.map((r) => r.value ?? Infinity).sort((a, b) => a - b);
  for (let i = 0; i < values.length; i++) {
    if (amount <= values[i]) return i + 1;
  }
  return values.length + 1;
}

/**
 * Text portion of a price, e.g. "400 AUD PP".
 * Caller renders the currency icon svg separately, then this string.
 * Falls back to "{amount} PP" when currency is missing.
 */
export function priceText(
  amount: number,
  currency?: Currency | null,
  opts: { perPerson?: boolean } = {},
): string {
  const pp = opts.perPerson !== false;
  const code = currency?.code ? ` ${currency.code}` : '';
  const formatted = amount.toFixed(2);
  return `${formatted}${code}${pp ? ' PP' : ''}`;
}
