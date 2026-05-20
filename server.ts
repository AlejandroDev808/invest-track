import express from "express";
import path from "path";
import YahooFinance from 'yahoo-finance2';

// In v3, we usually need to instantiate the class. 
// However, depending on the environment and bundling, the default export might be the instance or the class.
const yf = typeof YahooFinance === 'function' 
  ? new (YahooFinance as any)() 
  : YahooFinance;

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
        console.error(`ISIN resolution error for ${isin}:`, err);
        // Fallback to direct search
        try {
          const urlSearch = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=1&newsCount=0`;
          const resSearch = await fetch(urlSearch, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*, application/json',
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
          console.error(`ISIN direct resolution error for ${isin}:`, errDirect);
        }
      }
      return null;
    };

    const fetchYahooDirect = async (symbol: string): Promise<number | null> => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=${currency}`);
        const data: any = await response.json();
        
        const price = data[cgId]?.[currency];
        return price || null;
      } catch (err) {
        console.error(`[API] CoinGecko fallback failed:`, err);
        return null;
      }
    };

    try {
      const quotes: any = await yf.quote(symbolList);
      const quoteArray = Array.isArray(quotes) ? quotes : [quotes];
      
      for (const sym of symbolList) {
        let currentSym = sym;
        const q = quoteArray.find(item => item && item.symbol === currentSym);
        
        if (q && q.regularMarketPrice) {
          results[sym] = q.regularMarketPrice;
        } else {
          // If sym looks like an ISIN, try resolving it
          if (sym.length === 12 && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(sym)) {
            const resolved = await resolveIsin(sym);
            if (resolved) {
               try {
                 const rq: any = await yf.quote(resolved);
                 if (rq && rq.regularMarketPrice) {
                    results[sym] = rq.regularMarketPrice;
                    continue;
                 }
               } catch (e) {}
               const rsDirect = await fetchYahooDirect(resolved);
               if (rsDirect !== null) {
                 results[sym] = rsDirect;
                 continue;
               }
            }
          }
          let fallbackPrice = await fetchYahooDirect(sym);
          if (fallbackPrice === null) fallbackPrice = await fetchCoinGeckoPrice(sym);
          if (fallbackPrice !== null) results[sym] = fallbackPrice;
        }
      }
      res.json(results);
    } catch (error) {
      console.error("Price fetch error:", error);
      for (const sym of symbolList) {
        try {
          const q: any = await yf.quote(sym);
          if (q && q.regularMarketPrice) {
            results[sym] = q.regularMarketPrice;
          } else {
            // Check ISIN fallback in catch block too
            if (sym.length === 12 && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(sym)) {
              const resIsin = await resolveIsin(sym);
              if (resIsin) {
                try {
                  const rq: any = await yf.quote(resIsin);
                  if (rq && rq.regularMarketPrice) {
                     results[sym] = rq.regularMarketPrice;
                     continue;
                  }
                } catch (e) {}
                const rsDirect = await fetchYahooDirect(resIsin);
                if (rsDirect !== null) {
                  results[sym] = rsDirect;
                  continue;
                }
              }
            }
            let fp = await fetchYahooDirect(sym);
            if (fp === null) fp = await fetchCoinGeckoPrice(sym);
            if (fp !== null) results[sym] = fp;
          }
        } catch (e) {
          let fp = await fetchYahooDirect(sym);
          if (fp === null) fp = await fetchCoinGeckoPrice(sym);
          if (fp !== null) results[sym] = fp;
        }
      }
      res.json(results);
    }
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
