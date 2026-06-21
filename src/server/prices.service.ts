// Toda la lógica de obtención de precios, aislada y testeable

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 5000): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
};

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': '*/*, application/json',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

export async function getEurUsdRate(): Promise<number> {
  try {
    const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      return data.rates.EUR || 0.92;
    }
  } catch (e) {
    console.error('[prices] Error fetching exchange rate:', e);
  }
  return 0.92;
}

export async function fetchYahooDirect(symbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;
    const res = await fetchWithTimeout(url, { headers: YAHOO_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (typeof price === 'number') {
        console.log(`[prices] Yahoo direct OK ${symbol}: ${price}`);
        return price;
      }
    }
  } catch (e: any) {
    console.error(`[prices] Yahoo direct failed ${symbol}:`, e.message);
  }
  return null;
}

export async function fetchBinancePrice(symbol: string): Promise<number | null> {
  try {
    const clean = symbol.replace(/[-=]/g, '').toUpperCase();
    const res = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${clean}`);
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.price);
      if (!isNaN(price)) return price;
    }
    if (clean.endsWith('EUR')) {
      const base = clean.replace('EUR', '');
      const resUsdt = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${base}USDT`);
      if (resUsdt.ok) {
        const dataUsdt = await resUsdt.json();
        const usdtPrice = parseFloat(dataUsdt.price);
        if (!isNaN(usdtPrice)) {
          const rate = await getEurUsdRate();
          return usdtPrice * rate;
        }
      }
    }
  } catch {}
  return null;
}

const CRYPTO_IDS: Record<string, string> = {
  'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near',
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
};

export async function fetchCoinCapPrice(symbol: string): Promise<number | null> {
  try {
    const base = symbol.split(/[-=]/)[0].toUpperCase();
    const id = CRYPTO_IDS[base] || base.toLowerCase();
    const res = await fetchWithTimeout(`https://api.coincap.io/v2/assets/${id}`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      const priceUsd = parseFloat(data?.data?.priceUsd);
      if (!isNaN(priceUsd) && priceUsd > 0) {
        const rate = await getEurUsdRate();
        return priceUsd * rate;
      }
    }
  } catch (e: any) {
    console.error(`[prices] CoinCap error ${symbol}:`, e.message);
  }
  return null;
}

export async function fetchKuCoinPrice(symbol: string): Promise<number | null> {
  try {
    const base = symbol.split(/[-=]/)[0].toUpperCase();
    const res = await fetchWithTimeout(`https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=${base}-USDT`, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      const priceUsd = parseFloat(data?.data?.price);
      if (!isNaN(priceUsd) && priceUsd > 0) {
        const rate = await getEurUsdRate();
        return priceUsd * rate;
      }
    }
  } catch (e: any) {
    console.error(`[prices] KuCoin error ${symbol}:`, e.message);
  }
  return null;
}

export async function fetchCoinGeckoPrice(symbol: string): Promise<number | null> {
  try {
    const upper = symbol.toUpperCase();
    const currency = (upper.endsWith('-USD') || upper.endsWith('=USD')) ? 'usd' : 'eur';
    const base = symbol.split(/[-=]/)[0].toUpperCase();
    const cgId = CRYPTO_IDS[base] || base.toLowerCase();
    const response = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${currency}`, {}, 6000
    );
    if (response.status === 429) return null;
    const data: any = await response.json();
    return data[cgId]?.[currency] ?? null;
  } catch (err) {
    console.error(`[prices] CoinGecko failed:`, (err as any).message);
    return null;
  }
}

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'KAS', 'NEAR'];

const priceCache = new Map<string, { price: number; ts: number }>();
const CACHE_TTL = 60_000;

export async function getPriceWithFallbacks(sym: string): Promise<number | null> {
  const cached = priceCache.get(sym);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.price;

  const yDirect = await fetchYahooDirect(sym);
  if (yDirect !== null) {
    priceCache.set(sym, { price: yDirect, ts: Date.now() });
    return yDirect;
  }

  const isCrypto = sym.includes('-') || sym.includes('=') || CRYPTO_SYMBOLS.some(c => sym.includes(c));
  if (isCrypto) {
    const providers: Promise<number | null>[] = [fetchBinancePrice(sym)];

    if (CRYPTO_SYMBOLS.some(c => sym.includes(c))) {
      providers.push(fetchCoinCapPrice(sym));
      if (['KAS', 'NEAR', 'SOL'].some(c => sym.includes(c))) {
        providers.push(fetchKuCoinPrice(sym));
      }
    }

    providers.push(fetchCoinGeckoPrice(sym));

    const results = await Promise.allSettled(providers);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        priceCache.set(sym, { price: r.value, ts: Date.now() });
        return r.value;
      }
    }

    return null;
  }

  const cgPrice = await fetchCoinGeckoPrice(sym);
  if (cgPrice !== null) priceCache.set(sym, { price: cgPrice, ts: Date.now() });
  return cgPrice;
}
