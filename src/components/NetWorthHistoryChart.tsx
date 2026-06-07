import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NetWorthSnapshot } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { TrendingUp, TrendingDown, LineChart as LineChartIcon } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function NetWorthHistoryChart({
  user,
  investmentValue,
  propertyEquity,
  loading,
}: {
  user: User;
  investmentValue: number;
  propertyEquity: number;
  loading: boolean;
}) {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);

  // Suscripción al histórico de snapshots del usuario
  useEffect(() => {
    const q = query(
      collection(db, 'netWorthSnapshots'),
      where('ownerId', '==', user.uid),
      orderBy('date', 'asc')
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setSnapshots(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as NetWorthSnapshot)));
    });
    return () => unsub();
  }, [user.uid]);

  // Guarda (o actualiza) el snapshot del día actual con el último patrimonio conocido.
  // El ID determinista (uid_fecha) garantiza un único documento por día.
  useEffect(() => {
    if (loading) return;
    const total = investmentValue + propertyEquity;
    if (total === 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const ref = doc(db, 'netWorthSnapshots', `${user.uid}_${today}`);
    setDoc(ref, {
      ownerId: user.uid,
      date: today,
      totalNetWorth: total,
      investmentValue,
      propertyEquity,
      createdAt: serverTimestamp(),
    }, { merge: true }).catch(err => console.error('Error guardando snapshot de patrimonio:', err));
  }, [user.uid, investmentValue, propertyEquity, loading]);

  if (snapshots.length < 2) return null;

  const chartData = snapshots.map(s => ({
    label: new Date(s.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    total: s.totalNetWorth,
    investments: s.investmentValue,
    realEstate: s.propertyEquity,
  }));

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
          {formatPercent(changePercent)}
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
