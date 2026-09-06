import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useYearlyCollection } from '../../hooks/useCollections';
import Icon from '../Common/Icon';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ReportsPage = () => {
    const { userData } = useAuth();
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [periodFilter, setPeriodFilter] = useState('anual'); // 'anual', 'q1', 'q2', 'q3', 'q4', 's1', 's2'
    const [chartMode, setChartMode] = useState('bars'); // 'bars', 'trend', 'distribution'
    const [compareWithPrevious, setCompareWithPrevious] = useState(false);
    const [selectedMonthDetail, setSelectedMonthDetail] = useState(null);

    // Carga de operaciones del año seleccionado y año anterior (para comparativa)
    const { data: operations, loading } = useYearlyCollection('operations', selectedYear);
    const { data: prevOperations, loading: prevLoading } = useYearlyCollection('operations', compareWithPrevious ? selectedYear - 1 : null);

    const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const monthShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    // Determinar qué meses están incluidos según el filtro de periodo
    const activeMonthsIndices = useMemo(() => {
        switch (periodFilter) {
            case 'q1': return [0, 1, 2];
            case 'q2': return [3, 4, 5];
            case 'q3': return [6, 7, 8];
            case 'q4': return [9, 10, 11];
            case 's1': return [0, 1, 2, 3, 4, 5];
            case 's2': return [6, 7, 8, 9, 10, 11];
            default: return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        }
    }, [periodFilter]);

    // Desglose de 12 meses para el año seleccionado
    const monthlyBreakdown = useMemo(() => {
        const months = Array.from({ length: 12 }, () => ({
            ventas: 0,
            compras: 0,
            otrosIngresos: 0,
            otrosGastos: 0,
            count: 0,
            ops: []
        }));

        operations.forEach(op => {
            const monthIndex = op.month - 1;
            if (monthIndex >= 0 && monthIndex < 12) {
                months[monthIndex].count += 1;
                months[monthIndex].ops.push(op);
                switch (op.type) {
                    case 'venta': months[monthIndex].ventas += op.amount; break;
                    case 'compra': months[monthIndex].compras += op.amount; break;
                    case 'ingreso': months[monthIndex].otrosIngresos += op.amount; break;
                    case 'gasto': months[monthIndex].otrosGastos += op.amount; break;
                    default: break;
                }
            }
        });
        return months;
    }, [operations]);

    // Desglose del año anterior para comparativa
    const prevMonthlyBreakdown = useMemo(() => {
        if (!compareWithPrevious || !prevOperations) return null;
        const months = Array.from({ length: 12 }, () => ({
            ventas: 0,
            compras: 0,
            otrosIngresos: 0,
            otrosGastos: 0
        }));

        prevOperations.forEach(op => {
            const monthIndex = op.month - 1;
            if (monthIndex >= 0 && monthIndex < 12) {
                switch (op.type) {
                    case 'venta': months[monthIndex].ventas += op.amount; break;
                    case 'compra': months[monthIndex].compras += op.amount; break;
                    case 'ingreso': months[monthIndex].otrosIngresos += op.amount; break;
                    case 'gasto': months[monthIndex].otrosGastos += op.amount; break;
                    default: break;
                }
            }
        });
        return months;
    }, [compareWithPrevious, prevOperations]);

    // Métricas del periodo seleccionado
    const periodMetrics = useMemo(() => {
        let totalVentas = 0;
        let totalCompras = 0;
        let totalOtrosIngresos = 0;
        let totalOtrosGastos = 0;
        let totalOpsCount = 0;

        activeMonthsIndices.forEach(idx => {
            const m = monthlyBreakdown[idx];
            totalVentas += m.ventas;
            totalCompras += m.compras;
            totalOtrosIngresos += m.otrosIngresos;
            totalOtrosGastos += m.otrosGastos;
            totalOpsCount += m.count;
        });

        const totalEntradas = totalVentas + totalOtrosIngresos;
        const totalSalidas = totalCompras + totalOtrosGastos;
        const cashFlow = totalEntradas - totalSalidas;
        const profitability = totalEntradas > 0 ? (cashFlow / totalEntradas) * 100 : 0;
        const avgMonthlyIncome = activeMonthsIndices.length > 0 ? totalEntradas / activeMonthsIndices.length : 0;

        // Búsqueda de meses pico (dentro del periodo activo)
        let peakSalesMonth = null;
        let maxSales = -1;
        let peakExpenseMonth = null;
        let maxExpense = -1;

        activeMonthsIndices.forEach(idx => {
            const m = monthlyBreakdown[idx];
            const mIngresos = m.ventas + m.otrosIngresos;
            const mEgresos = m.compras + m.otrosGastos;
            if (mIngresos > maxSales && mIngresos > 0) {
                maxSales = mIngresos;
                peakSalesMonth = { name: monthNames[idx], amount: mIngresos };
            }
            if (mEgresos > maxExpense && mEgresos > 0) {
                maxExpense = mEgresos;
                peakExpenseMonth = { name: monthNames[idx], amount: mEgresos };
            }
        });

        // Comparativa de crecimiento con año anterior
        let prevEntradas = 0;
        let prevSalidas = 0;
        if (compareWithPrevious && prevMonthlyBreakdown) {
            activeMonthsIndices.forEach(idx => {
                const pm = prevMonthlyBreakdown[idx];
                prevEntradas += pm.ventas + pm.otrosIngresos;
                prevSalidas += pm.compras + pm.otrosGastos;
            });
        }

        const growthIngresos = prevEntradas > 0 ? ((totalEntradas - prevEntradas) / prevEntradas) * 100 : null;
        const growthEgresos = prevSalidas > 0 ? ((totalSalidas - prevSalidas) / prevSalidas) * 100 : null;

        return {
            totalVentas,
            totalCompras,
            totalOtrosIngresos,
            totalOtrosGastos,
            totalEntradas,
            totalSalidas,
            cashFlow,
            profitability,
            totalOpsCount,
            avgMonthlyIncome,
            peakSalesMonth,
            peakExpenseMonth,
            prevEntradas,
            prevSalidas,
            growthIngresos,
            growthEgresos
        };
    }, [activeMonthsIndices, monthlyBreakdown, compareWithPrevious, prevMonthlyBreakdown]);

    // Máximos mensuales para cálculo visual de barras de porcentaje
    const maxMonthlyValues = useMemo(() => {
        let maxIncome = 1;
        let maxExpense = 1;
        monthlyBreakdown.forEach(m => {
            const inc = m.ventas + m.otrosIngresos;
            const exp = m.compras + m.otrosGastos;
            if (inc > maxIncome) maxIncome = inc;
            if (exp > maxExpense) maxExpense = exp;
        });
        return { maxIncome, maxExpense };
    }, [monthlyBreakdown]);

    // Etiquetas y datos para gráficos filtrados
    const chartFilteredLabels = activeMonthsIndices.map(i => monthShort[i]);

    // 1. Datos Gráfico de Barras
    const barChartData = {
        labels: chartFilteredLabels,
        datasets: [
            {
                label: 'Ventas',
                data: activeMonthsIndices.map(i => monthlyBreakdown[i].ventas),
                backgroundColor: '#10b981',
                stack: 'Stack 0',
                borderRadius: 6,
            },
            {
                label: 'Otros Ingresos',
                data: activeMonthsIndices.map(i => monthlyBreakdown[i].otrosIngresos),
                backgroundColor: '#6ee7b7',
                stack: 'Stack 0',
                borderRadius: 6,
            },
            {
                label: 'Compras',
                data: activeMonthsIndices.map(i => monthlyBreakdown[i].compras),
                backgroundColor: '#ef4444',
                stack: 'Stack 1',
                borderRadius: 6,
            },
            {
                label: 'Otros Gastos',
                data: activeMonthsIndices.map(i => monthlyBreakdown[i].otrosGastos),
                backgroundColor: '#f87171',
                stack: 'Stack 1',
                borderRadius: 6,
            }
        ]
    };

    // 2. Datos Gráfico de Línea / Tendencia (Flujo Neto y Acumulado)
    let runningNet = 0;
    const accumulatedNet = activeMonthsIndices.map(i => {
        const m = monthlyBreakdown[i];
        const net = (m.ventas + m.otrosIngresos) - (m.compras + m.otrosGastos);
        runningNet += net;
        return runningNet;
    });

    const trendChartData = {
        labels: chartFilteredLabels,
        datasets: [
            {
                type: 'line',
                label: 'Saldo Acumulado',
                data: accumulatedNet,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointRadius: 5,
                pointBackgroundColor: '#2563eb',
            },
            {
                type: 'bar',
                label: 'Resultado Mensual',
                data: activeMonthsIndices.map(i => {
                    const m = monthlyBreakdown[i];
                    return (m.ventas + m.otrosIngresos) - (m.compras + m.otrosGastos);
                }),
                backgroundColor: activeMonthsIndices.map(i => {
                    const m = monthlyBreakdown[i];
                    const net = (m.ventas + m.otrosIngresos) - (m.compras + m.otrosGastos);
                    return net >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)';
                }),
                borderRadius: 6,
            }
        ]
    };

    // 3. Datos Gráficos de Dona (Distribución)
    const doughnutIngresosData = {
        labels: ['Ventas', 'Otros Ingresos'],
        datasets: [{
            data: [periodMetrics.totalVentas, periodMetrics.totalOtrosIngresos],
            backgroundColor: ['#10b981', '#34d399'],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };

    const doughnutEgresosData = {
        labels: ['Compras', 'Otros Gastos'],
        datasets: [{
            data: [periodMetrics.totalCompras, periodMetrics.totalOtrosGastos],
            backgroundColor: ['#ef4444', '#fb7185'],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };

    const baseChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 16,
                    font: { size: 11, weight: 'bold' }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                padding: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                titleColor: '#111827',
                bodyColor: '#374151',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null && context.parsed.y !== undefined) {
                            label += formatCurrency(context.parsed.y);
                        } else if (context.parsed !== null && context.parsed !== undefined) {
                            label += formatCurrency(context.parsed);
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: chartMode === 'bars',
                grid: { display: false },
                ticks: { font: { weight: 'bold' } }
            },
            y: {
                stacked: chartMode === 'bars',
                beginAtZero: true,
                grid: { color: '#f3f4f6' },
                ticks: {
                    callback: (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact' }).format(value),
                    font: { weight: 'bold' }
                }
            }
        }
    };

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 12,
                    font: { size: 11, weight: 'bold' }
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const val = context.raw || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                        return ` ${context.label}: ${formatCurrency(val)} (${pct}%)`;
                    }
                }
            }
        },
        cutout: '68%'
    };

    const handlePrint = () => window.print();

    const handleDownloadCSV = () => {
        let csvContent = "\uFEFF";
        const headers = ["Mes", "Ventas", "Otros Ingresos", "Total Ingresos", "Compras", "Otros Gastos", "Total Egresos", "Resultado Neto", "Rentabilidad %"];
        csvContent += headers.join(";") + "\n";

        activeMonthsIndices.forEach(index => {
            const monthData = monthlyBreakdown[index];
            const totalIngresos = monthData.ventas + monthData.otrosIngresos;
            const totalEgresos = monthData.compras + monthData.otrosGastos;
            const result = totalIngresos - totalEgresos;
            const rentab = totalIngresos > 0 ? ((result / totalIngresos) * 100).toFixed(1) : '0';
            csvContent += [
                monthNames[index],
                monthData.ventas,
                monthData.otrosIngresos,
                totalIngresos,
                monthData.compras,
                monthData.otrosGastos,
                totalEgresos,
                result,
                `${rentab}%`
            ].join(";") + "\n";
        });
        
        csvContent += [
            `TOTAL (${periodFilter.toUpperCase()})`,
            periodMetrics.totalVentas,
            periodMetrics.totalOtrosIngresos,
            periodMetrics.totalEntradas,
            periodMetrics.totalCompras,
            periodMetrics.totalOtrosGastos,
            periodMetrics.totalSalidas,
            periodMetrics.cashFlow,
            `${periodMetrics.profitability.toFixed(1)}%`
        ].join(";") + "\n";

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `reporte_${selectedYear}_${periodFilter}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const periodLabels = {
        anual: 'Año Completo',
        q1: '1° Trimestre (Ene - Mar)',
        q2: '2° Trimestre (Abr - Jun)',
        q3: '3° Trimestre (Jul - Sep)',
        q4: '4° Trimestre (Oct - Dic)',
        s1: '1° Semestre (Ene - Jun)',
        s2: '2° Semestre (Jul - Dic)'
    };

    return (
        <div className="p-6 space-y-8 animate-fade-in max-w-[1600px] mx-auto">
            {/* Modal de Detalle Mensual (Drill-Down) */}
            {selectedMonthDetail !== null && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[36px] shadow-2xl max-w-2xl w-full p-8 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-gray-100">
                        <div className="flex justify-between items-start mb-6 pb-4 border-b border-gray-100">
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                    {selectedYear} • {monthlyBreakdown[selectedMonthDetail].ops.length} Operaciones
                                </span>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight mt-2">
                                    Detalle de {monthNames[selectedMonthDetail]}
                                </h3>
                            </div>
                            <button 
                                onClick={() => setSelectedMonthDetail(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all"
                            >
                                <Icon name="X" size={20}/>
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Total Ingresos</p>
                                <p className="text-lg font-black text-emerald-600">
                                    {formatCurrency(monthlyBreakdown[selectedMonthDetail].ventas + monthlyBreakdown[selectedMonthDetail].otrosIngresos)}
                                </p>
                            </div>
                            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                <p className="text-[10px] font-black uppercase tracking-wider text-rose-800">Total Egresos</p>
                                <p className="text-lg font-black text-rose-600">
                                    {formatCurrency(monthlyBreakdown[selectedMonthDetail].compras + monthlyBreakdown[selectedMonthDetail].otrosGastos)}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {monthlyBreakdown[selectedMonthDetail].ops.length === 0 ? (
                                <div className="text-center py-12 text-gray-400 font-bold">
                                    No hay operaciones registradas en este mes.
                                </div>
                            ) : (
                                monthlyBreakdown[selectedMonthDetail].ops.map((op, idx) => {
                                    const isIngreso = op.type === 'venta' || op.type === 'ingreso';
                                    return (
                                        <div key={op.id || idx} className="p-3.5 bg-gray-50 rounded-2xl flex items-center justify-between hover:bg-gray-100/80 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isIngreso ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                    <Icon name={isIngreso ? 'ArrowDownLeft' : 'ArrowUpRight'} size={16}/>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-black text-gray-800">{op.description || 'Sin descripción'}</p>
                                                    <p className="text-[10px] font-semibold text-gray-400 capitalize">
                                                        {op.type} • {op.fechaEmision?.toDate ? op.fechaEmision.toDate().toLocaleDateString('es-AR') : `Día ${op.day || ''}`}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className={`text-sm font-black ${isIngreso ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {isIngreso ? '+' : '-'}{formatCurrency(op.amount)}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={() => setSelectedMonthDetail(null)}
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-800 transition-all"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cabecera y Controles */}
            <header className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6 no-print">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                            <Icon name="BarChart3" size={24}/>
                        </div>
                        <div>
                            <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reportes Avanzados</h2>
                            <p className="text-gray-500 font-medium text-xs mt-0.5">Centro de inteligencia financiera y métricas operativas.</p>
                        </div>
                    </div>
                </div>

                {/* Filtros de Año, Periodo y Botones */}
                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                    {/* Selector de Periodo */}
                    <div className="flex bg-white p-1 rounded-2xl border border-gray-200 shadow-sm">
                        <button
                            onClick={() => setPeriodFilter('anual')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${periodFilter === 'anual' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Anual
                        </button>
                        <button
                            onClick={() => setPeriodFilter(periodFilter.startsWith('q') ? periodFilter : 'q1')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${periodFilter.startsWith('q') ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Trimestral
                        </button>
                        <button
                            onClick={() => setPeriodFilter(periodFilter.startsWith('s') ? periodFilter : 's1')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${periodFilter.startsWith('s') ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            Semestral
                        </button>
                    </div>

                    {/* Sub-selectores si se elige Trimestre o Semestre */}
                    {periodFilter.startsWith('q') && (
                        <select
                            value={periodFilter}
                            onChange={(e) => setPeriodFilter(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none shadow-sm cursor-pointer"
                        >
                            <option value="q1">Q1 (Ene-Mar)</option>
                            <option value="q2">Q2 (Abr-Jun)</option>
                            <option value="q3">Q3 (Jul-Sep)</option>
                            <option value="q4">Q4 (Oct-Dic)</option>
                        </select>
                    )}

                    {periodFilter.startsWith('s') && (
                        <select
                            value={periodFilter}
                            onChange={(e) => setPeriodFilter(e.target.value)}
                            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 outline-none shadow-sm cursor-pointer"
                        >
                            <option value="s1">1° Semestre (Ene-Jun)</option>
                            <option value="s2">2° Semestre (Jul-Dic)</option>
                        </select>
                    )}

                    {/* Selector de Año */}
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))} 
                        className="px-4 py-2 bg-white border border-gray-200 rounded-2xl shadow-sm font-bold text-gray-800 text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                    >
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>

                    {/* Toggle Comparar año anterior */}
                    <button
                        onClick={() => setCompareWithPrevious(!compareWithPrevious)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-2xl border text-xs font-bold transition-all shadow-sm ${
                            compareWithPrevious 
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        title="Comparar con el año anterior"
                    >
                        <Icon name="Activity" size={14}/>
                        <span>vs {selectedYear - 1}</span>
                    </button>

                    {/* Botones de Acción */}
                    <div className="flex items-center gap-2 ml-auto xl:ml-0">
                        <button 
                            onClick={handleDownloadCSV} 
                            className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100"
                            title="Descargar Reporte CSV"
                        >
                            <Icon name="Download" size={18}/>
                        </button>
                        <button 
                            onClick={handlePrint} 
                            className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-100"
                            title="Imprimir / Exportar a PDF"
                        >
                            <Icon name="Printer" size={18}/>
                        </button>
                    </div>
                </div>
            </header>

            {/* Contenedor Principal */}
            <div className="bg-white p-8 md:p-10 rounded-[40px] shadow-sm border border-gray-100 print-container relative overflow-hidden">
                {/* Título de Impresión y Encabezado de Reporte */}
                <div className="flex flex-col md:flex-row md:items-center justify-between pb-8 mb-8 border-b border-gray-100 gap-4 print-avoid-break">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-3.5 py-1 bg-gray-900 text-white rounded-full text-xs font-black uppercase tracking-widest">
                                {selectedYear}
                            </span>
                            <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-black uppercase tracking-wider">
                                {periodLabels[periodFilter]}
                            </span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight mt-2 uppercase">
                            Balance Financiero y Desempeño
                        </h3>
                        <p className="text-gray-400 text-xs font-bold mt-1">
                            Titular: <span className="text-gray-700">{userData?.nombre || 'G&R Consultores'}</span> • CUIT: {userData?.cuit || 'Sin registrar'}
                        </p>
                    </div>

                    {/* Resumen ejecutivo rápido en cabecera */}
                    <div className="flex items-center gap-6 bg-gray-50/80 p-4 rounded-3xl border border-gray-100">
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Volumen Total</p>
                            <p className="text-base font-black text-gray-900">{formatCurrency(periodMetrics.totalEntradas + periodMetrics.totalSalidas)}</p>
                        </div>
                        <div className="w-px h-8 bg-gray-200"></div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Operaciones</p>
                            <p className="text-base font-black text-blue-600">{periodMetrics.totalOpsCount}</p>
                        </div>
                    </div>
                </div>

                {loading || (compareWithPrevious && prevLoading) ? (
                    <div className="flex flex-col items-center justify-center py-28 gap-4">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-gray-400 font-bold animate-pulse text-xs uppercase tracking-widest">Calculando balances y proyecciones...</p>
                    </div>
                ) : (
                    <>
                        {/* Tarjetas KPIs Modernizadas con Microindicadores */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8 print-avoid-break">
                            {/* Ventas */}
                            <div className="bg-gradient-to-br from-emerald-50/80 to-emerald-50/20 p-5 rounded-3xl border border-emerald-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Ventas</span>
                                    <Icon name="TrendingUp" size={14} className="text-emerald-500"/>
                                </div>
                                <p className="text-lg md:text-xl font-black text-emerald-600 truncate">{formatCurrency(periodMetrics.totalVentas)}</p>
                                {periodMetrics.growthIngresos !== null && (
                                    <p className={`text-[10px] font-black mt-1 ${periodMetrics.growthIngresos >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {periodMetrics.growthIngresos >= 0 ? '↑' : '↓'} {Math.abs(periodMetrics.growthIngresos).toFixed(1)}% vs {selectedYear - 1}
                                    </p>
                                )}
                            </div>

                            {/* Compras */}
                            <div className="bg-gradient-to-br from-rose-50/80 to-rose-50/20 p-5 rounded-3xl border border-rose-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-rose-800 uppercase tracking-widest">Compras</span>
                                    <Icon name="TrendingDown" size={14} className="text-rose-500"/>
                                </div>
                                <p className="text-lg md:text-xl font-black text-rose-600 truncate">{formatCurrency(periodMetrics.totalCompras)}</p>
                                {periodMetrics.growthEgresos !== null && (
                                    <p className={`text-[10px] font-black mt-1 ${periodMetrics.growthEgresos <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                        {periodMetrics.growthEgresos >= 0 ? '↑' : '↓'} {Math.abs(periodMetrics.growthEgresos).toFixed(1)}% vs {selectedYear - 1}
                                    </p>
                                )}
                            </div>

                            {/* Otros Ingresos */}
                            <div className="bg-gradient-to-br from-teal-50/80 to-teal-50/20 p-5 rounded-3xl border border-teal-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-teal-800 uppercase tracking-widest">Otros Ing.</span>
                                    <Icon name="ArrowDownLeft" size={14} className="text-teal-500"/>
                                </div>
                                <p className="text-lg md:text-xl font-black text-teal-600 truncate">{formatCurrency(periodMetrics.totalOtrosIngresos)}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Cobros y extras</p>
                            </div>

                            {/* Otros Gastos */}
                            <div className="bg-gradient-to-br from-amber-50/80 to-amber-50/20 p-5 rounded-3xl border border-amber-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Otros Gastos</span>
                                    <Icon name="ArrowUpRight" size={14} className="text-amber-500"/>
                                </div>
                                <p className="text-lg md:text-xl font-black text-amber-600 truncate">{formatCurrency(periodMetrics.totalOtrosGastos)}</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Servicios / Oper.</p>
                            </div>

                            {/* Flujo Neto */}
                            <div className="bg-gradient-to-br from-blue-50/80 to-blue-50/20 p-5 rounded-3xl border border-blue-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Flujo Neto</span>
                                    <Icon name="DollarSign" size={14} className="text-blue-500"/>
                                </div>
                                <p className={`text-lg md:text-xl font-black truncate ${periodMetrics.cashFlow >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                    {formatCurrency(periodMetrics.cashFlow)}
                                </p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Ingresos - Egresos</p>
                            </div>

                            {/* Rentabilidad */}
                            <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-50/20 p-5 rounded-3xl border border-indigo-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black text-indigo-800 uppercase tracking-widest">Rentabilidad</span>
                                    <Icon name="Target" size={14} className="text-indigo-500"/>
                                </div>
                                <p className="text-lg md:text-xl font-black text-indigo-600">{periodMetrics.profitability.toFixed(1)}%</p>
                                <p className="text-[10px] font-bold text-gray-400 mt-1">Margen sobre ingr.</p>
                            </div>
                        </div>

                        {/* Tarjetas de Métricas Inteligentes (Insights) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 print-avoid-break">
                            {/* Mes Récord de Ventas */}
                            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                    <Icon name="Award" size={20}/>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mes Récord de Ingresos</p>
                                    <p className="text-sm font-black text-gray-800 truncate">
                                        {periodMetrics.peakSalesMonth ? `${periodMetrics.peakSalesMonth.name} (${formatCurrency(periodMetrics.peakSalesMonth.amount)})` : 'Sin registros'}
                                    </p>
                                </div>
                            </div>

                            {/* Mes Mayor Gasto */}
                            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                                    <Icon name="AlertTriangle" size={20}/>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mayor Presión de Costos</p>
                                    <p className="text-sm font-black text-gray-800 truncate">
                                        {periodMetrics.peakExpenseMonth ? `${periodMetrics.peakExpenseMonth.name} (${formatCurrency(periodMetrics.peakExpenseMonth.amount)})` : 'Sin registros'}
                                    </p>
                                </div>
                            </div>

                            {/* Promedio Mensual */}
                            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                    <Icon name="Layers" size={20}/>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ingreso Mensual Promedio</p>
                                    <p className="text-sm font-black text-gray-800 truncate">
                                        {formatCurrency(periodMetrics.avgMonthlyIncome)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Contenedor Gráfico con Selector de Modo */}
                        <div className="bg-gray-50/50 p-6 md:p-8 rounded-[40px] border border-gray-100 mb-8 print-avoid-break">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                <h4 className="text-xs font-black text-gray-600 uppercase tracking-widest flex items-center gap-2">
                                    <Icon name="BarChart3" size={16} className="text-blue-500"/>
                                    Visualización Gráfica del Periodo
                                </h4>
                                
                                {/* Selector de Tipo de Gráfico */}
                                <div className="flex bg-white p-1 rounded-2xl border border-gray-200 shadow-sm no-print">
                                    <button
                                        onClick={() => setChartMode('bars')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                            chartMode === 'bars' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        <Icon name="BarChart3" size={14}/> Barras
                                    </button>
                                    <button
                                        onClick={() => setChartMode('trend')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                            chartMode === 'trend' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        <Icon name="LineChart" size={14}/> Tendencia
                                    </button>
                                    <button
                                        onClick={() => setChartMode('distribution')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                            chartMode === 'distribution' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                    >
                                        <Icon name="PieChart" size={14}/> Distribución
                                    </button>
                                </div>
                            </div>

                            {/* Renderizado Condicional del Gráfico */}
                            <div className="h-[380px]">
                                {chartMode === 'bars' && (
                                    <Bar data={barChartData} options={baseChartOptions} />
                                )}
                                {chartMode === 'trend' && (
                                    <Line data={trendChartData} options={baseChartOptions} />
                                )}
                                {chartMode === 'distribution' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full items-center">
                                        <div className="h-[320px] flex flex-col items-center">
                                            <p className="text-xs font-black text-emerald-800 uppercase tracking-wider mb-2">Composición de Ingresos</p>
                                            <div className="h-[260px] w-full">
                                                <Doughnut data={doughnutIngresosData} options={doughnutOptions} />
                                            </div>
                                        </div>
                                        <div className="h-[320px] flex flex-col items-center">
                                            <p className="text-xs font-black text-rose-800 uppercase tracking-wider mb-2">Estructura de Egresos</p>
                                            <div className="h-[260px] w-full">
                                                <Doughnut data={doughnutEgresosData} options={doughnutOptions} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tabla Mensual Enriquecida con Barras de Proporción y Clic para detalle */}
                        <div className="print-avoid-break">
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest">
                                    Desglose por Mes (Haz clic en un mes para ver sus comprobantes)
                                </h4>
                                <span className="text-[10px] font-bold text-gray-400">
                                    Mostrando {activeMonthsIndices.length} de 12 meses
                                </span>
                            </div>

                            <div className="overflow-x-auto border border-gray-100 rounded-[32px] shadow-sm">
                                <table className="min-w-full divide-y divide-gray-100">
                                    <thead className="bg-gray-50/80">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Mes</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap">Ventas</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-teal-600 uppercase tracking-widest whitespace-nowrap">Otros Ing.</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-rose-600 uppercase tracking-widest whitespace-nowrap">Compras</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-amber-600 uppercase tracking-widest whitespace-nowrap">Otros Gastos</th>
                                            <th className="px-6 py-4 text-right text-[10px] font-black text-gray-900 uppercase tracking-widest whitespace-nowrap">Resultado</th>
                                            <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap no-print">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-50">
                                        {activeMonthsIndices.map((monthIndex) => {
                                            const monthData = monthlyBreakdown[monthIndex];
                                            const totalIng = monthData.ventas + monthData.otrosIngresos;
                                            const totalEgr = monthData.compras + monthData.otrosGastos;
                                            const neto = totalIng - totalEgr;
                                            
                                            // Porcentaje relativo frente al mes más alto
                                            const pctIng = Math.min(100, Math.round((totalIng / maxMonthlyValues.maxIncome) * 100));
                                            const pctEgr = Math.min(100, Math.round((totalEgr / maxMonthlyValues.maxExpense) * 100));

                                            return (
                                                <tr 
                                                    key={monthIndex} 
                                                    onClick={() => setSelectedMonthDetail(monthIndex)}
                                                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-gray-800 capitalize group-hover:text-blue-600 transition-colors">
                                                                {monthNames[monthIndex]}
                                                            </span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                                                                {monthData.count} ops
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                                        <div className="text-sm font-bold text-emerald-600">{formatCurrency(monthData.ventas)}</div>
                                                        <div className="w-full bg-gray-100 h-1 rounded-full mt-1 overflow-hidden">
                                                            <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${pctIng}%` }}></div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-sm font-medium text-teal-600 whitespace-nowrap">
                                                        {formatCurrency(monthData.otrosIngresos)}
                                                    </td>
                                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                                        <div className="text-sm font-bold text-rose-600">{formatCurrency(monthData.compras)}</div>
                                                        <div className="w-full bg-gray-100 h-1 rounded-full mt-1 overflow-hidden">
                                                            <div className="bg-rose-500 h-1 rounded-full" style={{ width: `${pctEgr}%` }}></div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right text-sm font-medium text-amber-600 whitespace-nowrap">
                                                        {formatCurrency(monthData.otrosGastos)}
                                                    </td>
                                                    <td className={`px-6 py-4 text-right text-sm font-black whitespace-nowrap ${neto >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                                                        {formatCurrency(neto)}
                                                    </td>
                                                    <td className="px-6 py-4 text-center whitespace-nowrap no-print">
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 group-hover:underline">
                                                            Ver <Icon name="ChevronRight" size={12}/>
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-900 text-white">
                                        <tr>
                                            <td className="px-6 py-5 text-xs font-black uppercase tracking-widest whitespace-nowrap">
                                                Totales ({periodFilter.toUpperCase()})
                                            </td>
                                            <td className="px-6 py-5 text-right text-sm font-black whitespace-nowrap">{formatCurrency(periodMetrics.totalVentas)}</td>
                                            <td className="px-6 py-5 text-right text-sm font-black text-teal-300 whitespace-nowrap">{formatCurrency(periodMetrics.totalOtrosIngresos)}</td>
                                            <td className="px-6 py-5 text-right text-sm font-black whitespace-nowrap">{formatCurrency(periodMetrics.totalCompras)}</td>
                                            <td className="px-6 py-5 text-right text-sm font-black text-amber-300 whitespace-nowrap">{formatCurrency(periodMetrics.totalOtrosGastos)}</td>
                                            <td className="px-6 py-5 text-right text-lg font-black text-yellow-400 whitespace-nowrap">{formatCurrency(periodMetrics.cashFlow)}</td>
                                            <td className="no-print"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ReportsPage;
