import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  orderBy
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import FixedDepositCalculator from './FixedDepositCalculator';
import PricingCalculatorForm from './PricingCalculatorForm';
import CashFlowModal from './CashFlowModal';
import ConfirmModal from '../Common/ConfirmModal';

// --- IMPORTACIÓN E REGISTRO DE CHART.JS ---
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  Filler
);

const FinancesPage = () => {
    const { user, userData } = useAuth();
    const [activePageTab, setActivePageTab] = useState('summary'); // 'summary' | 'cashflow'
    const [calculatorTab, setCalculatorTab] = useState('deposit'); // 'deposit' | 'pricing'
    const [dollarRates, setDollarRates] = useState([]);
    const [loadingRates, setLoadingRates] = useState(true);
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [budget, setBudget] = useState({ incomeGoal: 0, expenseBudget: 0 });
    const [operations, setOperations] = useState([]);

    // --- ESTADOS DE CASH FLOW ---
    const [cashflowItems, setCashflowItems] = useState([]);
    const [projectionType, setProjectionType] = useState('weekly'); // 'weekly' | 'monthly' | 'quarterly'
    const [initialCashBalance, setInitialCashBalance] = useState(0);
    const [safetyReserve, setSafetyReserve] = useState(0);
    const [isEditingSettings, setIsEditingSettings] = useState(false);
    const [showCashFlowModal, setShowCashFlowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    // --- LEER CONFIGURACIÓN Y OPERACIONES ---
    useEffect(() => {
        if (!user) return;
        const now = new Date();
        const q = query(
            collection(db, 'users', user.uid, 'operations'),
            where("year", "==", now.getFullYear()),
            where("month", "==", now.getMonth() + 1)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOperations(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribe();
    }, [user]);

    useEffect(() => {
        if (userData) {
            setBudget({ incomeGoal: userData.incomeGoal || 0, expenseBudget: userData.expenseBudget || 0 });
            setInitialCashBalance(userData.initialCashBalance || 0);
            setSafetyReserve(userData.safetyReserve || 0);
        }
    }, [userData]);

    // --- LEER ITEMS DEL CASH FLOW ---
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'users', user.uid, 'cashflow_items'), orderBy("date", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCashflowItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [user]);

    const monthlyMetrics = useMemo(() => {
        let income = 0, expense = 0;
        operations.forEach(op => {
            if (['venta', 'ingreso'].includes(op.type)) income += op.amount;
            else expense += op.amount;
        });
        return { income, expense };
    }, [operations]);

    const handleSaveBudget = async () => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                incomeGoal: parseFloat(budget.incomeGoal) || 0,
                expenseBudget: parseFloat(budget.expenseBudget) || 0
            });
            setIsEditingBudget(false);
        } catch (error) { console.error("Error updating budget:", error); }
    };

    const handleSaveSettings = async () => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                initialCashBalance: parseFloat(initialCashBalance) || 0,
                safetyReserve: parseFloat(safetyReserve) || 0
            });
            setIsEditingSettings(false);
        } catch (err) {
            console.error("Error updating settings:", err);
        }
    };

    const promptDelete = (itemId) => {
        setItemToDelete(itemId);
        setShowConfirmDelete(true);
    };

    const handleDeleteItem = async () => {
        if (!itemToDelete || !user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'cashflow_items', itemToDelete));
            setShowConfirmDelete(false);
            setItemToDelete(null);
        } catch (err) {
            console.error("Error deleting item:", err);
        }
    };
    
    const formatCurrency = (value) => {
        if (value === null || typeof value === 'undefined') return '$--';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value)
    };

    useEffect(() => {
        const fetchFinancialData = async () => {
            setLoadingRates(true);
            try {
                const response = await fetch('https://dolarapi.com/v1/dolares');
                if (!response.ok) throw new Error('Network response error');
                const data = await response.json();
                setDollarRates(data);
            } catch (error) { 
                setDollarRates([]);
            } finally { setLoadingRates(false); }
        };
        fetchFinancialData();
    }, []);

    const incomePct = Math.min((monthlyMetrics.income / (budget.incomeGoal || 1)) * 100, 100);
    const expensePct = Math.min((monthlyMetrics.expense / (budget.expenseBudget || 1)) * 100, 100);

    // --- ALGORITMO FINANCIERO DE PROYECCIÓN DE CASH FLOW ---
    const projectionTimeline = useMemo(() => {
        const today = new Date();
        const timeline = [];
        const numBuckets = projectionType === 'weekly' ? 8 : projectionType === 'monthly' ? 6 : 4;

        for (let i = 0; i < numBuckets; i++) {
            let label = '';
            let start = new Date(today);
            let end = new Date(today);

            if (projectionType === 'weekly') {
                start.setDate(today.getDate() + i * 7);
                end.setDate(today.getDate() + (i + 1) * 7 - 1);
                const startDayStr = `${start.getDate()}/${start.getMonth() + 1}`;
                label = `Sem. ${i + 1} (${startDayStr})`;
            } else if (projectionType === 'monthly') {
                start.setMonth(today.getMonth() + i, 1);
                end.setMonth(today.getMonth() + i + 1, 0);
                const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                label = `${monthNames[start.getMonth()]} ${start.getFullYear().toString().slice(-2)}`;
            } else {
                start.setMonth(today.getMonth() + i * 3, 1);
                end.setMonth(today.getMonth() + (i + 1) * 3, 0);
                const qNumber = Math.floor(start.getMonth() / 3) + 1;
                label = `T${i + 1} (Q${qNumber} ${start.getFullYear().toString().slice(-2)})`;
            }

            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            timeline.push({
                label,
                start: new Date(start),
                end: new Date(end),
                inflow: 0,
                outflow: 0,
                net: 0,
                balance: 0
            });
        }

        cashflowItems.forEach(item => {
            const itemDate = new Date(item.date);
            itemDate.setHours(12, 0, 0, 0); // Evitar diferencias horarias
            const amount = item.amount;
            const type = item.type;

            timeline.forEach((bucket) => {
                let matches = false;

                if (item.periodicity === 'once') {
                    matches = itemDate >= bucket.start && itemDate <= bucket.end;
                } else if (item.periodicity === 'weekly') {
                    let tempDate = new Date(itemDate);
                    while (tempDate <= bucket.end) {
                        if (tempDate >= bucket.start && tempDate <= bucket.end) {
                            matches = true;
                            break;
                        }
                        tempDate.setDate(tempDate.getDate() + 7);
                    }
                } else if (item.periodicity === 'monthly') {
                    let tempDate = new Date(itemDate);
                    while (tempDate <= bucket.end) {
                        if (tempDate >= bucket.start && tempDate <= bucket.end) {
                            matches = true;
                            break;
                        }
                        tempDate.setMonth(tempDate.getMonth() + 1);
                    }
                } else if (item.periodicity === 'quarterly') {
                    let tempDate = new Date(itemDate);
                    while (tempDate <= bucket.end) {
                        if (tempDate >= bucket.start && tempDate <= bucket.end) {
                            matches = true;
                            break;
                        }
                        tempDate.setMonth(tempDate.getMonth() + 3);
                    }
                }

                if (matches) {
                    if (type === 'ingreso') bucket.inflow += amount;
                    else bucket.outflow += amount;
                }
            });
        });

        let runningBalance = parseFloat(initialCashBalance) || 0;
        timeline.forEach(bucket => {
            bucket.net = bucket.inflow - bucket.outflow;
            bucket.balance = runningBalance + bucket.net;
            runningBalance = bucket.balance;
        });

        return timeline;
    }, [projectionType, cashflowItems, initialCashBalance]);

    // --- ALERTA DE ILIQUIDEZ EN TIEMPO REAL ---
    const liquidityWarning = useMemo(() => {
        const dangerPeriod = projectionTimeline.find(bucket => bucket.balance < (parseFloat(safetyReserve) || 0));
        if (dangerPeriod) {
            const isNegative = dangerPeriod.balance < 0;
            return {
                hasAlert: true,
                period: dangerPeriod.label,
                balance: dangerPeriod.balance,
                threshold: parseFloat(safetyReserve) || 0,
                isNegative
            };
        }
        return { hasAlert: false };
    }, [projectionTimeline, safetyReserve]);

    // --- DATOS DEL GRÁFICO DE CASH FLOW ---
    const chartLabels = projectionTimeline.map(b => b.label);
    const chartDataValues = projectionTimeline.map(b => b.balance);
    const safetyReserveValues = projectionTimeline.map(() => parseFloat(safetyReserve) || 0);

    const cashFlowChartData = {
        labels: chartLabels,
        datasets: [
            {
                label: 'Caja Proyectada (ARS)',
                data: chartDataValues,
                borderColor: liquidityWarning.isNegative ? '#ef4444' : '#2563eb', // Rojo si hay iliquidez
                backgroundColor: 'rgba(37, 99, 235, 0.05)',
                fill: true,
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 4,
                pointHoverRadius: 8
            },
            {
                label: 'Reserva Mínima (Colchón)',
                data: safetyReserveValues,
                borderColor: '#f97316',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                borderWidth: 2
            }
        ]
    };

    const cashFlowChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { color: '#64748b', font: { family: 'Inter', size: 12, weight: '500' } }
            },
            tooltip: {
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: 'Inter', size: 13, weight: '700' },
                bodyFont: { family: 'Inter', size: 12 }
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } } },
            y: { grid: { color: '#f1f5f9' }, ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } } }
        }
    };
    
    return (
         <div className="space-y-8 bg-gray-50/50 min-h-screen pb-12">
             {showCashFlowModal && (
                 <CashFlowModal 
                     item={editingItem} 
                     onClose={() => { setShowCashFlowModal(false); setEditingItem(null); }} 
                 />
             )}

             {showConfirmDelete && (
                 <ConfirmModal
                     message="¿Estás seguro de que quieres eliminar esta estimación? Esta acción no se puede deshacer."
                     onConfirm={handleDeleteItem}
                     onCancel={() => { setShowConfirmDelete(false); setItemToDelete(null); }}
                     isDestructive={true}
                     confirmText="Eliminar"
                 />
             )}

             <header className="flex justify-between items-center p-6 bg-white border-b border-slate-100 no-print rounded-3xl shadow-sm">
                 <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Centro Financiero</h2>
                    <p className="text-slate-500 font-medium">Monitorea tus metas, divisas y flujo de fondos proyectado.</p>
                 </div>
             </header>

             {/* --- TABS --- */}
             <div className="flex border-b border-slate-200 px-6 no-print">
                 <button 
                     onClick={() => setActivePageTab('summary')}
                     className={`pb-4 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activePageTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                 >
                     <Icon name="Target" size={16} /> Resumen y Mercado
                 </button>
                 <button 
                     onClick={() => setActivePageTab('cashflow')}
                     className={`pb-4 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activePageTab === 'cashflow' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                 >
                     <Icon name="TrendingUp" size={16} /> Flujo de Fondos Proyectado
                 </button>
                 <button 
                     onClick={() => setActivePageTab('calculators')}
                     className={`pb-4 px-6 font-bold text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 ${activePageTab === 'calculators' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                 >
                     <Icon name="PieChart" size={16} /> Calculadoras
                 </button>
             </div>
             
             {/* --- PESTAÑA 1: RESUMEN Y MERCADO --- */}
             {activePageTab === 'summary' && (
                  <div className="px-6 space-y-8">
                      <section className="w-full">
                          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                              <div className="flex justify-between items-center mb-8 relative z-10">
                                  <h3 className="text-xl font-bold text-slate-800 flex items-center">
                                      <Icon name="Target" className="w-6 h-6 mr-3 text-blue-500"/> 
                                      Metas Mensuales
                                  </h3>
                                  {!isEditingBudget && (
                                      <button onClick={() => setIsEditingBudget(true)} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer">
                                          <Icon name="Edit2" className="w-4 h-4"/> Editar
                                      </button>
                                  )}
                              </div>
                              
                             {isEditingBudget ? (
                                 <div className="space-y-6 relative z-10 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                         <div>
                                             <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Meta de Ingresos</label>
                                             <div className="relative">
                                                 <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-blue-500 font-bold">$</span>
                                                 <input type="number" value={budget.incomeGoal} onChange={e => setBudget({...budget, incomeGoal: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border border-slate-200 rounded-xl transition-all font-bold text-slate-700 outline-none shadow-sm"/>
                                             </div>
                                         </div>
                                         <div>
                                             <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Límite de Gastos</label>
                                             <div className="relative">
                                                 <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-red-500 font-bold">$</span>
                                                 <input type="number" value={budget.expenseBudget} onChange={e => setBudget({...budget, expenseBudget: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border border-slate-200 rounded-xl transition-all font-bold text-slate-700 outline-none shadow-sm"/>
                                             </div>
                                         </div>
                                     </div>
                                     <div className="flex justify-end gap-3 pt-2">
                                         <button onClick={() => setIsEditingBudget(false)} className="py-2.5 px-5 bg-white text-slate-500 rounded-xl hover:bg-slate-100 font-bold transition-colors border border-slate-200 cursor-pointer">Cancelar</button>
                                         <button onClick={handleSaveBudget} className="py-2.5 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 font-bold transition-all cursor-pointer">Guardar Metas</button>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="space-y-10 relative z-10">
                                     {/* Barra Ingresos */}
                                     <div className="space-y-3">
                                         <div className="flex justify-between items-end">
                                             <div>
                                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ingresos Actuales</p>
                                                 <p className="text-3xl font-black text-slate-800">{formatCurrency(monthlyMetrics.income)}</p>
                                             </div>
                                             <div className="text-right">
                                                 <p className="text-xs font-bold text-slate-400">Objetivo: {formatCurrency(budget.incomeGoal)}</p>
                                                 <p className="text-sm font-black text-green-500">{incomePct.toFixed(0)}%</p>
                                             </div>
                                         </div>
                                         <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
                                             <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${incomePct}%` }}></div>
                                         </div>
                                     </div>
         
                                     {/* Barra Gastos */}
                                      <div className="space-y-3">
                                         <div className="flex justify-between items-end">
                                             <div>
                                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Gastos Actuales</p>
                                                 <p className="text-3xl font-black text-slate-800">{formatCurrency(monthlyMetrics.expense)}</p>
                                             </div>
                                             <div className="text-right">
                                                 <p className="text-xs font-bold text-slate-400">Presupuesto: {formatCurrency(budget.expenseBudget)}</p>
                                                 <p className={`text-sm font-black ${expensePct > 90 ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{expensePct.toFixed(0)}%</p>
                                             </div>
                                         </div>
                                         <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
                                             <div className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${expensePct > 90 ? 'from-red-500 to-rose-600' : expensePct > 75 ? 'from-orange-400 to-amber-500' : 'from-blue-400 to-indigo-400'}`} style={{ width: `${expensePct}%` }}></div>
                                         </div>
                                     </div>
                                 </div>
                             )}
                          </div>
                      </section>
        
                     {/* SECCIÓN COTIZACIONES */}
                     <section className="space-y-6">
                         <h3 className="text-xl font-bold text-slate-800 flex items-center px-1">
                             <Icon name="TrendingUp" className="w-6 h-6 mr-3 text-green-500"/> 
                             Mercado de Divisas
                         </h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                             {loadingRates ? (
                                 [1,2,3,4].map(i => <div key={i} className="h-40 bg-white rounded-3xl animate-pulse border border-slate-100"></div>)
                             ) : dollarRates.length > 0 ? dollarRates.map(rate => (
                                 <div key={rate.casa} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-default">
                                     <div className="flex items-center justify-between mb-6">
                                         <h4 className="font-bold text-lg text-slate-800 capitalize">{rate.nombre}</h4>
                                         <span className="text-[10px] font-black bg-slate-800 text-white px-2.5 py-1 rounded-full uppercase">ARS</span>
                                     </div>
                                     <div className="flex justify-between items-end">
                                         <div>
                                             <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Compra</p>
                                             <p className="text-xl font-bold text-slate-500">{formatCurrency(rate.compra)}</p>
                                         </div>
                                         <div className="text-right">
                                             <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-1">Venta</p>
                                             <p className="text-2xl font-black text-green-600 group-hover:scale-105 transition-transform origin-right">{formatCurrency(rate.venta)}</p>
                                         </div>
                                     </div>
                                 </div>
                             )) : <p className="text-slate-500 text-center col-span-full py-10">Cotizaciones no disponibles en este momento.</p>}
                         </div>
                     </section>
                 </div>
             )}

             {/* --- PESTAÑA 2: FLUJO DE FONDOS PROYECTADO (CASH FLOW) --- */}
             {activePageTab === 'cashflow' && (
                 <div className="px-6 space-y-8">
                     {/* --- BANNER DE ALERTA DE LIQUIDEZ --- */}
                     {liquidityWarning.hasAlert && (
                         <div className={`p-5 rounded-3xl border shadow-md flex items-start gap-4 animate-pulse ${liquidityWarning.isNegative ? 'bg-red-500/10 border-red-500/25 text-red-700' : 'bg-orange-500/10 border-orange-500/25 text-orange-700'}`}>
                             <div className="p-2.5 rounded-2xl bg-white/60 shadow-sm shrink-0">
                                 <Icon name="ShieldAlert" className={`w-6 h-6 ${liquidityWarning.isNegative ? 'text-red-600' : 'text-orange-600'}`} />
                             </div>
                             <div>
                                 <h4 className="font-extrabold uppercase text-xs tracking-wider">
                                     {liquidityWarning.isNegative ? 'Alerta de Iliquidez Crítica Detectada' : 'Reserva de Seguridad Mínima Comprometida'}
                                 </h4>
                                 <p className="text-sm mt-1 leading-relaxed">
                                     {liquidityWarning.isNegative 
                                        ? `Se prevé un saldo de caja negativo de ${formatCurrency(liquidityWarning.balance)} para el período "${liquidityWarning.period}". ¡Se requiere cubrir un faltante de al menos ${formatCurrency(Math.abs(liquidityWarning.balance))} para evitar saldos descubiertos!`
                                        : `El saldo acumulado proyectado caerá a ${formatCurrency(liquidityWarning.balance)} en el período "${liquidityWarning.period}", quedando por debajo de tu colchón de seguridad de ${formatCurrency(liquidityWarning.threshold)}.`
                                     }
                                 </p>
                             </div>
                         </div>
                     )}

                     {/* Controles Principales */}
                     <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 no-print bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                         <div>
                             <h3 className="text-lg font-black text-slate-800 tracking-tight">Simulador de Proyecciones</h3>
                             <p className="text-slate-400 text-xs font-medium">Ajusta la agrupación y carga estimaciones de tesorería.</p>
                         </div>
                         <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                             <select
                                 value={projectionType}
                                 onChange={(e) => setProjectionType(e.target.value)}
                                 className="px-4 py-2 text-xs font-bold bg-slate-100 text-slate-700 rounded-xl border border-slate-200 outline-none cursor-pointer"
                             >
                                 <option value="weekly">Semanal (Próximas 8 semanas)</option>
                                 <option value="monthly">Mensual (Próximos 6 meses)</option>
                                 <option value="quarterly">Trimestral (Próximos 4 trimestres)</option>
                             </select>
                             <button
                                 onClick={() => { setEditingItem(null); setShowCashFlowModal(true); }}
                                 className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2"
                             >
                                 <Icon name="PlusCircle" size={14} /> Cargar Estimación
                             </button>
                         </div>
                     </div>

                     {/* Visualización y Parámetros */}
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                         {/* Gráfico (Col-span 2) */}
                         <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                             <h4 className="font-black text-slate-800 text-base mb-6">Tendencia de Caja Acumulada Proyectada</h4>
                             <div className="h-[280px] w-full relative">
                                 <Line data={cashFlowChartData} options={cashFlowChartOptions} />
                             </div>
                         </div>

                         {/* Configuración de Caja (Col-span 1) */}
                         <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                             <div>
                                 <div className="flex justify-between items-center mb-6">
                                     <h4 className="font-black text-slate-800 text-base">Parámetros de Caja</h4>
                                     {!isEditingSettings && (
                                         <button 
                                             onClick={() => setIsEditingSettings(true)}
                                             className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg cursor-pointer"
                                         >
                                             <Icon name="Edit2" size={12} /> Configurar
                                         </button>
                                     )}
                                 </div>
                                 <p className="text-slate-400 text-xs font-medium mb-8">Establece el punto de partida real y tus límites de protección de liquidez.</p>
                             </div>

                             {isEditingSettings ? (
                                 <div className="space-y-5 bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-4">
                                     <div>
                                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Saldo Inicial de Caja</label>
                                         <div className="relative">
                                             <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-emerald-600 font-bold text-xs">$</span>
                                             <input 
                                                 type="number" 
                                                 value={initialCashBalance} 
                                                 onChange={e => setInitialCashBalance(e.target.value)} 
                                                 className="w-full pl-7 p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none text-xs"
                                             />
                                         </div>
                                     </div>
                                     <div>
                                         <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Reserva Mínima</label>
                                         <div className="relative">
                                             <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-orange-500 font-bold text-xs">$</span>
                                             <input 
                                                 type="number" 
                                                 value={safetyReserve} 
                                                 onChange={e => setSafetyReserve(e.target.value)} 
                                                 className="w-full pl-7 p-2.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none text-xs"
                                             />
                                         </div>
                                     </div>
                                     <div className="flex justify-end gap-2 pt-2">
                                         <button onClick={() => setIsEditingSettings(false)} className="py-2 px-4 bg-white text-slate-500 rounded-lg hover:bg-slate-100 font-bold text-xs border border-slate-200 cursor-pointer">Cancelar</button>
                                         <button onClick={handleSaveSettings} className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs shadow-sm cursor-pointer">Guardar</button>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="space-y-6 mb-6">
                                     <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                         <div>
                                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo de Caja Inicial</p>
                                             <p className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(initialCashBalance)}</p>
                                         </div>
                                         <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                             <Icon name="Landmark" size={20} />
                                         </div>
                                     </div>
                                     <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                         <div>
                                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reserva de Seguridad Mínima</p>
                                             <p className="text-2xl font-black text-slate-800 mt-1">{formatCurrency(safetyReserve)}</p>
                                         </div>
                                         <div className="p-2.5 rounded-xl bg-orange-50 text-orange-500 border border-orange-100">
                                             <Icon name="Target" size={20} />
                                         </div>
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>

                     {/* Listado de Movimientos Proyectados (Cargados) */}
                     <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                         <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
                             <div>
                                 <h4 className="text-lg font-black text-slate-800 tracking-tight">Movimientos de Caja Proyectados</h4>
                                 <p className="text-slate-400 text-xs font-medium">Lista de flujos cargados para simulación de tesorería.</p>
                             </div>
                             <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                                 {cashflowItems.length} Estimados
                             </span>
                         </div>

                         {/* Vista responsive: Tabla para Escritorio, Cards para Mobile */}
                         {cashflowItems.length > 0 ? (
                             <>
                                 {/* --- TABLA ESCRITORIO (hidden en móviles) --- */}
                                 <div className="hidden md:block overflow-x-auto">
                                     <table className="min-w-full divide-y divide-slate-100">
                                         <thead className="bg-slate-50/50">
                                             <tr>
                                                 <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha Base</th>
                                                 <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoría</th>
                                                 <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descripción</th>
                                                 <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Frecuencia</th>
                                                 <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto</th>
                                                 <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acciones</th>
                                             </tr>
                                         </thead>
                                         <tbody className="bg-white divide-y divide-slate-100">
                                             {cashflowItems.map(item => (
                                                 <tr key={item.id} className="hover:bg-slate-50/40 transition-colors group">
                                                     <td className="px-6 py-5 text-xs font-semibold text-slate-500">{item.date}</td>
                                                     <td className="px-6 py-5">
                                                         <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide border ${item.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                             {item.category}
                                                         </span>
                                                     </td>
                                                     <td className="px-6 py-5 text-sm font-bold text-slate-800 capitalize">{item.description}</td>
                                                     <td className="px-6 py-5 text-xs font-bold text-slate-400 capitalize">
                                                         {item.periodicity === 'once' ? 'Una vez' : item.periodicity}
                                                     </td>
                                                     <td className={`px-6 py-5 text-right font-extrabold text-sm tracking-tight ${item.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                         {item.type === 'ingreso' ? '+' : '-'}{formatCurrency(item.amount)}
                                                     </td>
                                                     <td className="px-6 py-5 text-center">
                                                         <div className="flex justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                             <button 
                                                                 onClick={() => { setEditingItem(item); setShowCashFlowModal(true); }}
                                                                 className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                                                                 title="Editar"
                                                             >
                                                                 <Icon name="Edit" size={14} />
                                                             </button>
                                                             <button 
                                                                 onClick={() => promptDelete(item.id)}
                                                                 className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                                                 title="Eliminar"
                                                             >
                                                                 <Icon name="Trash2" size={14} />
                                                             </button>
                                                         </div>
                                                     </td>
                                                 </tr>
                                             ))}
                                         </tbody>
                                     </table>
                                 </div>

                                 {/* --- CARDS MÓVIL (hidden en desktop) --- */}
                                 <div className="block md:hidden p-4 space-y-4 bg-slate-50/50">
                                     {cashflowItems.map(item => (
                                         <div key={item.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
                                             <div className="flex justify-between items-start">
                                                 <div>
                                                     <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${item.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                         {item.category}
                                                     </span>
                                                     <h5 className="font-extrabold text-slate-800 text-sm mt-2 capitalize">{item.description}</h5>
                                                     <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                                         {item.date} • {item.periodicity === 'once' ? 'Una vez' : item.periodicity}
                                                     </p>
                                                 </div>
                                                 <span className={`font-black text-lg ${item.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                     {item.type === 'ingreso' ? '+' : '-'}{formatCurrency(item.amount)}
                                                 </span>
                                             </div>
                                             
                                             <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                                                 <button 
                                                     onClick={() => { setEditingItem(item); setShowCashFlowModal(true); }}
                                                     className="flex items-center gap-1 text-xs font-bold text-indigo-600 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 rounded-lg cursor-pointer"
                                                 >
                                                     <Icon name="Edit" size={12} /> Editar
                                                 </button>
                                                 <button 
                                                     onClick={() => promptDelete(item.id)}
                                                     className="flex items-center gap-1 text-xs font-bold text-red-600 px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer"
                                                 >
                                                     <Icon name="Trash2" size={12} /> Eliminar
                                                 </button>
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             </>
                         ) : (
                             <div className="py-24 text-center">
                                 <Icon name="CheckCircle" className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                 <p className="text-slate-400 font-bold italic text-sm">No hay movimientos proyectados cargados.</p>
                                 <p className="text-slate-400 text-xs mt-1">Presiona "Cargar Estimación" para comenzar a planificar.</p>
                             </div>
                         )}
                     </div>
                 </div>
             )}

             {/* --- PESTAÑA 3: CALCULADORAS Y SIMULADORES --- */}
             {activePageTab === 'calculators' && (
                 <div className="px-6 space-y-6">
                     <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 self-start no-print max-w-xs">
                         <button 
                             onClick={() => setCalculatorTab('deposit')}
                             className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${calculatorTab === 'deposit' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                         >
                             <Icon name="PieChart" size={14} /> Plazo Fijo
                         </button>
                         <button 
                             onClick={() => setCalculatorTab('pricing')}
                             className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${calculatorTab === 'pricing' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                         >
                             <Icon name="BarChart3" size={14} /> Calculadora Precios
                         </button>
                     </div>
                     <div className="w-full">
                         {calculatorTab === 'deposit' ? <FixedDepositCalculator /> : <PricingCalculatorForm dollarRates={dollarRates} />}
                     </div>
                 </div>
             )}
         </div>
    );
};

export default FinancesPage;
