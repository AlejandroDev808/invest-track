import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { InvestmentSummary, PropertyStats } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { TrendingUp, TrendingDown, LineChart as LineChartIcon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function toMillis(value: any): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
}

export default function NetWorthHistoryChart({
  summaries,
  propertyStats,
}: {
  summaries: InvestmentSummary[];
  propertyStats: PropertyStats[];
}) {
  // Reconstruye la evolución del patrimonio a partir de las fechas de creación
  // de inversiones e inmuebles: se ordenan cronológicamente y se acumula su
  // valor actual para obtener el patrimonio total en cada punto de la línea temporal.
  const chartData = useMemo(() => {
    const events = [
      ...summaries.map(s => ({ date: toMillis(s.createdAt), value: s.currentValue })),
      ...propertyStats.map(ps => ({ date: toMillis(ps.property.createdAt), value: ps.equity })),
    ]
      .filter(e => e.date > 0)
      .sort((a, b) => a.date - b.date);

    let cumulative = 0;
    return events.map(e => {
      cumulative += e.value;
      return {
        label: new Date(e.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }),
        total: cumulative,
      };
    });
  }, [summaries, propertyStats]);

  if (chartData.length < 2) return null;

  const first = chartData[0].total;
  const last = chartData[chartData.length - 1].total;
  const change = last - first;
  const changePercent = first !== 0 ? (change / Math.abs(first)) * 100 : 0;
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-50 rounded-lg">
            <LineChartIcon size={18} className="text-slate-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Evolución del Patrimonio Neto
            </p>
            <p className="text-2xl font-black text-slate-900 tracking-tight">{formatCurrency(last)}</p>
          </div>
        </div>
        <div className={cn(
          "flex items-center gap-1.5 self-start sm:self-auto px-3 py-1.5 rounded-xl text-sm font-bold",
          isPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
        )}>
          {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          <span>
            {isPositive ? '+' : ''}{formatCurrency(change, 0)} / {isPositive ? '+' : ''}{formatPercent(changePercent)}
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={80}
              tickFormatter={(v: number) => formatCurrency(v, 0)}
            />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Patrimonio Neto"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
