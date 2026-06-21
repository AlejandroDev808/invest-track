import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InvestmentSummary } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SortField =
  | 'name'
  | 'totalQuantity'
  | 'avgPrice'
  | 'currentPrice'
  | 'currentValue'
  | 'netProfit'
  | 'profitPercent'
  | 'portfolioPercent';

type SortDir = 'asc' | 'desc';

interface SortState {
  field: SortField;
  dir: SortDir;
}

interface StatsTableProps {
  summaries: InvestmentSummary[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQuantity(value: number, type: string): string {
  if (type === 'cash') {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  }
  const decimals = value % 1 !== 0 && value < 1000 ? 6 : 4;
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ─── Sub-componente: icono de ordenación ──────────────────────────────────────

function SortIcon({ field, sort }: { field: SortField; sort: SortState }) {
  if (sort.field !== field)
    return <ArrowUpDown size={12} className="text-slate-300 shrink-0" />;
  return sort.dir === 'asc'
    ? <ArrowUp size={12} className="text-blue-500 shrink-0" />
    : <ArrowDown size={12} className="text-blue-500 shrink-0" />;
}

// ─── Sub-componente: barra de % cartera ───────────────────────────────────────

function AllocationBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-blue-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percent, 100)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="text-xs font-bold text-slate-600 tabular-nums w-10 text-right shrink-0">
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function StatsTable({ summaries }: StatsTableProps) {
  const [sort, setSort] = useState<SortState>({ field: 'currentValue', dir: 'desc' });

  const toggleSort = (field: SortField) => {
    setSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { field, dir: 'desc' }
    );
  };

  // Primero agrupamos por símbolo, luego ordenamos
  const sorted = useMemo(() => {
    return [...summaries].sort((a, b) => {
      let valA: number | string;
      let valB: number | string;

      switch (sort.field) {
        case 'name':          valA = a.name.toLowerCase();   valB = b.name.toLowerCase();   break;
        case 'totalQuantity': valA = a.totalQuantity;        valB = b.totalQuantity;        break;
        case 'avgPrice':      valA = a.avgPrice;             valB = b.avgPrice;             break;
        case 'currentPrice':  valA = a.currentPrice;         valB = b.currentPrice;         break;
        case 'currentValue':  valA = a.currentValue;         valB = b.currentValue;         break;
        case 'netProfit':     valA = a.netProfit;            valB = b.netProfit;            break;
        case 'profitPercent': valA = a.profitPercent;        valB = b.profitPercent;        break;
        case 'portfolioPercent': valA = a.portfolioPercent;  valB = b.portfolioPercent;     break;
        default: return 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sort.dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sort.dir === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [summaries, sort]);

  if (summaries.length === 0) return null;

  const Th = ({ field, children, className }: {
    field: SortField;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      className={cn(
        'pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap',
        className
      )}
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <SortIcon field={field} sort={sort} />
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-50 rounded-lg">
            <BarChart3 size={18} className="text-slate-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Estadísticas por Activo</h2>
            <p className="text-xs text-slate-400 font-medium">Haz clic en cualquier columna para ordenar</p>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
          {sorted.length} activo{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <Th field="name" className="pl-5 pr-3">Activo</Th>
                <Th field="totalQuantity" className="px-3 text-right justify-end">Cantidad</Th>
                <Th field="avgPrice" className="px-3 text-right justify-end">P. Medio</Th>
                <Th field="currentPrice" className="px-3 text-right justify-end">P. Actual</Th>
                <Th field="currentValue" className="px-3 text-right justify-end">Valor Total</Th>
                <Th field="netProfit" className="px-3 text-right justify-end">Resultado (€)</Th>
                <Th field="profitPercent" className="px-3 text-right justify-end">Rentab. (%)</Th>
                <Th field="portfolioPercent" className="px-3 pr-5">% Cartera</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence initial={false}>
                {sorted.map((s, index) => {
                  const isPositive = s.netProfit >= 0;
                  const showPnL = s.hasPrice || s.type === 'cash';

                  return (
                    <motion.tr
                      key={s.symbol}
                      layout
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.03 }}
                      className="group hover:bg-slate-50/70 transition-colors"
                    >
                      {/* Activo */}
                      <td className="pl-5 pr-3 py-4">
                        <Link to={`/asset/${encodeURIComponent(s.symbol)}`} className="flex items-center gap-3 group/link">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-[9px] font-black text-slate-500 tracking-tight">
                              {s.symbol.slice(0, 3).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-tight truncate max-w-[140px] group-hover/link:text-blue-600 transition-colors">{s.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 font-mono group-hover/link:text-blue-400 transition-colors">{s.symbol}</p>
                          </div>
                        </Link>
                      </td>

                      {/* Cantidad */}
                      <td className="px-3 py-4 text-right">
                        <span className="text-sm font-semibold text-slate-700 tabular-nums">
                          {formatQuantity(s.totalQuantity, s.type)}
                        </span>
                      </td>

                      {/* Precio medio */}
                      <td className="px-3 py-4 text-right">
                        {s.type === 'cash'
                          ? <span className="text-xs text-slate-400">—</span>
                          : <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(s.avgPrice)}</span>
                        }
                      </td>

                      {/* Precio actual */}
                      <td className="px-3 py-4 text-right">
                        {s.type === 'cash'
                          ? <span className="text-xs text-slate-400">—</span>
                          : !s.hasPrice
                            ? <span className="text-xs font-bold text-slate-300 animate-pulse">...</span>
                            : <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatCurrency(s.currentPrice)}</span>
                        }
                      </td>

                      {/* Valor total */}
                      <td className="px-3 py-4 text-right">
                        <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(s.currentValue)}</span>
                      </td>

                      {/* Resultado € */}
                      <td className="px-3 py-4 text-right">
                        {!showPnL
                          ? <span className="text-xs text-slate-300">—</span>
                          : (
                            <div className={cn('inline-flex items-center gap-1 font-bold text-sm tabular-nums', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
                              {isPositive ? <TrendingUp size={13} className="shrink-0" /> : <TrendingDown size={13} className="shrink-0" />}
                              {formatCurrency(s.netProfit)}
                            </div>
                          )
                        }
                      </td>

                      {/* Rentabilidad % */}
                      <td className="px-3 py-4 text-right">
                        {!showPnL || s.type === 'cash'
                          ? <span className="text-xs text-slate-300">—</span>
                          : (
                            <span className={cn('inline-block text-xs font-black px-2 py-1 rounded-lg tabular-nums', isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                              {isPositive ? '+' : ''}{formatPercent(s.profitPercent)}
                            </span>
                          )
                        }
                      </td>

                      {/* % Cartera */}
                      <td className="px-3 pr-5 py-4">
                        <AllocationBar percent={s.portfolioPercent} />
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        <TotalsRow rows={sorted} />
      </div>
    </div>
  );
}

// ─── Fila de totales ──────────────────────────────────────────────────────────

function TotalsRow({ rows }: { rows: InvestmentSummary[] }) {
  const totalValue    = rows.reduce((acc, r) => acc + r.currentValue, 0);
  const totalInvested = rows.reduce((acc, r) => acc + r.totalInvested, 0);
  const totalProfit   = totalValue - totalInvested;
  const totalProfitPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
  const isPositive = totalProfit >= 0;

  return (
    <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Totales</span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 ml-auto">
        <div className="text-right">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Valor Total</p>
          <p className="text-sm font-black text-slate-900 tabular-nums">{formatCurrency(totalValue)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Coste Total</p>
          <p className="text-sm font-bold text-slate-700 tabular-nums">{formatCurrency(totalInvested)}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Resultado Neto</p>
          <p className={cn('text-sm font-black tabular-nums flex items-center gap-1 justify-end', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {formatCurrency(totalProfit)}
            <span className="text-[10px] font-bold opacity-70">
              ({isPositive ? '+' : ''}{formatPercent(totalProfitPercent)})
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
