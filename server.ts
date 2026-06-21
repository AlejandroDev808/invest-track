import express, { Request, Response, NextFunction } from "express";
import path from "path";
import YahooFinance from 'yahoo-finance2';
import './src/server/firebase-admin.js'; // inicializa admin al arrancar
import { requireAuth } from './src/server/auth.middleware.js';
import { globalRateLimit, apiRateLimit } from './src/server/rate-limit.middleware.js';
import { getPriceWithFallbacks } from './src/server/prices.service.js';
import { resolveIsin, searchSymbols } from './src/server/search.service.js';
import { getAssetInfo } from './src/server/asset-info.service.js';

const yf: any = (YahooFinance as any).default || YahooFinance;

const MAX_SYMBOLS_PER_REQUEST = 30;

async function startServer() {
  const app = express();

  app.set('trust proxy', 1);

  // Security headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Request logger
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress;
    console.log(`[VISITA] ${new Date().toISOString()} | IP: ${ip} | ${req.method} ${req.path}`);
    next();
  });

  app.use(express.json({ limit: '100kb' }));

  // Rate limit global — 120 req/min por usuario/IP en todas las rutas
  app.use(globalRateLimit);

  // Health check — público
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  // Precios — autenticado + rate limited
  app.get("/api/prices", requireAuth, apiRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const symbolsQuery = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      if (!symbolsQuery) return res.json({});

      const symbolList = symbolsQuery.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS_PER_REQUEST);

      const entries = await Promise.allSettled(
        symbolList.map(async (sym) => {
          let resolvedSym = sym;
          if (sym.length === 12 && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(sym)) {
            resolvedSym = (await resolveIsin(sym, yf)) || sym;
          }
          const price = await getPriceWithFallbacks(resolvedSym);
          return price !== null ? [sym, price] as const : null;
        })
      );

      const results: Record<string, number> = {};
      for (const entry of entries) {
        if (entry.status === 'fulfilled' && entry.value) {
          results[entry.value[0]] = entry.value[1];
        }
      }

      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  // Info de activo — autenticado + rate limited
  app.get("/api/asset-info", requireAuth, apiRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const symbol = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase().slice(0, 30) : '';
      if (!symbol) return res.status(400).json({ error: 'Falta el parámetro symbol.' });
      const info = await getAssetInfo(symbol);
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  // Búsqueda — autenticada + rate limited
  app.get("/api/search", requireAuth, apiRateLimit, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
      if (q.length < 2) return res.json([]);
      const results = await searchSymbols(q, yf);
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  // Frontend
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  // Global error handler — never leak stack traces
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
  });

  app.listen(3000, "0.0.0.0", () => console.log("Server running on http://localhost:3000"));
}

startServer();
