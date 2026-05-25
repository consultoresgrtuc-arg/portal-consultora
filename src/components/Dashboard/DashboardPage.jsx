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

// --- IMPORTACIÓN E REGISTRO DE CHART.JS ---
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  ChartTitle,
  ChartTooltip,
  Legend,
  Filler
);

const DashboardPage = () => {
    const [operations, setOperations] = useState([]);
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState('line'); // 'line' o 'doughnut'
    
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

    // --- CÁLCULO DE PUNTOS DIARIOS PARA EL GRÁFICO DE TENDENCIA ---
    const dailyTrendData = useMemo(() => {
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const dailyIncome = Array(daysInMonth).fill(0);
        const dailyExpense = Array(daysInMonth).fill(0);

        operations.forEach(op => {
            if (op.fechaEmision?.toDate) {
                const date = op.fechaEmision.toDate();
                const day = date.getDate();
                if (day >= 1 && day <= daysInMonth) {
                    if (['venta', 'ingreso'].includes(op.type)) {
                        dailyIncome[day - 1] += op.amount;
                    } else if (['compra', 'gasto'].includes(op.type)) {
                        dailyExpense[day - 1] += op.amount;
                    }
                }
            }
        });

        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        return { labels, dailyIncome, dailyExpense };
    }, [operations]);

    // --- CONFIGURACIÓN DE GRÁFICOS ---
    const lineChartData = {
        labels: dailyTrendData.labels,
        datasets: [
            {
                label: 'Ingresos (ARS)',
                data: dailyTrendData.dailyIncome,
                borderColor: '#10b981', // emerald-500
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: 2,
                pointHoverRadius: 6,
            },
            {
                label: 'Egresos (ARS)',
                data: dailyTrendData.dailyExpense,
                borderColor: '#ef4444', // red-500
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: 2,
                pointHoverRadius: 6,
            }
        ]
    };

    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 12, weight: '500' }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: 'Inter', size: 13, weight: '700' },
                bodyFont: { family: 'Inter', size: 12 }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
            },
            y: {
                grid: { color: '#f1f5f9' },
                ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
            }
        }
    };

    const doughnutChartData = {
        labels: ['Ventas', 'Compras', 'Otros Ingresos', 'Otros Gastos'],
        datasets: [
            {
                data: [metrics.ventas, metrics.compras, metrics.ingresos, metrics.gastos],
                backgroundColor: [
                    '#10b981', // emerald-500
                    '#ef4444', // red-500
                    '#06b6d4', // cyan-500
                    '#f97316'  // orange-500
                ],
                borderWidth: 0,
                hoverOffset: 6
            }
        ]
    };

    const doughnutChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 12, weight: '500' },
                    boxWidth: 12,
                    padding: 20
                }
            },
            tooltip: {
                padding: 12,
                cornerRadius: 8,
                bodyFont: { family: 'Inter', size: 12 }
            }
        },
        cutout: '70%'
    };

    return (
        <div className="space-y-8 bg-gray-50/50 min-h-screen pb-12">
            <header className="flex flex-col gap-1.5">
                <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                    Resumen Operativo
                </h2>
                <p className="text-slate-500 font-medium">Análisis financiero inteligente del período en curso.</p>
            </header>

            {/* --- SECCIÓN 1: TOTALES POR CATEGORÍA --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { title: 'Ventas', val: metrics.ventas, col: 'text-emerald-600', bg: 'from-emerald-50 to-emerald-100/30', border: 'border-emerald-100', icon: 'TrendingUp' },
                    { title: 'Compras', val: metrics.compras, col: 'text-red-600', bg: 'from-red-50 to-red-100/30', border: 'border-red-100', icon: 'TrendingDown' },
                    { title: 'Otros Ingresos', val: metrics.ingresos, col: 'text-cyan-600', bg: 'from-cyan-50 to-cyan-100/30', border: 'border-cyan-100', icon: 'DollarSign' },
                    { title: 'Otros Gastos', val: metrics.gastos, col: 'text-orange-600', bg: 'from-orange-50 to-orange-100/30', border: 'border-orange-100', icon: 'Wallet' },
                ].map((card, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md hover:scale-[1.01] transition-all duration-300 relative overflow-hidden group">
                        <div className="absolute right-4 top-4 bg-slate-50 p-2.5 rounded-2xl border border-slate-100 text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-100 transition-all duration-300">
                            <Icon name={card.icon} className="w-5 h-5"/>
                        </div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{card.title}</h3>
                        <p className={`text-2xl font-black ${card.col} tracking-tight`}>{formatCurrency(card.val)}</p>
                    </div>
                ))}
            </div>
            
            {/* --- SECCIÓN 2: GRÁFICOS Y COCKPIT DE DESEMPEÑO --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Panel de Gráficos (Col-span 2) */}
                <div className="lg:col-span-2 bg-white p-6 md:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">Evolución del Período</h3>
                            <p className="text-slate-400 text-xs font-medium">Movimiento acumulado de fondos en el mes.</p>
                        </div>
                        
                        {/* Selector de tipo de gráfico */}
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50">
                            <button 
                                onClick={() => setActiveTab('line')}
                                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'line' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Tendencia Diaria
                            </button>
                            <button 
                                onClick={() => setActiveTab('doughnut')}
                                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'doughnut' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Distribución
                            </button>
                        </div>
                    </div>

                    {/* Contenedor del Gráfico */}
                    <div className="h-[280px] w-full relative">
                        {activeTab === 'line' ? (
                            <Line data={lineChartData} options={lineChartOptions} />
                        ) : (
                            <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                        )}
                    </div>
                </div>

                {/* Cockpit de Resultados Financieros */}
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-8 rounded-[32px] shadow-xl text-white flex flex-col justify-between relative overflow-hidden group">
                    {/* Glowing effect inside dark card */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700"></div>

                    <div className="space-y-6">
                        <div>
                            <span className="px-3 py-1 bg-white/10 text-blue-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/5">
                                Flujo Neto
                            </span>
                            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-4">Flujo de Caja Mensual</h3>
                            <p className="text-3xl font-black tracking-tight mt-1">
                                {formatCurrency(metrics.cashFlow)}
                            </p>
                        </div>

                        <div className="h-[1px] bg-white/10"></div>

                        <div>
                            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rentabilidad Neta</h3>
                            <p className={`text-4xl font-black mt-1 ${metrics.profitability >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {metrics.profitability.toFixed(1)}%
                            </p>
                            <p className="text-white/40 text-xs mt-1.5 font-medium italic">Margen acumulado de ingresos</p>
                        </div>
                    </div>

                    <div className="flex items-center mt-8 text-white/70 font-semibold text-xs gap-3">
                        <div className={`p-2.5 rounded-2xl ${metrics.cashFlow >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                            <Icon name={metrics.cashFlow >= 0 ? 'ArrowUpRight' : 'ArrowDownRight'} className="w-5 h-5"/>
                        </div>
                        <span>Caja neta positiva del período</span>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN 3: COMPARATIVAS DE EFICIENCIA --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Eficiencia Estructural */}
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Eficiencia Estructural</h3>
                                <h4 className="text-lg font-black text-slate-800 tracking-tight">Gastos vs. Ingresos</h4>
                            </div>
                            <p className="text-2xl font-black text-purple-600">{metrics.expenseToIncomeRatio.toFixed(1)}%</p>
                        </div>
                        <p className="text-slate-400 text-xs font-medium mb-6">Incidencia de gastos generales sobre facturación.</p>
                    </div>
                    {/* Barra de Progreso Estilizada */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                            className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${Math.min(metrics.expenseToIncomeRatio, 100)}%` }}
                        ></div>
                    </div>
                </div>

                {/* Eficiencia Comercial */}
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Eficiencia Comercial</h3>
                                <h4 className="text-lg font-black text-slate-800 tracking-tight">Compras vs. Ventas</h4>
                            </div>
                            <p className="text-2xl font-black text-orange-600">{metrics.purchasesToSalesRatio.toFixed(1)}%</p>
                        </div>
                        <p className="text-slate-400 text-xs font-medium mb-6">Costo de mercadería sobre volumen de ventas.</p>
                    </div>
                    {/* Barra de Progreso Estilizada */}
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div 
                            className="bg-gradient-to-r from-orange-500 to-pink-500 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${Math.min(metrics.purchasesToSalesRatio, 100)}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN 4: ASISTENTE IA Y NOTIFICACIONES --- */}
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

