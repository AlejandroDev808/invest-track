import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Investment, Transaction, InvestmentSummary, PropertyStats } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { Plus, TrendingUp, TrendingDown, Trash2, PieChart as PieChartIcon, Info, RefreshCcw, Landmark, Coins, Briefcase, History, Edit2, X, Calendar, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import StatsTable from './StatsTable';
import PropertySection from './PropertySection';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import axios from 'axios';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function Dashboard({ user }: { user: User }) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddTransactionModal, setShowAddTransactionModal] = useState<Investment | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null); // Investment ID
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Form states
  const [isAdding, setIsAdding] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'stock' | 'crypto' | 'fund' | 'cash'>('stock');
  const [newPrice, setNewPrice] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCommission, setNewCommission] = useState('0');

  // Edit states
  const [editPrice, setEditPrice] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editCommission, setEditCommission] = useState('');

  // Patrimonio inmobiliario (recibido desde PropertySection)
  const [propertyEquity, setPropertyEquity] = useState<number>(0);
  const [propertyStats, setPropertyStats] = useState<PropertyStats[]>([]);

  // Search states
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load investments and transactions
  useEffect(() => {
    const qInv = query(collection(db, 'investments'), where('ownerId', '==', user.uid));
    const unsubInv = onSnapshot(qInv, (snapshot) => {
      setInvestments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Investment)));
    });

    const qTx = query(collection(db, 'transactions'), where('ownerId', '==', user.uid));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)));
      setLoading(false);
    });

    return () => {
      unsubInv();
      unsubTx();
    };
  }, [user.uid]);

  // Fetch prices
  const fetchPrices = async () => {
    if (investments.length === 0) return;
    setIsRefreshing(true);
    try {
      const symbols = investments
        .filter(inv => inv.type !== 'cash')
        .map(inv => inv.symbol)
        .join(',');
      
      if (!symbols) {
        setIsRefreshing(false);
        return;
      }
      
      const response = await axios.get('/api/prices', { 
        params: { symbols },
        headers: { 'Cache-Control': 'no-cache' }
      });
      setPrices(prev => ({ ...prev, ...response.data }));
    } catch (error) {
      console.error("Error fetching prices", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (investments.length > 0) {
      fetchPrices();
    }
  }, [investments.length]);

  // Search effect
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (newSymbol.length >= 2) {
        setIsSearching(true);
        console.log("[Search] Fetching results for:", newSymbol);
        try {
          const response = await axios.get('/api/search', { params: { q: newSymbol } });
          console.log("[Search] Results received:", response.data);
          setSearchResults(response.data || []);
        } catch (error) {
          console.error("Search error", error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [newSymbol]);

  // Calculations
  const summaries = useMemo<InvestmentSummary[]>(() => {
    // Calcular el valor total de la cartera primero
    const totalPortfolioValue = investments.reduce((acc, inv) => {
      const relevantTx = transactions.filter(tx => tx.investmentId === inv.id);
      const qty = relevantTx.reduce((a, tx) => a + tx.quantity, 0);
      const price = inv.type === 'cash' ? 1 : (prices[inv.symbol] || 0);
      return acc + qty * price;
    }, 0);

    return investments.map(inv => {
      const relevantTx = transactions.filter(tx => tx.investmentId === inv.id);
      const totalQuantity = relevantTx.reduce((acc, tx) => acc + tx.quantity, 0);
      const totalInvested = relevantTx.reduce((acc, tx) => acc + (tx.quantity * tx.pricePerUnit) + tx.commission, 0);
      const totalCommission = relevantTx.reduce((acc, tx) => acc + tx.commission, 0);
      const avgPrice = totalQuantity > 0 ? (totalInvested - totalCommission) / totalQuantity : 0;
      
      const hasPrice = inv.type === 'cash' || prices[inv.symbol] !== undefined;
      const currentPrice = inv.type === 'cash' ? 1 : (prices[inv.symbol] || avgPrice);
      const currentValue = totalQuantity * currentPrice;
      const netProfit = currentValue - totalInvested;
      const profitPercent = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
      const portfolioPercent = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;

      return {
        ...inv,
        totalQuantity,
        totalInvested,
        totalCommission,
        avgPrice,
        currentPrice,
        currentValue,
        netProfit,
        profitPercent,
        portfolioPercent,
        hasPrice
      };
    });
  }, [investments, transactions, prices]);

  const globalStats = useMemo(() => {
    const totalInvested = summaries.reduce((acc, s) => acc + s.totalInvested, 0);
    const currentValue = summaries.reduce((acc, s) => acc + s.currentValue, 0);
    const netProfit = currentValue - totalInvested;
    const profitPercent = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
    
    return { totalInvested, currentValue, netProfit, profitPercent };
  }, [summaries]);

  const chartData = useMemo(() => {
    const grouped = summaries.reduce((acc, s) => {
      if (s.currentValue <= 0) return acc;
      const label = s.type === 'cash' ? s.name : s.symbol;
      const existing = acc.find(item => item.name === label);
      if (existing) {
        existing.value += s.currentValue;
      } else {
        acc.push({
          name: label,
          value: s.currentValue
        });
      }
      return acc;
    }, [] as { name: string; value: number }[]);

    return grouped
      .map(item => ({
        ...item,
        percent: globalStats.currentValue > 0 ? (item.value / globalStats.currentValue) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);
  }, [summaries, globalStats.currentValue]);

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#06b6d4'];

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const symbol = newSymbol.trim().toUpperCase() || (newType === 'cash' ? 'EFECTIVO' : '');
    const name = newName.trim() || (newType === 'cash' ? 'Cuenta Corriente' : '');
    const price = newType === 'cash' ? '1' : newPrice;
    
    if (!symbol || !name || !price || !newQty) {
      alert("Por favor, rellena todos los campos obligatorios.");
      return;
    }

    setIsAdding(true);
    try {
      const parsedPrice = parseFloat(price.replace(',', '.'));
      const parsedQty = parseFloat(newQty.replace(',', '.'));
      const parsedCommission = parseFloat((newCommission || '0').replace(',', '.'));

      if (isNaN(parsedPrice) || isNaN(parsedQty)) {
        throw new Error("El precio o la cantidad no son válidos.");
      }

      console.log("[Add] Attempting to add investment:", { symbol, name, newType });

      // Buscar si ya existe un investment con el mismo símbolo para este usuario
      const existingInv = investments.find(
        inv => inv.symbol === symbol && inv.ownerId === user.uid
      );

      let investmentId: string;

      if (existingInv) {
        // Reutilizar el investment existente — solo añadir la transacción
        console.log("[Add] Investment ya existe, reutilizando:", existingInv.id);
        investmentId = existingInv.id;
      } else {
        // Crear un nuevo investment
        const invRef = await addDoc(collection(db, 'investments'), {
          symbol: symbol,
          name: name,
          type: newType,
          ownerId: user.uid,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'investments'));

        if (!invRef) throw new Error("Failed to create investment document");
        investmentId = invRef.id;
      }

      await addDoc(collection(db, 'transactions'), {
        investmentId: investmentId,
        pricePerUnit: parsedPrice,
        quantity: parsedQty,
        commission: isNaN(parsedCommission) ? 0 : parsedCommission,
        date: serverTimestamp(),
        ownerId: user.uid
      }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'transactions'));

      console.log("[Add] Successfully added investment and transaction");

      // Reset form
      setNewSymbol('');
      setNewName('');
      setNewPrice('');
      setNewQty('');
      setNewCommission('0');
      setNewType('stock');
      setShowAddModal(false);
      
      // Force price refresh
      fetchPrices();
    } catch (error: any) {
      console.error("Error adding investment:", error);
      alert(`Error al añadir la inversión: ${error.message || 'Error desconocido'}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'investments', id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `investments/${id}`));
      const txsToDelete = transactions.filter(t => t.investmentId === id);
      for(const tx of txsToDelete) {
         await deleteDoc(doc(db, 'transactions', tx.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `transactions/${tx.id}`));
      }
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction) return;

    setIsUpdating(true);
    try {
      const txRef = doc(db, 'transactions', editingTransaction.id);
      await updateDoc(txRef, {
        pricePerUnit: parseFloat(editPrice.replace(',', '.')),
        quantity: parseFloat(editQty.replace(',', '.')),
        commission: parseFloat(editCommission.replace(',', '.')),
      }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `transactions/${editingTransaction.id}`));

      setEditingTransaction(null);
    } catch (error) {
      console.error("Update failed", error);
      alert("Error al actualizar la transacción");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm("¿Seguro que quieres eliminar esta transacción?")) return;
    try {
      await deleteDoc(doc(db, 'transactions', id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `transactions/${id}`));
    } catch (err) {
      console.error("Delete transaction failed", err);
    }
  };

  const startEditing = (tx: Transaction) => {
    setEditingTransaction(tx);
    setEditPrice(tx.pricePerUnit.toString());
    setEditQty(tx.quantity.toString());
    setEditCommission(tx.commission.toString());
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6 sm:space-y-8">
      {/* Top Section: stats + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <StatCard 
            title="Inversión Total" 
            value={formatCurrency(globalStats.totalInvested)} 
            icon={<Landmark className="text-blue-500" />}
          />
          <StatCard 
            title="Valor Actual" 
            value={formatCurrency(globalStats.currentValue)} 
            icon={<PieChartIcon className="text-purple-500" />}
            subValue={
               <div className={cn("text-sm font-semibold flex items-center gap-1", globalStats.netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                 {globalStats.netProfit >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                 {formatPercent(globalStats.profitPercent)}
               </div>
            }
          />
          <div className="md:col-span-2">
            <StatCard 
              title="Beneficio Neto" 
              value={formatCurrency(globalStats.netProfit)} 
              icon={<TrendingUp className={cn(globalStats.netProfit >= 0 ? "text-emerald-500" : "text-rose-500")} />}
              color={globalStats.netProfit >= 0 ? "emerald" : "rose"}
            />
          </div>
        </div>

        {/* Portfolio Distribution Chart */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col items-center">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 self-start">Distribución de Cartera</h3>
          <div className="w-full h-48 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(255,255,255,0.2)" />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 mt-4 w-full">
            {chartData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2 justify-between">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-[10px] font-bold text-slate-600 truncate">{entry.name}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{entry.percent.toFixed(1)}%</span>
                <span className={cn("text-[10px] font-semibold shrink-0", (summaries.find(s => (s.type === 'cash' ? s.name : s.symbol) === entry.name)?.netProfit ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500")}>
                {formatCurrency(summaries.find(s => (s.type === 'cash' ? s.name : s.symbol) === entry.name)?.netProfit ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Table */}
      {summaries.length > 0 && (
        <StatsTable summaries={summaries} />
      )}

      {/* Main List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
           <h2 className="text-xl font-bold tracking-tight">Mis Inversiones</h2>
           <div className="flex gap-2">
             <button 
               onClick={fetchPrices} 
               disabled={isRefreshing}
               className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
             >
               <RefreshCcw size={20} className={cn(isRefreshing && "animate-spin")} />
             </button>
             <button 
               onClick={() => setShowAddModal(true)}
               className="flex items-center gap-2 bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm text-sm sm:text-base"
               id="add-investment-trigger"
             >
               <Plus size={20} />
               <span className="hidden sm:inline">Nueva Inversión</span>
               <span className="sm:hidden">Nueva</span>
             </button>
           </div>
        </div>

        {summaries.length === 0 && !loading ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <Briefcase size={32} />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-slate-600">No hay inversiones activas</p>
              <p className="text-sm text-slate-400">Añade tu primera compra para empezar el seguimiento.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <AnimatePresence>
              {summaries.map((summary) => (
                <InvestmentCard 
                  key={summary.id} 
                  summary={summary} 
                  onDelete={() => handleDelete(summary.id)} 
                  onViewHistory={() => setShowHistoryModal(summary.id)}
                  onAddTransaction={() => setShowAddTransactionModal(summary)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* History & Edit Transaction Modal */}
      <AnimatePresence>
        {showHistoryModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
            >
              <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-xl font-bold">Historial de Transacciones</h3>
                  <p className="text-sm text-slate-500">{investments.find(i => i.id === showHistoryModal)?.name}</p>
                </div>
                <button onClick={() => setShowHistoryModal(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 sm:p-6">
                <table className="w-full text-left min-w-[500px]">
                  <thead>
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-3">
                      <th className="pb-3">Fecha</th>
                      <th className="pb-3">Precio</th>
                      <th className="pb-3">Cantidad</th>
                      <th className="pb-3">Comisión</th>
                      <th className="pb-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {transactions
                      .filter(t => t.investmentId === showHistoryModal)
                      .sort((a, b) => {
                         const dateA = a.date instanceof Timestamp ? a.date.toMillis() : (a.date?.seconds * 1000 || 0);
                         const dateB = b.date instanceof Timestamp ? b.date.toMillis() : (b.date?.seconds * 1000 || 0);
                         return dateB - dateA;
                      })
                      .map(tx => (
                      <tr key={tx.id} className="group hover:bg-slate-50/80 transition-colors">
                        <td className="py-4 text-xs font-medium text-slate-600">
                          <div className="flex items-center gap-2">
                            <Calendar size={12} className="text-slate-400" />
                            {tx.date?.toDate ? tx.date.toDate().toLocaleDateString() : 'Pendiente'}
                          </div>
                        </td>
                        <td className="py-4 text-sm font-bold">{formatCurrency(tx.pricePerUnit)}</td>
                        <td className="py-4 text-sm font-semibold text-slate-700">{tx.quantity}</td>
                        <td className="py-4 text-sm text-slate-500">{formatCurrency(tx.commission)}</td>
                        <td className="py-4 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => startEditing(tx)}
                              className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDeleteTransaction(tx.id)}
                              className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        )}

        {editingTransaction && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 sm:p-6 space-y-4 sm:space-y-6"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-lg">Editar Transacción</h4>
                <button onClick={() => setEditingTransaction(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateTransaction} className="space-y-4">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Precio por unidad</label>
                    <input 
                      required
                      type="number"
                      step="0.000001"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={editPrice}
                      onChange={e => setEditPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Cantidad</label>
                    <input 
                      required
                      type="number"
                      step="0.000001"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={editQty}
                      onChange={e => setEditQty(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Comisión</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={editCommission}
                      onChange={e => setEditCommission(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                   <button 
                    type="button"
                    onClick={() => setEditingTransaction(null)}
                    className="flex-1 px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                   >
                     Cancelar
                   </button>
                   <button 
                    type="submit"
                    disabled={isUpdating}
                    className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                   >
                     {isUpdating && <RefreshCcw size={14} className="animate-spin" />}
                     {isUpdating ? "Guardando..." : "Guardar"}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

        {showAddTransactionModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
               initial={{ scale: 0.9, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               exit={{ scale: 0.9, opacity: 0 }}
               className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-4 sm:p-6 space-y-4 sm:space-y-6"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-lg">Añadir Operación</h4>
                <button onClick={() => setShowAddTransactionModal(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                 <div className="p-2 bg-white rounded-lg shadow-sm">
                   {showAddTransactionModal.type === 'crypto' ? <Coins size={16} className="text-slate-600"/> : (showAddTransactionModal.type === 'fund' ? <Landmark size={16} className="text-slate-600"/> : (showAddTransactionModal.type === 'cash' ? <Wallet size={16} className="text-slate-600"/> : <Briefcase size={16} className="text-slate-600"/>))}
                 </div>
                 <div>
                   <p className="text-xs font-bold text-slate-900">{showAddTransactionModal.name}</p>
                   <p className="text-[10px] font-bold text-slate-400">{showAddTransactionModal.symbol}</p>
                 </div>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsAdding(true);
                try {
                  const price = showAddTransactionModal.type === 'cash' ? '1' : newPrice;
                  const parsedPrice = parseFloat(price.replace(',', '.'));
                  const parsedQty = parseFloat(newQty.replace(',', '.'));
                  const parsedCommission = parseFloat((newCommission || '0').replace(',', '.'));

                  await addDoc(collection(db, 'transactions'), {
                    investmentId: showAddTransactionModal.id,
                    pricePerUnit: parsedPrice,
                    quantity: parsedQty,
                    commission: parsedCommission,
                    date: serverTimestamp(),
                    ownerId: user.uid
                  });
                  setShowAddTransactionModal(null);
                  setNewPrice('');
                  setNewQty('');
                  setNewCommission('0');
                } catch (err) {
                  console.error(err);
                  alert("Error al añadir transacción");
                } finally {
                  setIsAdding(false);
                }
              }} className="space-y-4">
                <div className="space-y-3">
                  {showAddTransactionModal.type !== 'cash' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Precio por unidad</label>
                      <input 
                        required
                        type="number"
                        step="0.000001"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={newPrice}
                        onChange={e => setNewPrice(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">{showAddTransactionModal.type === 'cash' ? "Importe (€)" : "Cantidad"}</label>
                    <input 
                      required
                      type="number"
                      step="0.000001"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      placeholder={showAddTransactionModal.type === 'cash' ? "Usa negativos para retiradas" : ""}
                    />
                  </div>
                  {showAddTransactionModal.type !== 'cash' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Comisión</label>
                      <input 
                        required
                        type="number"
                        step="0.01"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={newCommission}
                        onChange={e => setNewCommission(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                   <button 
                    type="button"
                    onClick={() => setShowAddTransactionModal(null)}
                    className="flex-1 px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                   >
                     Cancelar
                   </button>
                   <button 
                    type="submit"
                    disabled={isAdding}
                    className="flex-1 bg-blue-600 text-white font-bold py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                   >
                     {isAdding && <RefreshCcw size={14} className="animate-spin" />}
                     {isAdding ? "Añadiendo..." : "Añadir"}
                   </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

      {/* Patrimonio Inmobiliario */}
      <PropertySection user={user} onEquityChange={setPropertyEquity} onStatsChange={setPropertyStats} />

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 sm:p-6 space-y-4 sm:space-y-6"
            >
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-bold">Nueva Inversión</h3>
                 <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                    <Plus size={24} className="rotate-45" />
                 </button>
              </div>

              <form onSubmit={handleAddInvestment} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={cn("space-y-1 relative", (isSearching || searchResults.length > 0) && "z-50")}>
                    <label className="text-xs font-bold text-slate-500 uppercase">Símbolo (Ticker)</label>
                    <input 
                      required={newType !== 'cash'}
                      placeholder={newType === 'cash' ? "CASH-EUR" : "AAPL, BTC-USD..."}
                      value={newSymbol}
                      onChange={e => setNewSymbol(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {/* Search Results Dropdown */}
                    <AnimatePresence>
                      {newType !== 'cash' && (isSearching || (newSymbol.length >= 2 && !searchResults.length && !isSearching) || searchResults.length > 0) && (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          className="absolute left-0 w-[180%] top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl z-[500] max-h-72 overflow-y-auto ring-1 ring-slate-900/5 ring-inset ring-opacity-10"
                        >
                          {isSearching ? (
                            <div className="p-4 text-xs text-slate-400 font-medium text-center flex items-center justify-center gap-2">
                               <RefreshCcw size={14} className="animate-spin text-blue-500" />
                               Buscando activos...
                            </div>
                          ) : searchResults.length > 0 ? (
                            searchResults
                              .filter(res => res && res.symbol)
                              .map((res: any, idx: number) => (
                              <button
                                key={res.symbol + (res.exchange || '') + idx}
                                type="button"
                                onMouseDown={(e) => {
                                  setNewSymbol(res.symbol);
                                  setNewName(res.longname || res.shortname || res.symbol);
                                  setSearchResults([]);
                                }}
                                className="w-full text-left p-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors group flex items-center justify-between gap-4"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{res.symbol}</p>
                                  <p className="text-[10px] text-slate-500 font-medium truncate">
                                    {res.longname || res.shortname || 'Sin descripción'}
                                  </p>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                  <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                                    {res.quoteType || res.exchange}
                                  </span>
                                  {res.exchDisp && <span className="text-[8px] text-slate-400 mt-0.5">{res.exchDisp}</span>}
                                </div>
                              </button>
                            ))
                          ) : newSymbol.length >= 2 ? (
                             <div className="p-4 text-center">
                               <p className="text-xs text-slate-500 font-bold">Sin resultados directos para "{newSymbol}".</p>
                               <div className="mt-2 space-y-2 border-t border-slate-50 pt-2">
                                 <p className="text-[10px] text-slate-500 italic">
                                   * ¡No te preocupes! Si es un ISIN de un fondo o una cripto nueva, puedes añadirlo igualmente.
                                 </p>
                                 <p className="text-[10px] text-blue-600 font-medium">
                                   Nuestro sistema intentará resolver el precio automáticamente mediante ISIN o pares alternativos.
                                 </p>
                                 <p className="text-[10px] text-slate-400">Introduce el nombre y confirma para añadirlo manualmente.</p>
                               </div>
                             </div>
                          ) : null}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Nombre</label>
                    <input 
                      required={newType !== 'cash'}
                      placeholder="Apple, Bitcoin..."
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Tipo</label>
                  <select 
                    value={newType}
                    onChange={e => {
                      const val = e.target.value as any;
                      setNewType(val);
                      if (val === 'cash') {
                        setNewPrice('1');
                        if (!newSymbol) setNewSymbol('EFECTIVO');
                        if (!newName) setNewName('Cuenta Corriente');
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="stock">Acciones</option>
                    <option value="crypto">Criptomonedas</option>
                    <option value="fund">Fondo de Inversión</option>
                    <option value="cash">Efectivo / Cuenta Corriente</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                   <div className={cn("space-y-1", newType === 'cash' && "opacity-50 pointer-events-none")}>
                    <label className="text-xs font-bold text-slate-500 uppercase">{newType === 'cash' ? "Precio (Fijo)" : "Precio Compra"}</label>
                    <input 
                      required
                      type="number"
                      step="0.000001"
                      value={newPrice}
                      onChange={e => setNewPrice(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">{newType === 'cash' ? "Saldo (€)" : "Cantidad"}</label>
                    <input 
                      required
                      type="number"
                      step="0.000001"
                      value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className={cn("space-y-1", newType === 'cash' && "opacity-50 pointer-events-none")}>
                    <label className="text-xs font-bold text-slate-500 uppercase">Comisión</label>
                    <input 
                      required={newType !== 'cash'}
                      type="number"
                      step="0.01"
                      value={newCommission}
                      onChange={e => setNewCommission(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isAdding}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  id="submit-investment"
                >
                  {isAdding && <RefreshCcw size={16} className="animate-spin" />}
                  {isAdding ? "Añadiendo..." : "Confirmar Inversión"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Banner Patrimonio Total */}
      <TotalWealthBanner
        investmentValue={globalStats.currentValue}
        propertyEquity={propertyEquity}
        summaries={summaries}
        propertyStats={propertyStats}
      />
    </div>
  );
}

function StatCard({ title, value, icon, subValue, color = "blue" }: any) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
      <div className="flex items-center justify-between pb-2 border-b border-slate-50">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
      </div>
      <div className="flex items-baseline justify-between pt-1">
        <p className={cn("text-2xl font-bold tracking-tight", color === "emerald" && "text-emerald-600", color === "rose" && "text-rose-600")}>
          {value}
        </p>
        {subValue && <div>{subValue}</div>}
      </div>
    </div>
  );
}

const InvestmentCard: React.FC<{ 
  summary: InvestmentSummary, 
  onDelete: () => void | Promise<void>,
  onViewHistory: () => void,
  onAddTransaction: () => void
}> = ({ summary, onDelete, onViewHistory, onAddTransaction }) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const Icon = summary.type === 'crypto' ? Coins : (summary.type === 'fund' ? Landmark : (summary.type === 'cash' ? Wallet : Briefcase));

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group/card relative"
    >
      <AnimatePresence>
        {showConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4 text-center gap-4"
          >
            <p className="text-sm font-bold text-slate-800">¿Eliminar esta inversión?</p>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={onDelete}
                className="px-4 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
              >
                Sí, eliminar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5 flex-1 space-y-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
                <Icon size={20} />
             </div>
             <div>
                <h4 className="font-bold text-slate-900 leading-tight">{summary.name}</h4>
                <p className="text-xs font-bold text-slate-400 font-mono">{summary.symbol}</p>
             </div>
          </div>
          <div className="flex gap-1 items-center">
            <button 
              onClick={onAddTransaction}
              className="p-1.5 px-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
              title="Añadir transacción"
            >
              <Plus size={18} />
            </button>
            <button 
              onClick={onViewHistory}
              className="p-1.5 px-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200"
              title="Ver historial / Editar"
            >
              <History size={18} />
            </button>
            <button 
              onClick={() => setShowConfirm(true)}
              className="p-1.5 px-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all duration-200"
              title="Eliminar inversión"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Valor Actual</p>
              <p className="text-lg font-bold">{formatCurrency(summary.currentValue)}</p>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Resultado</p>
              {!summary.hasPrice && summary.type !== 'cash' ? (
                <div className="flex items-baseline justify-end gap-1 font-bold text-slate-400">
                  <span className="text-lg">--</span>
                </div>
              ) : (
                <div className={cn("flex items-baseline justify-end gap-1 font-bold", summary.netProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  <span className="text-lg">{formatCurrency(summary.netProfit)}</span>
                  <span className="text-xs">({formatPercent(summary.profitPercent)})</span>
                </div>
              )}
           </div>
        </div>

          <div className="grid grid-cols-2 gap-y-2 text-xs border-t border-slate-50 pt-3">
            <div className="flex justify-between col-span-2">
               <span className="text-slate-500">{summary.type === 'cash' ? 'Saldo Total:' : 'Cantidad:'}</span>
               <span className="font-bold">{summary.type === 'cash' ? formatCurrency(summary.totalQuantity) : summary.totalQuantity}</span>
            </div>
            {summary.type !== 'cash' && (
              <div className="flex justify-between col-span-2">
                 <span className="text-slate-500">Inversión Real:</span>
                 <span className="font-bold">{formatCurrency(summary.totalInvested)}</span>
              </div>
            )}
            {summary.type !== 'cash' && (
              <div className="flex justify-between col-span-2">
                 <span className="text-slate-500">Precio Medio:</span>
                 <span className="font-bold">{formatCurrency(summary.avgPrice)}</span>
              </div>
            )}
            {summary.type !== 'cash' && (
              <div className="flex justify-between col-span-2">
                 <span className="text-slate-500">Peso en cartera:</span>
                 <span className="font-bold">{(summary as any).portfolioPercent?.toFixed(1) ?? '0.0'}%</span>
              </div>
            )}
          </div>
      </div>
      <div className="bg-slate-50 px-5 py-3 flex justify-between items-center">
         <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <Info size={10} />
            <span>{summary.type === 'cash' ? 'ACTIVO LÍQUIDO' : `PRECIO MERCADO: ${summary.hasPrice ? formatCurrency(summary.currentPrice) : '--'}`}</span>
         </div>
         <div className={cn("w-2 h-2 rounded-full", (summary.hasPrice || summary.type === 'cash') ? (summary.netProfit >= 0 ? "bg-emerald-500" : "bg-rose-500") : "bg-slate-300 animate-pulse")} />
      </div>
    </motion.div>
  );
}

// ─── Banner Patrimonio Total ──────────────────────────────────────────────────

const WEALTH_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#6366f1', '#f43f5e', '#06b6d4', '#84cc16', '#f97316',
];

function TotalWealthBanner({
  investmentValue,
  propertyEquity,
  summaries,
  propertyStats,
}: {
  investmentValue: number;
  propertyEquity: number;
  summaries: InvestmentSummary[];
  propertyStats: PropertyStats[];
}) {
  const fmt = (v: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);

  const total = investmentValue + propertyEquity;

  // Construir items para la rueda: un item por activo financiero + uno por inmueble
  const items: { name: string; value: number; percent: number }[] = [];

  for (const s of summaries) {
    if (s.currentValue <= 0) continue;
    const existing = items.find(i => i.name === (s.type === 'cash' ? s.name : s.symbol));
    if (existing) {
      existing.value += s.currentValue;
    } else {
      items.push({ name: s.type === 'cash' ? s.name : s.symbol, value: s.currentValue, percent: 0 });
    }
  }

  for (const ps of propertyStats) {
    if (ps.equity <= 0) continue;
    items.push({ name: ps.property.name, value: ps.equity, percent: 0 });
  }

  // Calcular porcentajes
  for (const item of items) {
    item.percent = total > 0 ? (item.value / total) * 100 : 0;
  }
  items.sort((a, b) => b.value - a.value);

  // SVG donut manual
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const R = 70;
  const r = 44;

  function polarToXY(angleDeg: number, radius: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function buildArc(startAngle: number, endAngle: number, outerR: number, innerR: number) {
    const s1 = polarToXY(startAngle, outerR);
    const e1 = polarToXY(endAngle, outerR);
    const s2 = polarToXY(endAngle, innerR);
    const e2 = polarToXY(startAngle, innerR);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return [
      `M ${s1.x} ${s1.y}`,
      `A ${outerR} ${outerR} 0 ${large} 1 ${e1.x} ${e1.y}`,
      `L ${s2.x} ${s2.y}`,
      `A ${innerR} ${innerR} 0 ${large} 0 ${e2.x} ${e2.y}`,
      'Z',
    ].join(' ');
  }

  let currentAngle = 0;
  const arcs = items.map((item, i) => {
    const sweep = (item.value / total) * 360;
    const path = buildArc(currentAngle, currentAngle + sweep - 1, R, r);
    currentAngle += sweep;
    return { ...item, path, color: WEALTH_COLORS[i % WEALTH_COLORS.length] };
  });

  return (
    <div className="bg-slate-900 rounded-2xl p-6 space-y-6">
      {/* Fila superior: total + desglose rápido */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            Patrimonio Neto Total
          </p>
          <p className="text-3xl font-black text-white tracking-tight">{fmt(total)}</p>
        </div>
        <div className="flex gap-6 sm:gap-8">
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inversiones</p>
            <p className="text-lg font-bold text-slate-200">{fmt(investmentValue)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inmobiliario</p>
            <p className="text-lg font-bold text-slate-200">{fmt(propertyEquity)}</p>
          </div>
        </div>
      </div>

      {/* Desglose con rueda */}
      {items.length > 0 && (
        <div className="border-t border-slate-800 pt-5 flex flex-col md:flex-row gap-6 items-center">
          {/* Donut SVG */}
          <div className="shrink-0">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              {arcs.map((arc, i) => (
                <path key={i} d={arc.path} fill={arc.color} opacity={0.9} />
              ))}
              <text x={cx} y={cy - 6} textAnchor="middle" fill="white"
                fontSize="11" fontWeight="800" fontFamily="system-ui">
                TOTAL
              </text>
              <text x={cx} y={cy + 10} textAnchor="middle" fill="#94a3b8"
                fontSize="9" fontWeight="600" fontFamily="system-ui">
                {fmt(total).replace('€', '').trim()}€
              </text>
            </svg>
          </div>

          {/* Leyenda */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            {arcs.map((arc, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-3 py-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: arc.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-200 truncate">{arc.name}</p>
                  <p className="text-[10px] text-slate-400">{fmt(arc.value)}</p>
                </div>
                <span className="text-xs font-black text-slate-300 shrink-0">
                  {arc.percent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
