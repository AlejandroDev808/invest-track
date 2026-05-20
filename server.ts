import express from "express";
import path from "path";
import YahooFinance from 'yahoo-finance2';

// Standard handling for different bundle/import styles
const yf: any = (YahooFinance as any).default || YahooFinance;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // API routes
  app.get("/api/prices", async (req, res) => {
    const symbolsQuery = req.query.symbols as string;
    if (!symbolsQuery) return res.json({});

    const symbolList = symbolsQuery.split(',').map(s => s.trim().toUpperCase());
    const results: Record<string, number> = {};

    const fetchWithTimeout = async (url: string, options: any = {}, timeout = 5000) => {
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

    const resolveIsin = async (isin: string): Promise<string | null> => {
      try {
        console.log(`[API] Attempting to resolve ISIN: ${isin}`);
        const search = await yf.search(isin);
        if (search.quotes && search.quotes.length > 0) {
          const res = search.quotes[0].symbol;
          console.log(`[API] Resolved ${isin} to ${res}`);
          return res;
        }
      } catch (err) {
        console.error(`ISIN resolution error for ${isin}:`, (err as any).message);
        // Fallback to direct search
        try {
          const urlSearch = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=1&newsCount=0`;
          const resSearch = await fetchWithTimeout(urlSearch, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              'Accept': 'application/json',
              'Origin': 'https://finance.yahoo.com',
              'Referer': 'https://finance.yahoo.com/'
            }
          });
          if (resSearch.ok) {
            const data = await resSearch.json();
            if (data?.quotes && data.quotes.length > 0 && data.quotes[0].symbol) {
               const resDirect = data.quotes[0].symbol;
               console.log(`[API] Resolved ${isin} to ${resDirect} via direct fetch`);
               return resDirect;
            }
          }
        } catch (errDirect) {
          console.error(`ISIN direct resolution error for ${isin}:`, (errDirect as any).message);
        }
      }
      return null;
    };

    const fetchYahooDirect = async (symbol: string): Promise<number | null> => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': '*/*, application/json',
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com/'
          }
        });
        if (res.ok) {
          const data = await res.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (typeof price === 'number') {
            console.log(`[API] Direct Yahoo API success for ${symbol}: ${price}`);
            return price;
          }
        }
      } catch (e: any) {
        console.error(`[API] Direct Yahoo API failed for ${symbol}:`, e.message);
      }
      return null;
    };

    const getEurUsdRate = async (): Promise<number> => {
      try {
        const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD');
        if (res.ok) {
          const data = await res.json();
          return data.rates.EUR || 0.92; // Fallback to 0.92 if not found
        }
      } catch (e) {
        console.error("[API] Error fetching exchange rate:", e);
      }
      return 0.92;
    };

    const fetchBinancePrice = async (symbol: string): Promise<number | null> => {
       try {
         // Convert Yahoo style BTC-EUR to BTCEUR
         let clean = symbol.replace(/[-=]/g, '').toUpperCase();
         
         // Try direct pair first
         let res = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${clean}`);
         if (res.ok) {
           const data = await res.json();
           const price = parseFloat(data.price);
           if (!isNaN(price)) {
             console.log(`[API] Binance direct success for ${symbol}: ${price}`);
             return price;
           }
         }

         // If direct fails (common for EUR pairs on Binance except main ones), try USDT and convert
         if (clean.endsWith('EUR')) {
            const base = clean.replace('EUR', '');
            const usdtPair = `${base}USDT`;
            console.log(`[API] Trying Binance USDT fallback for ${symbol} via ${usdtPair}`);
            const resUsdt = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${usdtPair}`);
            if (resUsdt.ok) {
              const dataUsdt = await resUsdt.json();
              const usdtPrice = parseFloat(dataUsdt.price);
              if (!isNaN(usdtPrice)) {
                const rate = await getEurUsdRate();
                const converted = usdtPrice * rate;
                console.log(`[API] Binance USDT success for ${symbol}: ${usdtPrice} USD -> ${converted} EUR (rate: ${rate})`);
                return converted;
              }
            }
         }
       } catch (e) {}
       return null;
    };

    const fetchCoinCapPrice = async (symbol: string): Promise<number | null> => {
      try {
        const mapping: Record<string, string> = {
          'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near-protocol', 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana'
        };
        const base = symbol.split(/[-=]/)[0].toUpperCase();
        const id = mapping[base] || base.toLowerCase();
        
        const res = await fetchWithTimeout(`https://api.coincap.io/v2/assets/${id}`);
        if (res.ok) {
          const data = await res.json();
          const priceUsd = parseFloat(data.data.priceUsd);
          if (!isNaN(priceUsd)) {
            const rate = await getEurUsdRate();
            const converted = priceUsd * rate;
            console.log(`[API] CoinCap success for ${symbol}: ${priceUsd} USD -> ${converted} EUR`);
            return converted;
          }
        }
      } catch (e) {}
      return null;
    };

    const fetchCoinGeckoPrice = async (symbol: string): Promise<number | null> => {
      try {
        const mapping: Record<string, string> = {
          'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near', 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana'
        };
        const upper = symbol.toUpperCase();
        const isUsd = upper.endsWith('-USD') || upper.endsWith('=USD');
        const currency = isUsd ? 'usd' : 'eur';
        
        const baseSymbol = symbol.split(/[-=]/)[0].toUpperCase();
        const cgId = mapping[baseSymbol] || baseSymbol.toLowerCase();
        
        console.log(`[API] CoinGecko fallback for ${symbol}: ID=${cgId}, Currency=${currency}`);
        const response = await fetchWithTimeout(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${currency}`, {}, 6000);
        
        if (response.status === 429) {
          console.error(`[API] CoinGecko throttled for ${symbol}`);
          return null;
        }

        const data: any = await response.json();
        const price = data[cgId]?.[currency];
        if (price) {
          console.log(`[API] CoinGecko success for ${symbol}: ${price}`);
          return price;
        }
        return null;
      } catch (err) {
        console.error(`[API] CoinGecko fallback failed:`, (err as any).message);
        return null;
      }
    };

    const getPriceWithFallbacks = async (sym: string): Promise<number | null> => {
       // 1. Try Yahoo Direct Fetch
       const yDirect = await fetchYahooDirect(sym);
       if (yDirect !== null) return yDirect;

       // 2. Try Binance
       if (sym.includes('-') || sym.includes('=') || ['BTC', 'ETH', 'SOL', 'KAS', 'NEAR'].some(c => sym.includes(c))) {
         const bPrice = await fetchBinancePrice(sym);
         if (bPrice !== null) return bPrice;
       }

       // 3. Try CoinCap (New Fallback)
       if (['KAS', 'NEAR', 'BTC', 'ETH', 'SOL'].some(c => sym.includes(c))) {
         const cpPrice = await fetchCoinCapPrice(sym);
         if (cpPrice !== null) return cpPrice;
       }

       // 4. Try CoinGecko
       const cgPrice = await fetchCoinGeckoPrice(sym);
       if (cgPrice !== null) return cgPrice;

       return null;
    };

    for (const sym of symbolList) {
       let resolvedSym = sym;
       // Handle ISIN resolution
       if (sym.length === 12 && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(sym)) {
         resolvedSym = await resolveIsin(sym) || sym;
       }

       const price = await getPriceWithFallbacks(resolvedSym);
       if (price !== null) results[sym] = price;
    }

    res.json(results);
  });

  app.get("/api/search", async (req, res) => {
    const q = req.query.q as string;
    console.log(`[API] Searching for: "${q}"`);
    if (!q || q.length < 2) return res.json([]);
    
    // Known fallbacks that are always returned for matching queries
    const knownCryptoMap = [
      { symbol: 'BTC-EUR', shortname: 'Bitcoin EUR', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'ETH-EUR', shortname: 'Ethereum EUR', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'SOL-EUR', shortname: 'Solana EUR', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'KAS-EUR', shortname: 'Kaspa EUR', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'NEAR-EUR', shortname: 'NEAR Protocol EUR', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'KAS-USD', shortname: 'Kaspa USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'NEAR-USD', shortname: 'NEAR Protocol USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' }
    ];
    
    let baseResults: any[] = [];
    const upperQ = q.toUpperCase();
    if (upperQ.includes('BTC') || upperQ.includes('BITCOIN')) baseResults.push(knownCryptoMap[0]);
    if (upperQ.includes('ETH') || upperQ.includes('ETHEREUM')) baseResults.push(knownCryptoMap[1]);
    if (upperQ.includes('SOL') || upperQ.includes('SOLANA')) baseResults.push(knownCryptoMap[2]);
    if (upperQ.includes('KAS') || upperQ.includes('KASPA')) {
      baseResults.push(knownCryptoMap[3]);
      baseResults.push(knownCryptoMap[5]);
    }
    if (upperQ.includes('NEAR')) {
      baseResults.push(knownCryptoMap[4]);
      baseResults.push(knownCryptoMap[6]);
    }
    
    // Also if the user types exactly BTC-EUR, etc
    knownCryptoMap.forEach(item => {
      if (upperQ === item.symbol) baseResults = [item];
    });
    
    try {
      // Increase count and allow for more broad results
      const result: any = await yf.search(q, { quotesCount: 25, newsCount: 0 });
      console.log(`[API] Found ${result.quotes?.length || 0} quotes for "${q}"`);
      // Filter results that have at least a symbol
      let filtered = (result.quotes || []).filter((item: any) => item.symbol);
      
      // Merge base results, avoiding duplicates
      const finalResults = [...baseResults];
      for (const item of filtered) {
        if (!finalResults.some(r => r.symbol === item.symbol)) {
          finalResults.push(item);
        }
      }
      
      res.json(finalResults);
    } catch (error: any) {
      console.error("Search error (Yahoo yf2):", error.message);
      
      try {
        console.log(`[API] Attempting direct Yahoo search fallback for "${q}"...`);
        const urlSearch = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
        const resSearch = await fetch(urlSearch, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*, application/json',
            'Origin': 'https://finance.yahoo.com',
            'Referer': 'https://finance.yahoo.com/'
          }
        });
        if (resSearch.ok) {
          const directData = await resSearch.json();
          let directQuotes = (directData.quotes || []).filter((item: any) => item.symbol);
          if (directQuotes.length > 0) {
            const finalDirectResults = [...baseResults];
            for (const item of directQuotes) {
              if (!finalDirectResults.some(r => r.symbol === item.symbol)) {
                finalDirectResults.push(item);
              }
            }
            return res.json(finalDirectResults);
          }
        }
      } catch (errDirect) {
        console.error("Direct Yahoo search fallback error:", errDirect);
      }
      
      try {
        console.log(`[API] Attempting CoinGecko search fallback for "${q}"...`);
        const cgSearchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
        if (cgSearchRes.ok) {
          const cgData = await cgSearchRes.json();
          if (cgData.coins && cgData.coins.length > 0) {
            const cgResults = cgData.coins.slice(0, 10).map((coin: any) => ({
              symbol: `${coin.symbol.toUpperCase()}-USD`, // CoinGecko doesn't give Yahoo symbols, but we can guess X-USD
              shortname: coin.name,
              quoteType: 'CRYPTOCURRENCY',
              exchange: 'CoinGecko'
            }));
            
            // Merge base results
            const finalCgResults = [...baseResults];
            for (const item of cgResults) {
              if (!finalCgResults.some(r => r.symbol === item.symbol)) {
                finalCgResults.push(item);
              }
            }
            return res.json(finalCgResults);
          }
        }
      } catch (cgError) {
        console.error("CoinGecko search fallback error:", cgError);
      }

      // In case Yahoo Finance and CoinGecko fail (e.g. Render IP block), return at least the base known cryptos if any matched
      if (baseResults.length > 0) {
         return res.json(baseResults);
      }
      
      // Fallback: If no base result matched, return a dummy fallback for them to try adding manually
      res.json([{ symbol: upperQ, shortname: `Entrada manual para ${upperQ} (Consulta fallida en Render)`, quoteType: 'UNKNOWN', exchange: 'Manual' }]);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
