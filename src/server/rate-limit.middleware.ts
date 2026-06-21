import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function createLimiter(limit: number, windowMs: number) {
  const map = new Map<string, RateLimitEntry>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of map.entries()) {
      if (now > entry.resetAt) map.delete(key);
    }
  }, windowMs);

  return (key: string): { allowed: boolean; remaining: number; retryAfterMs: number } => {
    const now = Date.now();
    const entry = map.get(key);

    if (!entry || now > entry.resetAt) {
      map.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
    }

    if (entry.count >= limit) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }

    entry.count++;
    return { allowed: true, remaining: limit - entry.count, retryAfterMs: 0 };
  };
}

const globalCheck = createLimiter(120, 60_000);
const apiCheck = createLimiter(30, 60_000);

function getKey(req: Request): string {
  return (req as any).uid || req.ip || 'unknown';
}

export function globalRateLimit(req: Request, res: Response, next: NextFunction) {
  if (req.path === '/api/health') return next();

  const key = getKey(req);
  const result = globalCheck(key);

  res.setHeader('X-RateLimit-Limit', '120');
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(429).json({
      error: 'Demasiadas peticiones. Espera un momento antes de volver a intentarlo.',
    });
  }

  next();
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = `api:${getKey(req)}`;
  const result = apiCheck(key);

  res.setHeader('X-RateLimit-Limit', '30');
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));

  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
    return res.status(429).json({
      error: 'Has hecho demasiadas consultas. Espera un momento.',
    });
  }

  next();
}
