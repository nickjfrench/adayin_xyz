export interface Currency {
  code?: string;
  name?: string;
  icon?: { provider: string; name: string; svg?: string };
}

interface StopCost {
  cost?: number | null;
  currency?: Currency | null;
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
  const formatted = Number.isInteger(amount) ? `${amount}` : amount.toFixed(2);
  return `${formatted}${code}${pp ? ' PP' : ''}`;
}
