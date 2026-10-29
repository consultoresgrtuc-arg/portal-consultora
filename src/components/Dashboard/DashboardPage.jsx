import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';
import DateFilter from '../Common/DateFilter';
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

const DashboardPage = ({ navigate, setClientCenterFolder }) => {
    const [selectedDate, setSelectedDate] = useState(() => new Date());
    const [operations, setOperations] = useState([]);
    const [prevOperations, setPrevOperations] = useState([]);
    const { user } = useAuth();
    const { targetUserId, activeEntity, isViewingClient } = useClientSelection();
    const [activeTab, setActiveTab] = useState('line'); // 'line' o 'doughnut'
    
    useEffect(() => {
        const effectiveId = targetUserId || user?.uid;
        if (!effectiveId) return;

        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth() + 1;

        const prevDate = new Date(year, selectedDate.getMonth() - 1, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = prevDate.getMonth() + 1;

        const qCurrent = query(
            collection(db, 'users', effectiveId, 'operations'),
            where("year", "==", year),
            where("month", "==", month)
        );

        const qPrev = query(
            collection(db, 'users', effectiveId, 'operations'),
            where("year", "==", prevYear),
            where("month", "==", prevMonth)
        );

        const unsubCurrent = onSnapshot(qCurrent, (snapshot) => {
            setOperations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Error al obtener operaciones para dashboard:", error);
            setOperations([]);
        });

        const unsubPrev = onSnapshot(qPrev, (snapshot) => {
            setPrevOperations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, () => {
            setPrevOperations([]);
        });

        return () => {
            unsubCurrent();
            unsubPrev();
        };
    }, [targetUserId, user, selectedDate]);

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);

    const metrics = useMemo(() => {
        let ventas = 0, compras = 0, ingresos = 0, gastos = 0;
        let countVentas = 0, countCompras = 0, countIngresos = 0, countGastos = 0;

        operations.forEach(op => {
            const amt = Number(op.amount) || 0;
            switch (op.type) {
                case 'venta': ventas += amt; countVentas++; break;
                case 'compra': compras += amt; countCompras++; break;
                case 'ingreso': ingresos += amt; countIngresos++; break;
                case 'gasto': gastos += amt; countGastos++; break;
            }
        });

        let prevVentas = 0, prevCompras = 0, prevIngresos = 0, prevGastos = 0;
        prevOperations.forEach(op => {
            const amt = Number(op.amount) || 0;
            switch (op.type) {
                case 'venta': prevVentas += amt; break;
                case 'compra': prevCompras += amt; break;
                case 'ingreso': prevIngresos += amt; break;
                case 'gasto': prevGastos += amt; break;
            }
        });

        const calcDelta = (curr, prev) => {
            if (prev <= 0) return null;
            return ((curr - prev) / prev) * 100;
        };

        const totalIncome = ventas + ingresos;
        const totalExpense = compras + gastos;
        const cashFlow = totalIncome - totalExpense;
        const prevCashFlow = (prevVentas + prevIngresos) - (prevCompras + prevGastos);
        
        // --- CÁLCULOS FINANCIEROS PRECISOS ---
        const profitability = totalIncome > 0 ? (cashFlow / totalIncome) * 100 : 0;
        // Incidencia de gastos generales sobre el total de ingresos operativos (ventas + otros ingresos)
        const expenseToIncomeRatio = totalIncome > 0 ? (gastos / totalIncome) * 100 : 0;
        const purchasesToSalesRatio = ventas > 0 ? (compras / ventas) * 100 : (totalIncome > 0 ? (compras / totalIncome) * 100 : 0);

        return { 
            ventas, compras, ingresos, gastos, 
            countVentas, countCompras, countIngresos, countGastos,
            deltaVentas: calcDelta(ventas, prevVentas),
            deltaCompras: calcDelta(compras, prevCompras),
            deltaIngresos: calcDelta(ingresos, prevIngresos),
            deltaGastos: calcDelta(gastos, prevGastos),
            totalIncome, totalExpense, cashFlow, prevCashFlow,
            profitability, expenseToIncomeRatio, purchasesToSalesRatio,
            totalCount: operations.length
        };
    }, [operations, prevOperations]);

    // Últimas 5 operaciones ordenadas por fecha de emisión descendente
    const recentOperations = useMemo(() => {
        return [...operations]
            .sort((a, b) => {
                const dateA = a.fechaEmision?.toDate ? a.fechaEmision.toDate().getTime() : 0;
                const dateB = b.fechaEmision?.toDate ? b.fechaEmision.toDate().getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, 5);
    }, [operations]);

    // --- CÁLCULO DE PUNTOS DIARIOS PARA EL GRÁFICO DE TENDENCIA ---
    const dailyTrendData = useMemo(() => {
        const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
        const dailyIncome = Array(daysInMonth).fill(0);
        const dailyExpense = Array(daysInMonth).fill(0);

        operations.forEach(op => {
            if (op.fechaEmision?.toDate) {
                const date = op.fechaEmision.toDate();
                const day = date.getDate();
                if (day >= 1 && day <= daysInMonth) {
                    if (['venta', 'ingreso'].includes(op.type)) {
                        dailyIncome[day - 1] += Number(op.amount) || 0;
                    } else if (['compra', 'gasto'].includes(op.type)) {
                        dailyExpense[day - 1] += Number(op.amount) || 0;
                    }
                }
            }
        });

        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        return { labels, dailyIncome, dailyExpense };
    }, [operations, selectedDate]);

    // --- CONFIGURACIÓN DE GRÁFICOS ---
    const lineChartData = {
        labels: dailyTrendData.labels,
        datasets: [
            {
                label: 'Ingresos (ARS)',
                data: dailyTrendData.dailyIncome,
                borderColor: '#10b981', // emerald-500
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
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
                backgroundColor: 'rgba(239, 68, 68, 0.06)',
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
                position: 'bottom',
                labels: {
                    color: '#64748b',
                    font: { family: 'Inter', size: 11, weight: '600' },
                    boxWidth: 12,
                    padding: 16
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

    const quickActions = [
        { label: 'Cargar Operación', desc: 'Ventas, compras o gastos', icon: 'PlusCircle', route: 'operations', color: 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20' },
        { label: 'Flujo y Finanzas', desc: 'Proyección y simuladores', icon: 'TrendingUp', route: 'finances', color: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200' },
        { label: 'Microcréditos', desc: 'Cronograma y cobranzas', icon: 'DollarSign', route: 'microcredits', color: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200' },
        { label: 'Cartera de Cheques', desc: 'Valores al cobro y pagos', icon: 'CreditCard', route: 'gestion/cheques', color: 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200' },
    ];

    const categoryCards = [
        { title: 'Ventas', val: metrics.ventas, count: metrics.countVentas, delta: metrics.deltaVentas, col: 'text-emerald-600', iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: 'TrendingUp', positiveIsGood: true },
        { title: 'Compras', val: metrics.compras, count: metrics.countCompras, delta: metrics.deltaCompras, col: 'text-red-600', iconBg: 'bg-red-50 text-red-600 border-red-100', icon: 'TrendingDown', positiveIsGood: false },
        { title: 'Otros Ingresos', val: metrics.ingresos, count: metrics.countIngresos, delta: metrics.deltaIngresos, col: 'text-cyan-600', iconBg: 'bg-cyan-50 text-cyan-600 border-cyan-100', icon: 'DollarSign', positiveIsGood: true },
        { title: 'Otros Gastos', val: metrics.gastos, count: metrics.countGastos, delta: metrics.deltaGastos, col: 'text-orange-600', iconBg: 'bg-orange-50 text-orange-600 border-orange-100', icon: 'Wallet', positiveIsGood: false },
    ];

    return (
        <div className="space-y-6 sm:space-y-8 bg-gray-50/50 min-h-screen pb-12">
            {/* --- ENCABEZADO CON FILTRO DE PERÍODO --- */}
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                            Resumen Operativo
                        </h2>
                        {isViewingClient ? (
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                {activeEntity?.name || activeEntity?.displayName}
                            </span>
                        ) : (
                            <span className="px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-xs font-black uppercase tracking-wider">
                                Mi Estudio Propio
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                        {isViewingClient 
                            ? `Métricas financieras e impositivas del cliente ${activeEntity?.name || activeEntity?.displayName} (CUIT: ${activeEntity?.cuit || 'S/D'}).`
                            : 'Control de honorarios, gastos operativos y métricas de rentabilidad de tu firma contable.'
                        }
                    </p>
                </div>

                <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-3">
                    <DateFilter selectedDate={selectedDate} onDateChange={setSelectedDate} />
                </div>
            </header>

            {/* --- BARRA DE ACCESOS RÁPIDOS (QUICK ACTIONS) --- */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                {quickActions.map((act, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => navigate && navigate(act.route)}
                        className={`flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-2xl shadow-sm transition-all duration-200 text-left cursor-pointer active:scale-[0.98] ${act.color}`}
                    >
                        <div className={`p-2 sm:p-2.5 rounded-xl shrink-0 ${idx === 0 ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                            <Icon name={act.icon} className="w-4 h-4 sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-extrabold leading-tight">{act.label}</p>
                            <p className={`text-[10px] sm:text-[11px] truncate mt-0.5 ${idx === 0 ? 'text-blue-100' : 'text-slate-400'}`}>{act.desc}</p>
                        </div>
                    </button>
                ))}
            </div>

            {/* --- SECCIÓN 1: TOTALES POR CATEGORÍA --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                {categoryCards.map((card, i) => (
                    <div key={i} className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md hover:scale-[1.01] transition-all duration-300 relative overflow-hidden group">
                        <div className={`absolute right-4 top-4 p-2.5 rounded-2xl border transition-all duration-300 ${card.iconBg}`}>
                            <Icon name={card.icon} className="w-5 h-5"/>
                        </div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{card.title}</h3>
                        <p className={`text-xl sm:text-2xl font-black ${card.col} tracking-tight`}>{formatCurrency(card.val)}</p>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-slate-400">
                                {card.count} {card.count === 1 ? 'operación' : 'operaciones'}
                            </span>
                            {card.delta !== null ? (
                                <span className={`px-2 py-0.5 rounded-full font-bold ${
                                    (card.delta >= 0 && card.positiveIsGood) || (card.delta <= 0 && !card.positiveIsGood)
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-amber-50 text-amber-700'
                                }`}>
                                    {card.delta >= 0 ? `+${card.delta.toFixed(0)}%` : `${card.delta.toFixed(0)}%`} vs. ant.
                                </span>
                            ) : (
                                <span className="text-slate-400 italic">Período actual</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* --- SECCIÓN 2: GRÁFICOS Y COCKPIT DE DESEMPEÑO --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Panel de Gráficos (Col-span 2) */}
                <div className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">Evolución del Período</h3>
                            <p className="text-slate-400 text-xs font-medium">
                                Movimiento diario acumulado ({metrics.totalCount} {metrics.totalCount === 1 ? 'registro' : 'registros'} en el mes).
                            </p>
                        </div>
                        
                        {/* Selector de tipo de gráfico */}
                        <div className="flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/50 self-stretch sm:self-auto">
                            <button 
                                onClick={() => setActiveTab('line')}
                                className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'line' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Tendencia Diaria
                            </button>
                            <button 
                                onClick={() => setActiveTab('doughnut')}
                                className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${activeTab === 'doughnut' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'}`}
                            >
                                Distribución
                            </button>
                        </div>
                    </div>

                    {/* Contenedor del Gráfico */}
                    <div className="h-[260px] sm:h-[290px] w-full relative">
                        {activeTab === 'line' ? (
                            <Line data={lineChartData} options={lineChartOptions} />
                        ) : (
                            <Doughnut data={doughnutChartData} options={doughnutChartOptions} />
                        )}
                    </div>
                </div>

                {/* Cockpit de Resultados Financieros */}
                <div className="bg-gradient-to-br from-slate-900 to-indigo-950 p-6 sm:p-8 rounded-[32px] shadow-xl text-white flex flex-col justify-between relative overflow-hidden group">
                    {/* Glowing effect inside dark card */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none group-hover:bg-blue-500/20 transition-all duration-700"></div>

                    <div className="space-y-5">
                        <div>
                            <div className="flex items-center justify-between">
                                <span className="px-3 py-1 bg-white/10 text-blue-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/5">
                                    Flujo Neto
                                </span>
                                <span className="text-[11px] text-slate-400 font-semibold">
                                    {metrics.totalCount} ops.
                                </span>
                            </div>
                            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-4">Resultado Operativo Mensual</h3>
                            <p className={`text-2xl sm:text-3xl font-black tracking-tight mt-1 ${metrics.cashFlow > 0 ? 'text-white' : metrics.cashFlow < 0 ? 'text-red-300' : 'text-slate-200'}`}>
                                {formatCurrency(metrics.cashFlow)}
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-xs">
                            <div>
                                <p className="text-slate-400 text-[10px] uppercase font-bold">Total Ingresos</p>
                                <p className="text-emerald-400 font-extrabold mt-0.5">{formatCurrency(metrics.totalIncome)}</p>
                            </div>
                            <div>
                                <p className="text-slate-400 text-[10px] uppercase font-bold">Total Egresos</p>
                                <p className="text-red-400 font-extrabold mt-0.5">{formatCurrency(metrics.totalExpense)}</p>
                            </div>
                        </div>

                        <div className="h-[1px] bg-white/10"></div>

                        <div>
                            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest">Rentabilidad Neta</h3>
                            <p className={`text-3xl sm:text-4xl font-black mt-1 ${metrics.profitability > 0 ? 'text-emerald-400' : metrics.profitability < 0 ? 'text-red-400' : 'text-slate-300'}`}>
                                {metrics.profitability.toFixed(1)}%
                            </p>
                            <p className="text-white/40 text-xs mt-1 font-medium italic">Margen neto sobre ingresos totales</p>
                        </div>
                    </div>

                    <div className="flex items-center mt-6 text-white/80 font-semibold text-xs gap-3">
                        <div className={`p-2.5 rounded-2xl ${
                            metrics.cashFlow > 0 
                                ? 'bg-emerald-500/20 text-emerald-300' 
                                : metrics.cashFlow < 0 
                                    ? 'bg-red-500/20 text-red-300' 
                                    : 'bg-slate-500/20 text-slate-300'
                        }`}>
                            <Icon name={metrics.cashFlow >= 0 ? 'ArrowUpRight' : 'ArrowDownRight'} className="w-5 h-5"/>
                        </div>
                        <span>
                            {metrics.cashFlow > 0 
                                ? 'Superávit operativo en el período' 
                                : metrics.cashFlow < 0 
                                    ? 'Déficit de caja en el período' 
                                    : 'Sin saldo neto en el período'}
                        </span>
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN 3: COMPARATIVAS DE EFICIENCIA Y ÚLTIMOS MOVIMIENTOS --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                {/* Columna Izquierda: 2 tarjetas de Eficiencia */}
                <div className="lg:col-span-1 flex flex-col gap-6 justify-between">
                    {/* Eficiencia Estructural */}
                    <div className="bg-white p-6 sm:p-7 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden flex-1 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Eficiencia Estructural</h3>
                                    <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Gastos vs. Ingresos Totales</h4>
                                </div>
                                <p className="text-2xl font-black text-purple-600">{metrics.expenseToIncomeRatio.toFixed(1)}%</p>
                            </div>
                            <p className="text-slate-400 text-xs font-medium mb-5">Incidencia de gastos operativos sobre la facturación total del período.</p>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(metrics.expenseToIncomeRatio, 100)}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Eficiencia Comercial */}
                    <div className="bg-white p-6 sm:p-7 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden flex-1 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">Eficiencia Comercial</h3>
                                    <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Compras vs. Ventas</h4>
                                </div>
                                <p className="text-2xl font-black text-orange-600">{metrics.purchasesToSalesRatio.toFixed(1)}%</p>
                            </div>
                            <p className="text-slate-400 text-xs font-medium mb-5">Proporción de compras e insumos sobre el volumen de ventas.</p>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                            <div 
                                className="bg-gradient-to-r from-orange-500 to-pink-500 h-full rounded-full transition-all duration-1000"
                                style={{ width: `${Math.min(metrics.purchasesToSalesRatio, 100)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                {/* Columna Derecha (Col-span 2): Últimos Movimientos del Período */}
                <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Últimos Movimientos del Período</h3>
                                <p className="text-slate-400 text-xs font-medium">Operaciones más recientes registradas en el mes seleccionado.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => navigate && navigate('operations')}
                                className="text-xs font-extrabold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                            >
                                <span>Ver todas las operaciones</span>
                                <Icon name="ArrowUpRight" className="w-4 h-4" />
                            </button>
                        </div>

                        {recentOperations.length > 0 ? (
                            <div className="divide-y divide-slate-100">
                                {recentOperations.map((op, index) => {
                                    const isPositive = ['venta', 'ingreso'].includes(op.type);
                                    const dateStr = op.fechaEmision?.toDate
                                        ? op.fechaEmision.toDate().toLocaleDateString('es-AR')
                                        : 'Sin fecha';
                                    const badgeStyles = {
                                        venta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                                        ingreso: 'bg-cyan-50 text-cyan-700 border-cyan-200',
                                        compra: 'bg-red-50 text-red-700 border-red-200',
                                        gasto: 'bg-orange-50 text-orange-700 border-orange-200'
                                    }[op.type] || 'bg-slate-100 text-slate-700 border-slate-200';

                                    return (
                                        <div key={op.id || index} className="py-3.5 flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border shrink-0 ${badgeStyles}`}>
                                                    {op.type}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                                                        {op.description || 'Operación registrada'}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 font-medium">
                                                        {dateStr} {op.cuit ? `• CUIT: ${op.cuit}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-xs sm:text-sm font-black shrink-0 ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {isPositive ? '+' : '-'}{formatCurrency(op.amount)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="py-12 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                                <Icon name="FileText" className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-bold text-slate-600">Sin operaciones en este período</p>
                                <p className="text-xs text-slate-400 mt-1 mb-4">Puedes cambiar el mes arriba o registrar un nuevo movimiento.</p>
                                <button
                                    type="button"
                                    onClick={() => navigate && navigate('operations')}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                                >
                                    + Registrar Primera Operación
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- SECCIÓN 4: ASISTENTE IA Y NOTIFICACIONES --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 items-stretch">
                <div className="lg:col-span-2 flex">
                    <AIAnalyzer />
                </div>
                <div className="flex">
                    <NotificationPanel navigate={navigate} setClientCenterFolder={setClientCenterFolder} />
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;

