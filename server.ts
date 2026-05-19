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
      }
      return null;
    };

    const fetchCoinGeckoPrice = async (symbol: string): Promise<number | null> => {
      try {
        const mapping: Record<string, string> = {
          'KAS': 'kaspa', 'KASPA': 'kaspa', 'NEAR': 'near', 'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana'
        };
        const baseSymbol = symbol.split('-')[0].toUpperCase();
        const cgId = mapping[baseSymbol] || baseSymbol.toLowerCase();
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=eur`);
        const data: any = await response.json();
        return data[cgId]?.eur || null;
      } catch (err) {
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
            }
          }
          const fallbackPrice = await fetchCoinGeckoPrice(sym);
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
                const rq: any = await yf.quote(resIsin);
                if (rq && rq.regularMarketPrice) {
                   results[sym] = rq.regularMarketPrice;
                   continue;
                }
              }
            }
            const fp = await fetchCoinGeckoPrice(sym);
            if (fp !== null) results[sym] = fp;
          }
        } catch (e) {
          const fp = await fetchCoinGeckoPrice(sym);
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
      { symbol: 'KAS-USD', shortname: 'Kaspa USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' },
      { symbol: 'NEAR-USD', shortname: 'NEAR Protocol USD', quoteType: 'CRYPTOCURRENCY', exchange: 'CCC' }
    ];
    
    let baseResults: any[] = [];
    const upperQ = q.toUpperCase();
    if (upperQ.includes('BTC') || upperQ.includes('BITCOIN')) baseResults.push(knownCryptoMap[0]);
    if (upperQ.includes('ETH') || upperQ.includes('ETHEREUM')) baseResults.push(knownCryptoMap[1]);
    if (upperQ.includes('SOL') || upperQ.includes('SOLANA')) baseResults.push(knownCryptoMap[2]);
    if (upperQ.includes('KAS') || upperQ.includes('KASPA')) baseResults.push(knownCryptoMap[3]);
    if (upperQ.includes('NEAR')) baseResults.push(knownCryptoMap[4]);
    // Also if the user types exactly BTC-EUR, etc
    if (upperQ === 'BTC-EUR') baseResults = [knownCryptoMap[0]];
    
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
      console.error("Search error (Yahoo):", error.message);
      // In case Yahoo Finance fails (e.g. Render IP block), return at least the base known cryptos if any matched
      if (baseResults.length > 0) {
         return res.json(baseResults);
      }
      
      // Fallback: If no base result matched, return a dummy fallback for them to try adding manually
      res.json([{ symbol: upperQ, shortname: `Manual entry for ${upperQ}`, quoteType: 'UNKNOWN', exchange: 'Manual' }]);
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
