import { GoogleGenAI } from '@google/genai';
import { admin } from './firebase-admin.js';

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

const descriptionCache = new Map<string, string>();

const CRYPTO_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana',
  'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near',
  'ADA': 'cardano', 'DOT': 'polkadot', 'AVAX': 'avalanche-2',
  'MATIC': 'matic-network', 'LINK': 'chainlink', 'XRP': 'ripple',
  'DOGE': 'dogecoin', 'SHIB': 'shiba-inu', 'UNI': 'uniswap',
  'ATOM': 'cosmos', 'FTM': 'fantom', 'ALGO': 'algorand',
};

const CASH_DESCRIPTION = `La cuenta corriente es el lugar donde guardamos nuestro dinero líquido para el día a día, pero tiene un coste oculto: la inflación. Cada año que tu dinero permanece parado en una cuenta sin rentabilidad, pierde poder adquisitivo. Con una inflación del 3% anual, 10.000€ hoy equivalen a unos 7.400€ en poder de compra dentro de 10 años. Por eso es fundamental no dejar el dinero parado: como mínimo, una cuenta remunerada o un fondo monetario puede compensar parte de esa pérdida mientras mantienes la liquidez. Incluir la cuenta corriente en el seguimiento de tu patrimonio te ayuda a visualizar exactamente cuánto capital está dormido y tomar decisiones informadas sobre dónde moverlo.`;

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

  base.description = await getDescription(symbol, base.name, base.type);

  infoCache.set(symbol, { data: base, ts: Date.now() });
  return base;
}

async function getDescription(symbol: string, name: string, type: string): Promise<string | null> {
  const cacheKey = symbol.toUpperCase();
  console.log(`[asset-info] getDescription called: symbol="${symbol}", name="${name}", type="${type}"`);

  if (descriptionCache.has(cacheKey)) {
    console.log(`[asset-info] ${cacheKey}: hit in-memory cache`);
    return descriptionCache.get(cacheKey)!;
  }

  if (type === 'cash' || symbol === 'EFECTIVO') {
    console.log(`[asset-info] ${cacheKey}: detected as cash`);
    descriptionCache.set(cacheKey, CASH_DESCRIPTION);
    return CASH_DESCRIPTION;
  }

  try {
    const docRef = admin.firestore().collection('assetDescriptions').doc(cacheKey);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const text = docSnap.data()?.description as string;
      if (text) {
        console.log(`[asset-info] ${cacheKey}: hit Firestore cache (${text.length} chars)`);
        descriptionCache.set(cacheKey, text);
        return text;
      }
    }
  } catch (e: any) {
    console.error(`[asset-info] Firestore read error for ${cacheKey}:`, e.message);
  }

  const isCrypto = type === 'cryptocurrency' || symbol.includes('-') || symbol.includes('=');
  console.log(`[asset-info] ${cacheKey}: isCrypto=${isCrypto}, will ${isCrypto ? 'try CoinGecko first' : 'skip CoinGecko, go to Gemini'}`);
  let description: string | null = null;

  if (isCrypto) {
    description = await fetchCoinGeckoDescription(symbol);
    console.log(`[asset-info] ${cacheKey}: CoinGecko result: ${description ? `OK (${description.length} chars)` : 'null'}`);
  }

  if (!description) {
    console.log(`[asset-info] ${cacheKey}: falling back to Gemini (GEMINI_API_KEY ${process.env.GEMINI_API_KEY ? 'is set' : 'NOT SET'})`);
    description = await generateDescriptionWithGemini(symbol, name, type);
    console.log(`[asset-info] ${cacheKey}: Gemini result: ${description ? `OK (${description.length} chars)` : 'null'}`);
  }

  if (description) {
    descriptionCache.set(cacheKey, description);
    try {
      await admin.firestore().collection('assetDescriptions').doc(cacheKey).set({
        symbol: cacheKey,
        name,
        type,
        description,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e: any) {
      console.error(`[asset-info] Firestore write error for ${cacheKey}:`, e.message);
    }
  }

  return description;
}

async function fetchCoinGeckoDescription(symbol: string): Promise<string | null> {
  try {
    const base = symbol.split(/[-=]/)[0].toUpperCase();
    const cgId = CRYPTO_IDS[base] || base.toLowerCase();
    console.log(`[asset-info] CoinGecko: fetching coin "${cgId}" (from symbol "${symbol}", base "${base}")`);
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/coins/${cgId}?localization=true&tickers=false&market_data=false&community_data=false&developer_data=false`,
      {},
      8000,
    );
    if (!res.ok) {
      console.warn(`[asset-info] CoinGecko: HTTP ${res.status} for "${cgId}"`);
      return null;
    }
    const data = await res.json();

    const descEs = data?.description?.es;
    const descEn = data?.description?.en;
    console.log(`[asset-info] CoinGecko "${cgId}": es=${descEs?.length ?? 0} chars, en=${descEn?.length ?? 0} chars`);
    const rawDesc = (descEs && descEs.length > 50) ? descEs : descEn;
    if (!rawDesc || rawDesc.length < 30) return null;

    const cleaned = rawDesc.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').trim();

    if (!descEs || descEs.length < 50) {
      const translated = await translateWithGemini(cleaned, symbol);
      if (translated) return trimToWordLimit(translated, 300);
      console.warn(`[asset-info] CoinGecko "${cgId}": Gemini translation failed, using English description as fallback`);
    }

    return trimToWordLimit(cleaned, 300);
  } catch (e: any) {
    console.error(`[asset-info] CoinGecko description error for ${symbol}:`, e.message);
    return null;
  }
}

async function generateDescriptionWithGemini(symbol: string, name: string, type: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[asset-info] GEMINI_API_KEY not set, skipping description generation');
    return null;
  }

  const typeLabel = type === 'cryptocurrency' ? 'criptomoneda'
    : type === 'mutualfund' ? 'fondo de inversión'
    : type === 'etf' ? 'ETF (fondo cotizado)'
    : 'acción cotizada en bolsa';

  const isFund = type === 'mutualfund' || type === 'etf';
  const displayName = name && name !== symbol ? name : symbol;

  const prompt = isFund
    ? `Escribe un párrafo de 250-300 palabras en español sobre el fondo de inversión "${displayName}" (símbolo: ${symbol}): qué es, quién lo gestiona, su estrategia y objetivo como producto de inversión.

Reglas:
- Escribe en tercera persona y tono informativo profesional
- No uses encabezados, listas ni formato markdown
- No incluyas datos de precio ni recomendaciones de inversión
- Devuelve SOLO el texto, sin introducción ni cierre adicional`
    : `Escribe exactamente un texto informativo de entre 250 y 300 palabras en español sobre "${displayName}" (símbolo: ${symbol}), que es un/una ${typeLabel}.

El texto debe cubrir:
1. Qué es este activo y a qué se dedica la empresa/proyecto/fondo
2. Breve historia: cuándo se creó, quién lo fundó o gestiona
3. Cuál es su objetivo o propuesta de valor para los inversores

Reglas:
- Escribe en tercera persona y tono informativo profesional
- No uses encabezados, listas ni formato markdown
- No incluyas datos de precio ni recomendaciones de inversión
- Devuelve SOLO el texto, sin introducción ni cierre adicional`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    const text = response.text?.trim();
    if (text && text.length > 100) return trimToWordLimit(text, 300);
  } catch (e: any) {
    console.error(`[asset-info] Gemini generation error for ${symbol}:`, e.message);
  }
  return null;
}

async function translateWithGemini(text: string, symbol: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Traduce el siguiente texto sobre ${symbol} al español. Mantén el tono informativo y profesional. Devuelve SOLO la traducción, sin notas ni comentarios:\n\n${text.slice(0, 3000)}`,
    });
    return response.text?.trim() || null;
  } catch (e: any) {
    console.error(`[asset-info] Gemini translation error:`, e.message);
    return null;
  }
}

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  const trimmed = words.slice(0, maxWords).join(' ');
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot > trimmed.length * 0.7) return trimmed.slice(0, lastDot + 1);
  return trimmed + '...';
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
