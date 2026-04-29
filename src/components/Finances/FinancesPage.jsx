import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import FixedDepositCalculator from './FixedDepositCalculator';

const FinancesPage = () => {
    const { user, userData } = useAuth();
    const [dollarRates, setDollarRates] = useState([]);
    const [loadingRates, setLoadingRates] = useState(true);
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [budget, setBudget] = useState({ incomeGoal: 0, expenseBudget: 0 });
    const [operations, setOperations] = useState([]);

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
        }
    }, [userData]);
    
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
    
    return (
         <div className="space-y-8 p-6 animate-fade-in">
             <header>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Centro Financiero</h2>
                <p className="text-gray-50 mt-1">Monitorea tus metas y el mercado en tiempo real.</p>
             </header>
             
             {/* SECCIÓN PRESUPUESTO */}
             <section className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                 <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 relative overflow-hidden group hover:shadow-md transition-all">
                     <div className="flex justify-between items-center mb-8 relative z-10">
                         <h3 className="text-xl font-bold text-gray-800 flex items-center">
                             <Icon name="Target" className="w-6 h-6 mr-3 text-blue-500"/> 
                             Metas Mensuales
                         </h3>
                         {!isEditingBudget && (
                             <button onClick={() => setIsEditingBudget(true)} className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-colors">
                                 <Icon name="Edit2" className="w-4 h-4"/> Editar
                             </button>
                         )}
                     </div>
                     
                    {isEditingBudget ? (
                        <div className="space-y-6 relative z-10 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Meta de Ingresos</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-blue-500 font-bold">$</span>
                                        <input type="number" value={budget.incomeGoal} onChange={e => setBudget({...budget, incomeGoal: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border-transparent focus:ring-2 focus:ring-blue-100 rounded-xl transition-all font-bold text-gray-700 outline-none shadow-sm"/>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Límite de Gastos</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-red-500 font-bold">$</span>
                                        <input type="number" value={budget.expenseBudget} onChange={e => setBudget({...budget, expenseBudget: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border-transparent focus:ring-2 focus:ring-red-100 rounded-xl transition-all font-bold text-gray-700 outline-none shadow-sm"/>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setIsEditingBudget(false)} className="py-2.5 px-5 bg-white text-gray-500 rounded-xl hover:bg-gray-100 font-bold transition-colors border border-gray-100">Cancelar</button>
                                <button onClick={handleSaveBudget} className="py-2.5 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 font-bold transition-all">Guardar Metas</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-10 relative z-10">
                            {/* Barra Ingresos */}
                            <div className="space-y-3">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Ingresos Actuales</p>
                                        <p className="text-3xl font-black text-gray-800">{formatCurrency(monthlyMetrics.income)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-400">Objetivo: {formatCurrency(budget.incomeGoal)}</p>
                                        <p className="text-sm font-black text-green-500">{incomePct.toFixed(0)}%</p>
                                    </div>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
                                    <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${incomePct}%` }}></div>
                                </div>
                            </div>

                            {/* Barra Gastos */}
                             <div className="space-y-3">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Gastos Actuales</p>
                                        <p className="text-3xl font-black text-gray-800">{formatCurrency(monthlyMetrics.expense)}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-400">Presupuesto: {formatCurrency(budget.expenseBudget)}</p>
                                        <p className={`text-sm font-black ${expensePct > 90 ? 'text-red-500 animate-pulse' : 'text-orange-500'}`}>{expensePct.toFixed(0)}%</p>
                                    </div>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden shadow-inner">
                                    <div className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r ${expensePct > 90 ? 'from-red-500 to-rose-600' : expensePct > 75 ? 'from-orange-400 to-amber-500' : 'from-blue-400 to-indigo-400'}`} style={{ width: `${expensePct}%` }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>

                 <FixedDepositCalculator />
             </section>

             {/* SECCIÓN COTIZACIONES */}
             <section className="space-y-6">
                 <h3 className="text-xl font-bold text-gray-800 flex items-center">
                     <Icon name="TrendingUp" className="w-6 h-6 mr-3 text-green-500"/> 
                     Mercado de Divisas
                 </h3>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                     {loadingRates ? (
                         [1,2,3,4].map(i => <div key={i} className="h-40 bg-white rounded-3xl animate-pulse border border-gray-100"></div>)
                     ) : dollarRates.length > 0 ? dollarRates.map(rate => (
                         <div key={rate.casa} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group cursor-default">
                             <div className="flex items-center justify-between mb-6">
                                 <h4 className="font-bold text-lg text-gray-800 capitalize">{rate.nombre}</h4>
                                 <span className="text-[10px] font-black bg-gray-800 text-white px-2.5 py-1 rounded-full uppercase">ARS</span>
                             </div>
                             <div className="flex justify-between items-end">
                                 <div>
                                     <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Compra</p>
                                     <p className="text-xl font-bold text-gray-500">{formatCurrency(rate.compra)}</p>
                                 </div>
                                 <div className="text-right">
                                     <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-1">Venta</p>
                                     <p className="text-2xl font-black text-green-600 group-hover:scale-105 transition-transform origin-right">{formatCurrency(rate.venta)}</p>
                                 </div>
                             </div>
                         </div>
                     )) : <p className="text-gray-500 text-center col-span-full py-10">Cotizaciones no disponibles en este momento.</p>}
                 </div>
             </section>
         </div>
    );
};

export default FinancesPage;
