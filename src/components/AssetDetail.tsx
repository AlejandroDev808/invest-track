import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, getIdToken } from 'firebase/auth';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Investment, Transaction } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import {
  ArrowLeft, TrendingUp, TrendingDown, Briefcase, Coins, Landmark, Wallet,
  Calendar, RefreshCcw, Globe, BarChart3, ImageOff,
} from 'lucide-react';
import { motion } from 'motion/react';
import axios from 'axios';

interface AssetInfo {
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

export default function AssetDetail({ user }: { user: User }) {
  const { symbol } = useParams<{ symbol: string }>();
  const navigate = useNavigate();

  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoadingInfo(true);
    setLogoError(false);

    (async () => {
      try {
        const token = auth.currentUser ? await getIdToken(auth.currentUser) : '';
        const res = await axios.get('/api/asset-info', {
          params: { symbol },
          headers: { Authorization: `Bearer ${token}` },
        });
        setAssetInfo(res.data);
      } catch {
        setAssetInfo(null);
      } finally {
        setLoadingInfo(false);
      }
    })();
  }, [symbol]);

  useEffect(() => {
    const qInv = query(collection(db, 'investments'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(qInv, (snap) => {
      setInvestments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Investment)));
    });
    return () => unsub();
  }, [user.uid]);

  useEffect(() => {
    const qTx = query(collection(db, 'transactions'), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
    });
    return () => unsub();
  }, [user.uid]);

  const matchingInvestments = useMemo(
    () => investments.filter(inv => inv.symbol === symbol),
    [investments, symbol],
  );
  const investmentIds = useMemo(
    () => new Set(matchingInvestments.map(inv => inv.id)),
    [matchingInvestments],
  );
  const assetTransactions = useMemo(
    () =>
      transactions
        .filter(tx => investmentIds.has(tx.investmentId))
        .sort((a, b) => {
          const da = a.date instanceof Timestamp ? a.date.toMillis() : (a.date?.seconds * 1000 || 0);
          const db_ = b.date instanceof Timestamp ? b.date.toMillis() : (b.date?.seconds * 1000 || 0);
          return db_ - da;
        }),
    [transactions, investmentIds],
  );

  const totals = useMemo(() => {
    const totalQty = assetTransactions.reduce((a, tx) => a + tx.quantity, 0);
    const totalInvested = assetTransactions.reduce((a, tx) => a + tx.quantity * tx.pricePerUnit + tx.commission, 0);
    const totalCommission = assetTransactions.reduce((a, tx) => a + tx.commission, 0);
    return { totalQty, totalInvested, totalCommission };
  }, [assetTransactions]);

  const inv = matchingInvestments[0];
  const TypeIcon = inv?.type === 'crypto' ? Coins : inv?.type === 'fund' ? Landmark : inv?.type === 'cash' ? Wallet : Briefcase;

  const dayPositive = (assetInfo?.dayChange ?? 0) >= 0;

  if (!symbol) {
    navigate('/');
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600 transition-colors"
      >
        <ArrowLeft size={16} />
        Volver al Dashboard
      </button>

      {loadingInfo ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCcw size={24} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {/* ── Sección 1: Infografía ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
          >
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Logo / Icono */}
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
                {assetInfo?.logoUrl && !logoError ? (
                  <img
                    src={assetInfo.logoUrl}
                    alt={assetInfo.name}
                    className="w-12 h-12 object-contain"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <TypeIcon size={28} className="text-slate-400" />
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    {assetInfo?.name || symbol}
                  </h1>
                  <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-lg uppercase tracking-tight">
                    {symbol}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  {assetInfo?.type && (
                    <span className="font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wider">
                      {assetInfo.type === 'equity' ? 'Acción' : assetInfo.type === 'cryptocurrency' ? 'Cripto' : assetInfo.type === 'etf' ? 'ETF' : assetInfo.type === 'mutualfund' ? 'Fondo' : assetInfo.type}
                    </span>
                  )}
                  {assetInfo?.sector && (
                    <span className="font-medium">{assetInfo.sector}</span>
                  )}
                  {assetInfo?.exchange && (
                    <span className="flex items-center gap-1 font-medium">
                      <Globe size={10} />
                      {assetInfo.exchange}
                    </span>
                  )}
                  {assetInfo?.currency && (
                    <span className="font-medium text-slate-400">{assetInfo.currency}</span>
                  )}
                </div>
              </div>
            </div>

          </motion.div>

          {/* ── Sección 2: Sobre este activo ── */}
          {assetInfo?.description && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
            >
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Sobre este activo</h2>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {assetInfo.description}
              </p>
            </motion.div>
          )}

          {/* ── Sección 3: Cotización actual ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precio actual</p>
              <p className="text-3xl font-black tracking-tight">
                {assetInfo?.currentPrice != null ? formatCurrency(assetInfo.currentPrice) : '--'}
              </p>
              {assetInfo?.currency && assetInfo.currency !== 'EUR' && (
                <p className="text-xs text-slate-400">{assetInfo.currency}</p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variación del día</p>
              {assetInfo?.dayChange != null ? (
                <div className={cn('flex items-center gap-2', dayPositive ? 'text-emerald-600' : 'text-rose-600')}>
                  {dayPositive ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                  <span className="text-2xl font-black">
                    {dayPositive ? '+' : ''}{formatCurrency(assetInfo.dayChange)}
                  </span>
                </div>
              ) : (
                <p className="text-2xl font-black text-slate-300">--</p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Variación %</p>
              {assetInfo?.dayChangePercent != null ? (
                <div className={cn('flex items-center gap-2', dayPositive ? 'text-emerald-600' : 'text-rose-600')}>
                  <span className={cn('text-2xl font-black px-3 py-1 rounded-xl', dayPositive ? 'bg-emerald-50' : 'bg-rose-50')}>
                    {dayPositive ? '+' : ''}{assetInfo.dayChangePercent.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <p className="text-2xl font-black text-slate-300">--</p>
              )}
              {assetInfo?.previousClose != null && (
                <p className="text-xs text-slate-400">Cierre anterior: {formatCurrency(assetInfo.previousClose)}</p>
              )}
            </div>
          </motion.div>

          {/* ── Sección 3: Historial de transacciones ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
          >
            <div className="p-6 pb-4 flex items-center justify-between border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <BarChart3 size={18} className="text-slate-500" />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Mis Transacciones</h2>
                  <p className="text-xs text-slate-400">{assetTransactions.length} operacion{assetTransactions.length !== 1 ? 'es' : ''} registrada{assetTransactions.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            {assetTransactions.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <p className="text-sm font-bold text-slate-500">Sin transacciones para este activo</p>
                <p className="text-xs text-slate-400">Añade una compra desde el Dashboard para verla aquí.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <th className="pl-6 pr-3 pb-3 pt-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                      <th className="px-3 pb-3 pt-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cantidad</th>
                      <th className="px-3 pb-3 pt-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Precio Unit.</th>
                      <th className="px-3 pb-3 pt-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comisión</th>
                      <th className="px-3 pr-6 pb-3 pt-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {assetTransactions.map((tx, i) => {
                      const total = tx.quantity * tx.pricePerUnit + tx.commission;
                      const dateStr = tx.date?.toDate
                        ? tx.date.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                        : 'Pendiente';
                      return (
                        <motion.tr
                          key={tx.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="pl-6 pr-3 py-4">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                              <Calendar size={12} className="text-slate-400" />
                              {dateStr}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-right text-sm font-semibold text-slate-700 tabular-nums">
                            {tx.quantity}
                          </td>
                          <td className="px-3 py-4 text-right text-sm font-semibold text-slate-700 tabular-nums">
                            {formatCurrency(tx.pricePerUnit)}
                          </td>
                          <td className="px-3 py-4 text-right text-sm text-slate-500 tabular-nums">
                            {formatCurrency(tx.commission)}
                          </td>
                          <td className="px-3 pr-6 py-4 text-right text-sm font-bold text-slate-900 tabular-nums">
                            {formatCurrency(total)}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totales */}
            {assetTransactions.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen</span>
                <div className="flex flex-wrap items-center gap-6 ml-auto">
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Cantidad total</p>
                    <p className="text-sm font-black text-slate-900 tabular-nums">{totals.totalQty}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Total invertido</p>
                    <p className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(totals.totalInvested)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Comisiones</p>
                    <p className="text-sm font-bold text-slate-500 tabular-nums">{formatCurrency(totals.totalCommission)}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}
