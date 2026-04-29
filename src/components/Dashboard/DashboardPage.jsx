import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import AIAnalyzer from './AIAnalyzer';
import NotificationPanel from './NotificationPanel';

const DashboardPage = () => {
    const [operations, setOperations] = useState([]);
    const { user } = useAuth();
    
    useEffect(() => {
        if (!user) return;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;

        const q = query(
            collection(db, 'users', user.uid, 'operations'),
            where("year", "==", year),
            where("month", "==", month)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOperations(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribe();
    }, [user]);

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    const metrics = useMemo(() => {
        let ventas = 0, compras = 0, ingresos = 0, gastos = 0;
        operations.forEach(op => {
            switch (op.type) {
                case 'venta': ventas += op.amount; break;
                case 'compra': compras += op.amount; break;
                case 'ingreso': ingresos += op.amount; break;
                case 'gasto': gastos += op.amount; break;
            }
        });

        const totalIncome = ventas + ingresos;
        const totalExpense = compras + gastos;
        const cashFlow = totalIncome - totalExpense;
        
        // --- CÁLCULOS FINANCIEROS PRECISOS ---
        const profitability = totalIncome > 0 ? (cashFlow / totalIncome) * 100 : 0;
        const expenseToIncomeRatio = ingresos > 0 ? (gastos / ingresos) * 100 : 0;
        const purchasesToSalesRatio = ventas > 0 ? (compras / ventas) * 100 : 0;

        return { ventas, compras, ingresos, gastos, totalIncome, totalExpense, cashFlow, profitability, expenseToIncomeRatio, purchasesToSalesRatio };
    }, [operations]);

    return (
        <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
            <header>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Resumen Operativo</h2>
                <p className="text-gray-500 mt-1">Análisis financiero del período en curso.</p>
            </header>

            {/* --- SECCIÓN 1: TOTALES POR CATEGORÍA --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ventas</h3>
                    <p className="text-3xl font-bold text-green-600">{formatCurrency(metrics.ventas)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Compras</h3>
                    <p className="text-3xl font-bold text-red-600">{formatCurrency(metrics.compras)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Otros Ingresos</h3>
                    <p className="text-3xl font-bold text-emerald-500">{formatCurrency(metrics.ingresos)}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Otros Gastos</h3>
                    <p className="text-3xl font-bold text-orange-600">{formatCurrency(metrics.gastos)}</p>
                </div>
            </div>
            
            {/* --- SECCIÓN 2: INDICADORES PRINCIPALES --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Flujo de Caja */}
                <div className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-between min-h-[180px]">
                    <div>
                        <h3 className="text-lg font-bold text-gray-700 mb-1">Flujo de Caja Mensual</h3>
                        <p className={`text-4xl font-black ${metrics.cashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(metrics.cashFlow)}
                        </p>
                    </div>
                    <div className="flex items-center mt-6 text-gray-500 font-medium text-sm">
                        <div className={`p-2 rounded-full mr-3 ${metrics.cashFlow >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                            {metrics.cashFlow >= 0 ? <Icon name="ArrowUpRight" className="w-5 h-5 text-green-600"/> : <Icon name="ArrowDownRight" className="w-5 h-5 text-red-600"/>}
                        </div>
                        Resultado neto (Ingresos - Egresos)
                    </div>
                </div>

                {/* Rentabilidad Neta */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col justify-center text-center">
                    <h3 className="text-lg font-bold text-gray-700 mb-2">Rentabilidad Neta</h3>
                    <p className={`text-4xl font-black ${metrics.profitability >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {metrics.profitability.toFixed(1)}%
                    </p>
                    <p className="text-gray-400 mt-2 text-sm font-medium italic">Margen sobre ingresos totales</p>
                </div>
            </div>

            {/* --- SECCIÓN 3: COMPARATIVAS DE EFICIENCIA --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Eficiencia Estructural */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border-l-8 border-l-purple-500 border-gray-100 relative overflow-hidden">
                    <h3 className="text-gray-500 font-bold text-xs uppercase mb-1">Eficiencia Estructural</h3>
                    <h4 className="text-xl font-bold text-gray-800 mb-4">Gastos vs. Ingresos</h4>
                    <p className="text-4xl font-black text-purple-600">{metrics.expenseToIncomeRatio.toFixed(1)}%</p>
                    <p className="text-gray-400 mt-2 text-sm">Incidencia de gastos sobre ingresos extra</p>
                </div>

                {/* Eficiencia Comercial */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border-l-8 border-l-orange-500 border-gray-100 relative overflow-hidden">
                    <h3 className="text-gray-500 font-bold text-xs uppercase mb-1">Eficiencia Comercial</h3>
                    <h4 className="text-xl font-bold text-gray-800 mb-4">Compras vs. Ventas</h4>
                    <p className="text-4xl font-black text-orange-500">{metrics.purchasesToSalesRatio.toFixed(1)}%</p>
                    <p className="text-gray-400 mt-2 text-sm">Costo sobre volumen de ventas totales</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                    <AIAnalyzer />
                </div>
                <div>
                    <NotificationPanel />
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
