/**
 * Tipo de cambio USD→BOB del dólar PARALELO (blue) de Bolivia.
 *
 * El dólar oficial (~6.96) está anclado por el BCB y no refleja el precio real
 * de compra; usamos el USDT/BOB de Binance P2P como proxy estándar de facto del
 * paralelo. Con caché de 1h (revalidación en segundo plano, sin latencia para el
 * usuario) y fallback fijo: la landing nunca se rompe si Binance no responde o
 * devuelve un valor fuera de rango.
 */
// Valor de respaldo si Binance no responde. Se actualiza a mano de vez en
// cuando para que no quede muy lejos del paralelo real (jul 2026: ~11.5).
export const USD_BOB_FALLBACK = 11.5;

// Rango de cordura: fuera de esto asumimos dato inválido (p. ej. el oficial
// anclado, o basura del endpoint) y caemos al fallback.
const MIN_RATE = 7;
const MAX_RATE = 20;

interface BinanceAdv {
  adv?: { price?: string };
}

export interface UsdBobRate {
  /** Bs por 1 USD. */
  rate: number;
  /** true si vino en vivo de Binance; false si es el fallback. */
  live: boolean;
}

export async function getUsdBobRate(): Promise<UsdBobRate> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fiat: 'BOB',
        asset: 'USDT',
        // Anuncios donde el comerciante VENDE USDT: es el precio al que un
        // boliviano compra dólares. Tomamos la mediana de varios para robustez.
        tradeType: 'SELL',
        page: 1,
        rows: 10,
        payTypes: [],
        countries: [],
      }),
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { rate: USD_BOB_FALLBACK, live: false };

    const json = (await res.json()) as { data?: BinanceAdv[] };
    const prices = (json.data ?? [])
      .map((d) => Number(d.adv?.price))
      .filter((n) => Number.isFinite(n) && n >= MIN_RATE && n <= MAX_RATE)
      .sort((a, b) => a - b);
    if (prices.length === 0) return { rate: USD_BOB_FALLBACK, live: false };

    const median = prices[Math.floor(prices.length / 2)];
    return { rate: Math.round(median * 100) / 100, live: true };
  } catch {
    return { rate: USD_BOB_FALLBACK, live: false };
  }
}
