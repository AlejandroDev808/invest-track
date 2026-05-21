import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';
import { Property, PropertyStats } from '../types';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { Plus, Home, Trash2, Edit2, X, TrendingUp, TrendingDown, RefreshCcw, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Cálculos ─────────────────────────────────────────────────────────────────

function computeStats(property: Property): PropertyStats {
  const debtRemaining = property.hasHypothec
    ? property.monthlyPayment * property.monthsRemaining
    : 0;
  const equity = property.appraisalValue - debtRemaining;
  const appreciation = property.appraisalValue - property.purchasePrice;
  const appreciationPercent =
    property.purchasePrice > 0 ? (appreciation / property.purchasePrice) * 100 : 0;
  const ltv =
    property.appraisalValue > 0 ? (debtRemaining / property.appraisalValue) * 100 : 0;

  return { property, debtRemaining, equity, appreciation, appreciationPercent, ltv };
}

// ─── Formulario vacío ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  purchasePrice: '',
  appraisalValue: '',
  hasHypothec: false,
  monthlyPayment: '',
  monthsRemaining: '',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PropertySection({ user }: { user: User }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Cargar inmuebles desde Firestore
  useEffect(() => {
    const q = query(
      collection(db, 'properties'),
      where('ownerId', '==', user.uid)
    );
    const unsub = onSnapshot(q, snapshot => {
      setProperties(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Property)));
    });
    return () => unsub();
  }, [user.uid]);

  const stats = useMemo(() => properties.map(computeStats), [properties]);

  // Totales
  const totals = useMemo(() => {
    const totalAppraisal = stats.reduce((acc, s) => acc + s.property.appraisalValue, 0);
    const totalDebt = stats.reduce((acc, s) => acc + s.debtRemaining, 0);
    const totalEquity = stats.reduce((acc, s) => acc + s.equity, 0);
    const totalPurchase = stats.reduce((acc, s) => acc + s.property.purchasePrice, 0);
    const totalAppreciation = totalAppraisal - totalPurchase;
    const totalAppreciationPct = totalPurchase > 0 ? (totalAppreciation / totalPurchase) * 100 : 0;
    return { totalAppraisal, totalDebt, totalEquity, totalAppreciation, totalAppreciationPct };
  }, [stats]);

  const openAdd = () => {
    setEditingProperty(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (p: Property) => {
    setEditingProperty(p);
    setForm({
      name: p.name,
      purchasePrice: p.purchasePrice.toString(),
      appraisalValue: p.appraisalValue.toString(),
      hasHypothec: p.hasHypothec,
      monthlyPayment: p.monthlyPayment.toString(),
      monthsRemaining: p.monthsRemaining.toString(),
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data: Omit<Property, 'id' | 'createdAt' | 'updatedAt'> = {
        ownerId: user.uid,
        name: form.name.trim(),
        purchasePrice: parseFloat(form.purchasePrice.replace(',', '.')),
        appraisalValue: parseFloat(form.appraisalValue.replace(',', '.')),
        hasHypothec: form.hasHypothec,
        monthlyPayment: form.hasHypothec ? parseFloat(form.monthlyPayment.replace(',', '.')) : 0,
        monthsRemaining: form.hasHypothec ? parseInt(form.monthsRemaining) : 0,
      };

      if (editingProperty) {
        await updateDoc(doc(db, 'properties', editingProperty.id), {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'properties'), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setShowModal(false);
      setForm(EMPTY_FORM);
      setEditingProperty(null);
    } catch (err) {
      console.error('Error guardando inmueble:', err);
      alert('Error al guardar el inmueble');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Eliminar este inmueble?')) return;
    await deleteDoc(doc(db, 'properties', id));
  };

  const f = (key: keyof typeof EMPTY_FORM) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-slate-50 rounded-lg">
            <Building2 size={18} className="text-slate-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Patrimonio Inmobiliario</h2>
            <p className="text-xs text-slate-400 font-medium">Inmuebles y su hipoteca asociada</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm text-sm"
        >
          <Plus size={18} />
          <span className="hidden sm:inline">Añadir Inmueble</span>
          <span className="sm:hidden">Añadir</span>
        </button>
      </div>

      {/* Tarjetas de resumen global */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Valor Total Tasación" value={formatCurrency(totals.totalAppraisal)} color="blue" />
          <SummaryCard label="Deuda Total" value={formatCurrency(totals.totalDebt)} color="rose" />
          <SummaryCard label="Patrimonio Neto" value={formatCurrency(totals.totalEquity)} color="emerald" />
          <SummaryCard
            label="Plusvalía Total"
            value={formatCurrency(totals.totalAppreciation)}
            sub={`${totals.totalAppreciation >= 0 ? '+' : ''}${formatPercent(totals.totalAppreciationPct)}`}
            color={totals.totalAppreciation >= 0 ? 'emerald' : 'rose'}
          />
        </div>
      )}

      {/* Lista de inmuebles */}
      {stats.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
            <Home size={32} />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-slate-600">No hay inmuebles registrados</p>
            <p className="text-sm text-slate-400">Añade tu primera propiedad para hacer seguimiento.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {stats.map(s => (
              <PropertyCard
                key={s.property.id}
                stats={s}
                onEdit={() => openEdit(s.property)}
                onDelete={() => handleDelete(s.property.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modal añadir / editar */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">
                  {editingProperty ? 'Editar Inmueble' : 'Nuevo Inmueble'}
                </h3>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                {/* Nombre */}
                <Field label="Nombre del inmueble">
                  <input
                    required
                    placeholder="Piso Madrid, Local Valencia..."
                    value={form.name}
                    onChange={f('name')}
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Precio de compra (€)">
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="150000"
                      value={form.purchasePrice}
                      onChange={f('purchasePrice')}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Valor tasación actual (€)">
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="180000"
                      value={form.appraisalValue}
                      onChange={f('appraisalValue')}
                      className={inputCls}
                    />
                  </Field>
                </div>

                {/* Toggle hipoteca */}
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <input
                    type="checkbox"
                    id="hasHypothec"
                    checked={form.hasHypothec}
                    onChange={e => setForm(prev => ({ ...prev, hasHypothec: e.target.checked }))}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <label htmlFor="hasHypothec" className="text-sm font-semibold text-slate-700 cursor-pointer">
                    Tiene hipoteca asociada
                  </label>
                </div>

                {/* Campos hipoteca */}
                <AnimatePresence>
                  {form.hasHypothec && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Cuota mensual (€)">
                          <input
                            required
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="650"
                            value={form.monthlyPayment}
                            onChange={f('monthlyPayment')}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Meses restantes">
                          <input
                            required
                            type="number"
                            step="1"
                            min="0"
                            placeholder="240"
                            value={form.monthsRemaining}
                            onChange={f('monthsRemaining')}
                            className={inputCls}
                          />
                        </Field>
                      </div>
                      {/* Preview capital pendiente */}
                      {form.monthlyPayment && form.monthsRemaining && (
                        <p className="text-xs text-slate-500 mt-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                          Capital pendiente estimado:{' '}
                          <span className="font-bold text-rose-600">
                            {formatCurrency(
                              parseFloat(form.monthlyPayment || '0') *
                              parseInt(form.monthsRemaining || '0')
                            )}
                          </span>
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <RefreshCcw size={16} className="animate-spin" />}
                  {isSaving ? 'Guardando...' : editingProperty ? 'Guardar cambios' : 'Añadir inmueble'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Card de inmueble ─────────────────────────────────────────────────────────

function PropertyCard({
  stats: s,
  onEdit,
  onDelete,
}: {
  stats: PropertyStats;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPositive = s.appreciation >= 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
    >
      <div className="p-5 flex-1 space-y-4">
        {/* Cabecera */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-600">
              <Home size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 leading-tight">{s.property.name}</h4>
              <p className="text-xs font-bold text-slate-400">
                {s.property.hasHypothec ? `${s.property.monthsRemaining} meses restantes` : 'Sin hipoteca'}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Edit2 size={16} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Valor y plusvalía */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase">Tasación</p>
            <p className="text-lg font-bold">{formatCurrency(s.property.appraisalValue)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Plusvalía</p>
            <div className={cn('flex items-baseline justify-end gap-1 font-bold', isPositive ? 'text-emerald-600' : 'text-rose-600')}>
              <span className="text-lg">{formatCurrency(s.appreciation)}</span>
            </div>
            <span className={cn('text-xs font-bold', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
              {isPositive ? '+' : ''}{formatPercent(s.appreciationPercent)}
            </span>
          </div>
        </div>

        {/* Detalles */}
        <div className="space-y-2 text-xs border-t border-slate-50 pt-3">
          <Row label="Precio de compra" value={formatCurrency(s.property.purchasePrice)} />
          <Row label="Patrimonio neto" value={formatCurrency(s.equity)} bold />
          {s.property.hasHypothec && (
            <>
              <Row label="Capital pendiente" value={formatCurrency(s.debtRemaining)} valueClass="text-rose-600" />
              <Row label="Cuota mensual" value={formatCurrency(s.property.monthlyPayment)} />
              <Row label="LTV" value={`${s.ltv.toFixed(1)}%`} valueClass={s.ltv > 80 ? 'text-rose-500' : 'text-slate-700'} />
            </>
          )}
        </div>
      </div>

      {/* Pie */}
      <div className="bg-slate-50 px-5 py-3 flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400">
          {s.property.hasHypothec ? 'CON HIPOTECA' : 'SIN HIPOTECA'}
        </span>
        <div className={cn('w-2 h-2 rounded-full', isPositive ? 'bg-emerald-500' : 'bg-rose-500')} />
      </div>
    </motion.div>
  );
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={cn('font-semibold', bold && 'font-bold text-slate-900', valueClass)}>
        {value}
      </span>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: 'blue' | 'emerald' | 'rose';
}) {
  const colorMap = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    rose: 'text-rose-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={cn('text-lg font-black', colorMap[color])}>{value}</p>
      {sub && <p className={cn('text-xs font-bold', colorMap[color])}>{sub}</p>}
    </div>
  );
}
