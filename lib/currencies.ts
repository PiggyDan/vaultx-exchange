export interface FiatConfig {
  code: string;
  name: string;
  flag: string;
  decimals: number;
  fallbackRate: number; // units per 1 USD, used when the FX API is unreachable (approximate)
}

export const FIATS: FiatConfig[] = [
  { code: "USD", name: "US Dollar", flag: "🇺🇸", decimals: 2, fallbackRate: 1 },
  { code: "MNT", name: "Mongolian Tögrög", flag: "🇲🇳", decimals: 0, fallbackRate: 3600 },
  { code: "EUR", name: "Euro", flag: "🇪🇺", decimals: 2, fallbackRate: 0.92 },
  { code: "KRW", name: "Korean Won", flag: "🇰🇷", decimals: 0, fallbackRate: 1335 },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", decimals: 2, fallbackRate: 7.2 },
  { code: "JPY", name: "Japanese Yen", flag: "🇯🇵", decimals: 0, fallbackRate: 150 },
];

export const getFiat = (code: string) => FIATS.find((f) => f.code === code) ?? FIATS[0];

const cache = new Map<string, Intl.NumberFormat>();

/** Formats an amount already converted into `fiat`, e.g. ₮231,840,000 or $0.1523. */
export function fmtFiat(value: number, fiat: FiatConfig) {
  const abs = Math.abs(value);
  const d = abs < 10 ? Math.max(fiat.decimals, 4) : abs < 1000 && fiat.decimals === 0 ? 2 : fiat.decimals;
  const key = `${fiat.code}:${d}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: fiat.code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    cache.set(key, f);
  }
  return f.format(value);
}
