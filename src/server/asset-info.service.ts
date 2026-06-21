const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': '*/*, application/json',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
};

const fetchWithTimeout = async (url: string, options: any = {}, timeout = 6000): Promise<Response> => {
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

export interface AssetInfo {
  symbol: string;
  name: string;
  type: string;
  sector: string | null;
  description: string | null;
  logoUrl: string | null;
  exchange: string | null;
  currency: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
}

const infoCache = new Map<string, { data: AssetInfo; ts: number }>();
const INFO_CACHE_TTL = 5 * 60_000;

export async function getAssetInfo(symbol: string): Promise<AssetInfo> {
  const cached = infoCache.get(symbol);
  if (cached && Date.now() - cached.ts < INFO_CACHE_TTL) return cached.data;

  const base: AssetInfo = {
    symbol,
    name: symbol,
    type: 'unknown',
    sector: null,
    description: null,
    logoUrl: null,
    exchange: null,
    currency: null,
    currentPrice: null,
    previousClose: null,
    dayChange: null,
    dayChangePercent: null,
  };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await fetchWithTimeout(url, { headers: YAHOO_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        base.name = meta.longName || meta.shortName || symbol;
        base.exchange = meta.exchangeName || null;
        base.currency = meta.currency || null;
        base.currentPrice = meta.regularMarketPrice ?? null;
        base.previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
        base.type = meta.instrumentType?.toLowerCase() || guessType(symbol);

        if (base.currentPrice != null && base.previousClose != null && base.previousClose > 0) {
          base.dayChange = base.currentPrice - base.previousClose;
          base.dayChangePercent = (base.dayChange / base.previousClose) * 100;
        }
      }
    }
  } catch {}

  try {
    const searchUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=1&newsCount=0`;
    const searchRes = await fetchWithTimeout(searchUrl, { headers: YAHOO_HEADERS });
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const quote = searchData?.quotes?.[0];
      if (quote) {
        if (!base.name || base.name === symbol) base.name = quote.longname || quote.shortname || base.name;
        if (!base.sector) base.sector = quote.sector || quote.industry || null;
        if (quote.quoteType) base.type = quote.quoteType.toLowerCase();
      }
    }
  } catch {}

  if (base.type === 'cryptocurrency' || symbol.includes('-') || symbol.includes('=')) {
    base.logoUrl = null;
  } else {
    base.logoUrl = `https://logo.clearbit.com/${guessDomain(base.name, symbol)}`;
  }

  infoCache.set(symbol, { data: base, ts: Date.now() });
  return base;
}

function guessType(symbol: string): string {
  if (symbol.includes('-') || symbol.includes('=')) return 'cryptocurrency';
  return 'equity';
}

function guessDomain(name: string, symbol: string): string {
  const clean = name.toLowerCase()
    .replace(/,?\s*(inc|corp|ltd|llc|plc|sa|ag|se|nv|co|group|holdings|international)\.?/gi, '')
    .trim()
    .split(/\s+/)[0];
  if (clean && clean.length > 2) return `${clean}.com`;
  return `${symbol.toLowerCase()}.com`;
}
