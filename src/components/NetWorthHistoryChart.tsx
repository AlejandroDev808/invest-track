import { useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { InvestmentSummary } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { TrendingUp, TrendingDown, LineChart as LineChartIcon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Label, ResponsiveContainer } from 'recharts';

function toMillis(value: any): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return 0;
}

export default function NetWorthHistoryChart({
  summaries,
}: {
  summaries: InvestmentSummary[];
}) {
  // Reconstruye la evolución del valor de las inversiones financieras a partir
  // de las fechas de creación de los documentos en `investments` (excluye
  // inmuebles): se ordenan cronológicamente y se acumula su valor actual para
  // obtener el valor total en cada punto de la línea temporal.
  //
  // Importante: cada punto guarda su `date` original (timestamp numérico) en
  // lugar de una etiqueta de texto ya formateada. Si dos inversiones se crean
  // el mismo día, formatear la fecha a texto produce etiquetas duplicadas en
  // el eje X, y Recharts resuelve el tooltip por coincidencia de etiqueta —
  // con duplicados, siempre encuentra la primera, por lo que el tooltip queda
  // "pegado" al valor del primer punto sin importar dónde esté el cursor.
  // Usando un eje numérico con el timestamp real, cada punto es único.
  const chartData = useMemo(() => {
    const events = summaries
      .map(s => ({ date: toMillis(s.createdAt), value: s.currentValue }))
      .filter(e => e.date > 0)
      .sort((a, b) => a.date - b.date);

    let cumulative = 0;
    const points = events.map(e => {
      cumulative += e.value;
      return { date: e.date, total: cumulative };
    });

    console.log('[NetWorthHistoryChart] chartData:', points.map(p => ({
      date: new Date(p.date).toISOString(),
      total: p.total,
    })));

    return points;
  }, [summaries]);

  if (chartData.length < 2) return null;

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });

  const last = chartData[chartData.length - 1].total;

  // Beneficio neto real de las inversiones: valor actual menos capital invertido
  // (no la diferencia entre el primer y el último punto del histórico, que mezcla
  // capital aportado con revalorización y no representa una ganancia/pérdida real).
  const totalInvested = summaries.reduce((acc, s) => acc + s.totalInvested, 0);
  const currentValue = summaries.reduce((acc, s) => acc + s.currentValue, 0);
  const netProfit = currentValue - totalInvested;
  const profitPercent = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
  const isPositive = netProfit >= 0;

  // El dominio del eje Y debe abarcar siempre el capital invertido para que la
  // línea de break-even sea visible aunque el valor de las inversiones quede
  // por debajo (o muy por encima) de ese umbral.
  const maxValue = Math.max(...chartData.map(d => d.total));
  const yDomain: [number, number] = [0, Math.max(maxValue, totalInvested) * 1.1];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-50 rounded-lg">
            <LineChartIcon size={18} className="text-slate-600" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Evolución de las Inversiones
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
            {isPositive ? '+' : ''}{formatCurrency(netProfit, 0)} / {isPositive ? '+' : ''}{formatPercent(profitPercent)}
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
            <XAxis
              dataKey="date"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={80}
              tickFormatter={(v: number) => formatCurrency(v, 0)}
            />
            <Tooltip
              labelFormatter={(value: number) => formatDate(value)}
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Valor Inversiones"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#netWorthGradient)"
            />
            {totalInvested > 0 && (
              <ReferenceLine
                y={totalInvested}
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              >
                <Label
                  value="Capital invertido (Break-even)"
                  position="insideBottomLeft"
                  fill="#f59e0b"
                  fontSize={11}
                  fontWeight={700}
                />
                <Label value={formatCurrency(totalInvested)} position="insideTopLeft" fontSize={11} />
              </ReferenceLine>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
