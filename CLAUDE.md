# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

InvesTrack Pro ("seguidor-inversiones") — a personal finance dashboard (Spanish UI) for tracking
investments (stocks, crypto, funds, cash) and real-estate properties, computing profit/loss,
portfolio allocation, and net worth. React 19 + Vite frontend, single Express server that also
proxies authenticated price/search requests to Yahoo Finance and crypto exchanges, with Firebase
(Auth + Firestore) as the backend/database.

## Commands

- `npm run dev` — start the dev server (tsx server.ts; Vite runs in middleware mode on the same Express app, http://localhost:3000)
- `npm run build` — build the frontend (vite build) and bundle the server (esbuild → dist/server.cjs)
- `npm start` — run the production build (node dist/server.cjs)
- `npm run lint` — type-check only, no emit (`tsc --noEmit`)
- `npm run clean` — remove dist/ and server.js

There is no test suite configured in this repo.

### Environment

Copy `.env.example` to `.env.local` (or `.env`). Required for the frontend: the six
`VITE_FIREBASE_*` variables (firebase.ts throws at import time if any are missing). For the
server: `FIREBASE_SERVICE_ACCOUNT` (full service-account JSON as a single-line string) — falls
back to `admin.credential.applicationDefault()` if absent. `GEMINI_API_KEY` is optional.

## Architecture

### Single Express server, dual mode (server.ts)

`server.ts` is the only entry point for both dev and prod. In dev it creates a Vite server in
middleware mode and mounts it on the Express app (`appType: "spa"`); in prod it serves the static
`dist/` build and falls back to `index.html` for client-side routing. All API routes are defined
before the frontend middleware. Firebase Admin is initialized as a side effect by importing
`./src/server/firebase-admin.js` at the top of the file.

### Server-side modules (`src/server/`)

- `firebase-admin.ts` — initializes the Admin SDK once (guarded by `admin.apps.length`)
- `auth.middleware.ts` (`requireAuth`) — verifies the `Authorization: Bearer <idToken>` header via
  `admin.auth().verifyIdToken`, attaches `uid` to the request; returns 401 on missing/invalid token
- `rate-limit.middleware.ts` (`rateLimit`) — in-memory sliding-window limiter (60 req/min), keyed
  by `uid` first, then `x-forwarded-for`/socket address; must run **after** `requireAuth` so it can
  key on uid
- `prices.service.ts` — `getPriceWithFallbacks(symbol)` chains multiple price sources in order:
  Yahoo Finance direct → Binance → CoinCap → KuCoin → CoinGecko, short-circuiting on first success;
  crypto detection is heuristic (symbol contains `-`/`=` or a known crypto ticker)
- `search.service.ts` — `searchSymbols`/`resolveIsin` query Yahoo Finance (via `yahoo-finance2` then
  raw HTTP fallback), merging in a small hardcoded `KNOWN_CRYPTOS` list and falling back to
  CoinGecko search; `resolveIsin` is used to translate ISINs (12-char alphanumeric codes) to tickers

Both `/api/prices` and `/api/search` are mounted as `requireAuth, rateLimit` — any new server route
that hits external APIs or Firestore on behalf of a user should follow the same pattern.

### Frontend (`src/`)

- `main.tsx` → `App.tsx` — handles Firebase auth state (`onAuthStateChanged`) and renders either
  the Google-login screen or the authenticated shell + `Dashboard`
- `lib/firebase.ts` — initializes the Firebase client app/Auth/Firestore; validates that all
  `VITE_FIREBASE_*` env vars are present at module load time (throws if not)
- `components/Dashboard.tsx` — the main view: subscribes to the user's `investments` and
  `transactions` Firestore collections in real time (`onSnapshot`), derives `InvestmentSummary[]`
  via `useMemo` (quantities, average price, current value, P/L, portfolio %), fetches live prices
  through `/api/prices` (axios, with the user's Firebase ID token as Bearer auth), and renders the
  stat cards, allocation pie chart, investment cards/modals, and the `TotalWealthBanner`
- `components/PropertySection.tsx` — manages real-estate `Property` documents (own Firestore
  subscription/CRUD) and computes `PropertyStats` (equity, appreciation, LTV, cashflow, yields);
  reports aggregate equity/stats up to `Dashboard` via `onEquityChange`/`onStatsChange` callbacks,
  which feed the net-worth banner
- `components/StatsTable.tsx` — sortable table view of `InvestmentSummary[]`
- `types/index.ts` — shared domain types: `Investment`, `Transaction`, `InvestmentSummary`,
  `Property`, `PropertyStats`
- `lib/utils.ts` — `cn` (clsx + tailwind-merge), `formatCurrency`/`formatPercent` (es-ES/EUR
  Intl formatters; `formatCurrency` auto-scales decimal precision for small values like crypto prices)

### Data model & security (Firestore)

Collections: `investments`, `transactions`, `properties` — all owned by `ownerId` (the Firebase
`uid`). `firestore.rules` denies everything by default and then allowlists per-collection rules:
documents must pass strict shape/type validators (`isValidInvestment`, `isValidTransaction`,
`isValidProperty`), `ownerId` must match `request.auth.uid`, and updates are restricted to specific
field sets (e.g. transactions cannot change `investmentId`/`ownerId`; investments cannot change
`ownerId`/`createdAt` implicitly via the diff check). When adding new Firestore fields or
collections, mirror the change in `firestore.rules` and `types/index.ts` together — the rules are
the actual authorization boundary, not the client code.

An `Investment` is reused across multiple purchases: `Dashboard.handleAddInvestment` looks for an
existing investment with the same `symbol`+`ownerId` before creating a new doc, then always appends
a new `Transaction`. Summaries (`InvestmentSummary`) are derived client-side by aggregating all
transactions per investment — there is no server-side rollup.

### Path alias

`@/*` resolves to the project root (configured in both `tsconfig.json` and `vite.config.ts`), e.g.
`import x from '@/src/lib/utils'`.
