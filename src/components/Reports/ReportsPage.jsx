import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useYearlyCollection } from '../../hooks/useCollections';
import Icon from '../Common/Icon';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const ReportsPage = () => {
    const { userData } = useAuth();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const { data: operations, loading } = useYearlyCollection('operations', selectedYear);

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    const annualMetrics = useMemo(() => {
        let totalVentas = 0;
        let totalCompras = 0;
        let totalOtrosIngresos = 0;
        let totalOtrosGastos = 0;

        operations.forEach(op => {
            switch (op.type) {
                case 'venta': totalVentas += op.amount; break;
                case 'compra': totalCompras += op.amount; break;
                case 'ingreso': totalOtrosIngresos += op.amount; break;
                case 'gasto': totalOtrosGastos += op.amount; break;
                default: break;
            }
        });

        const totalEntradas = totalVentas + totalOtrosIngresos;
        const totalSalidas = totalCompras + totalOtrosGastos;
        const cashFlow = totalEntradas - totalSalidas;
        const profitability = totalEntradas > 0 ? (cashFlow / totalEntradas) * 100 : 0;

        return { totalVentas, totalCompras, totalOtrosIngresos, totalOtrosGastos, cashFlow, profitability };
    }, [operations]);

    const monthlyBreakdown = useMemo(() => {
        const months = Array.from({ length: 12 }, () => ({ ventas: 0, compras: 0, otrosIngresos: 0, otrosGastos: 0 }));
        operations.forEach(op => {
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
    }, [operations]);

    const chartData = {
        labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        datasets: [
            {
                label: 'Ventas',
                data: monthlyBreakdown.map(m => m.ventas),
                backgroundColor: '#10b981', 
                stack: 'Stack 0',
                borderRadius: 8,
            },
            {
                label: 'Otros Ingresos',
                data: monthlyBreakdown.map(m => m.otrosIngresos),
                backgroundColor: '#6ee7b7', 
                stack: 'Stack 0',
                borderRadius: 8,
            },
            {
                label: 'Compras',
                data: monthlyBreakdown.map(m => m.compras),
                backgroundColor: '#ef4444', 
                stack: 'Stack 1',
                borderRadius: 8,
            },
            {
                label: 'Otros Gastos',
                data: monthlyBreakdown.map(m => m.otrosGastos),
                backgroundColor: '#f87171', 
                stack: 'Stack 1',
                borderRadius: 8,
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    usePointStyle: true,
                    padding: 20,
                    font: { size: 12, weight: 'bold' }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                padding: 12,
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#1f2937',
                bodyColor: '#4b5563',
                borderColor: '#e5e7eb',
                borderWidth: 1,
                callbacks: {
                    label: function(context) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
                        if (context.parsed.y !== null) {
                            label += formatCurrency(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            x: {
                stacked: true,
                grid: { display: false },
                ticks: { font: { weight: 'bold' } }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                grid: { color: '#f3f4f6' },
                ticks: {
                    callback: (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact' }).format(value),
                    font: { weight: 'bold' }
                }
            }
        }
    };

    const handlePrint = () => window.print();

    const handleDownloadCSV = () => {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        let csvContent = "\uFEFF";
        const headers = ["Mes", "Ventas", "Otros Ingresos", "Compras", "Otros Gastos", "Resultado Neto"];
        csvContent += headers.join(";") + "\n";

        monthlyBreakdown.forEach((monthData, index) => {
            const totalIngresos = monthData.ventas + monthData.otrosIngresos;
            const totalEgresos = monthData.compras + monthData.otrosGastos;
            const result = totalIngresos - totalEgresos;
            csvContent += [monthNames[index], monthData.ventas, monthData.otrosIngresos, monthData.compras, monthData.otrosGastos, result].join(";") + "\n";
        });
        
        csvContent += ["TOTAL ANUAL", annualMetrics.totalVentas, annualMetrics.totalOtrosIngresos, annualMetrics.totalCompras, annualMetrics.totalOtrosGastos, annualMetrics.cashFlow].join(";") + "\n";

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `reporte_anual_${selectedYear}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 no-print">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Reportes Avanzados</h2>
                    <p className="text-gray-500 font-medium italic">Análisis anual de desempeño financiero.</p>
                </div>
                <div className="flex items-center gap-3">
                    <select 
                        value={selectedYear} 
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))} 
                        className="px-6 py-3 bg-white border border-gray-100 rounded-2xl shadow-sm font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-100 transition-all cursor-pointer appearance-none"
                    >
                        {years.map(year => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <button 
                        onClick={handleDownloadCSV} 
                        className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-100"
                        title="Descargar CSV"
                    >
                        <Icon name="Download" size={20}/>
                    </button>
                    <button 
                        onClick={handlePrint} 
                        className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-sm border border-blue-100"
                        title="Imprimir Reporte"
                    >
                        <Icon name="Printer" size={20}/>
                    </button>
                </div>
            </header>

            <div className="bg-white p-10 rounded-[40px] shadow-sm border border-gray-100 print-container relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                
                <div className="text-center mb-12 relative z-10">
                    <h3 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Balance Financiero Anual</h3>
                    <div className="flex items-center justify-center gap-2 mt-2">
                        <span className="px-4 py-1 bg-gray-900 text-white rounded-full text-xs font-black uppercase tracking-widest">{selectedYear}</span>
                        <p className="text-gray-400 font-bold italic">Consultora: {userData?.nombre || 'G&R Consultores'}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-gray-400 font-bold animate-pulse">Analizando ciclos financieros...</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
                            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                                <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest mb-2">Ventas</h4>
                                <p className="text-xl font-black text-emerald-600 truncate">{formatCurrency(annualMetrics.totalVentas)}</p>
                            </div>
                            <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 text-center">
                                <h4 className="text-[10px] font-black text-rose-800 uppercase tracking-widest mb-2">Compras</h4>
                                <p className="text-xl font-black text-rose-600 truncate">{formatCurrency(annualMetrics.totalCompras)}</p>
                            </div>
                            <div className="bg-teal-50 p-6 rounded-3xl border border-teal-100 text-center">
                                <h4 className="text-[10px] font-black text-teal-800 uppercase tracking-widest mb-2">Otros Ing.</h4>
                                <p className="text-xl font-black text-teal-600 truncate">{formatCurrency(annualMetrics.totalOtrosIngresos)}</p>
                            </div>
                            <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 text-center">
                                <h4 className="text-[10px] font-black text-orange-800 uppercase tracking-widest mb-2">Otros Gas.</h4>
                                <p className="text-xl font-black text-orange-600 truncate">{formatCurrency(annualMetrics.totalOtrosGastos)}</p>
                            </div>
                            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 text-center">
                                <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-2">Flujo Neto</h4>
                                <p className={`text-xl font-black truncate ${annualMetrics.cashFlow >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                    {formatCurrency(annualMetrics.cashFlow)}
                                </p>
                            </div>
                            <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 text-center">
                                <h4 className="text-[10px] font-black text-indigo-800 uppercase tracking-widest mb-2">Rentab.</h4>
                                <p className="text-xl font-black text-indigo-600">{annualMetrics.profitability.toFixed(1)}%</p>
                            </div>
                        </div>

                        <div className="bg-gray-50/50 p-8 rounded-[40px] border border-gray-100 mb-12">
                            <h4 className="text-sm font-black text-gray-500 uppercase tracking-widest mb-8 text-center flex items-center justify-center gap-2">
                                <Icon name="BarChart3" size={16} className="text-blue-500"/> Curva Mensual de Ingresos vs Egresos
                            </h4>
                            <div className="h-[400px]">
                                <Bar data={chartData} options={chartOptions} />
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-100 rounded-[32px]">
                            <table className="min-w-full divide-y divide-gray-100">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Mes</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-emerald-600 uppercase tracking-widest whitespace-nowrap">Ventas</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-rose-600 uppercase tracking-widest whitespace-nowrap">Compras</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-teal-600 uppercase tracking-widest whitespace-nowrap">Otros Ing.</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-orange-600 uppercase tracking-widest whitespace-nowrap">Otros Gas.</th>
                                        <th className="px-6 py-4 text-right text-[10px] font-black text-gray-800 uppercase tracking-widest whitespace-nowrap">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {monthlyBreakdown.map((monthData, index) => {
                                        const ingresos = monthData.ventas + monthData.otrosIngresos;
                                        const egresos = monthData.compras + monthData.otrosGastos;
                                        const neto = ingresos - egresos;
                                        return (
                                            <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 text-sm font-black text-gray-700 capitalize whitespace-nowrap">
                                                    {new Date(0, index).toLocaleString('es-AR', { month: 'long' })}
                                                </td>
                                                <td className="px-6 py-4 text-right text-sm font-bold text-emerald-600 whitespace-nowrap">{formatCurrency(monthData.ventas)}</td>
                                                <td className="px-6 py-4 text-right text-sm font-bold text-rose-600 whitespace-nowrap">{formatCurrency(monthData.compras)}</td>
                                                <td className="px-6 py-4 text-right text-sm font-medium text-teal-600 whitespace-nowrap">{formatCurrency(monthData.otrosIngresos)}</td>
                                                <td className="px-6 py-4 text-right text-sm font-medium text-orange-600 whitespace-nowrap">{formatCurrency(monthData.otrosGastos)}</td>
                                                <td className={`px-6 py-4 text-right text-sm font-black whitespace-nowrap ${neto >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                                                    {formatCurrency(neto)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-900 text-white">
                                    <tr>
                                        <td className="px-6 py-5 text-xs font-black uppercase tracking-widest whitespace-nowrap">Totales {selectedYear}</td>
                                        <td className="px-6 py-5 text-right text-sm font-black whitespace-nowrap">{formatCurrency(annualMetrics.totalVentas)}</td>
                                        <td className="px-6 py-5 text-right text-sm font-black whitespace-nowrap">{formatCurrency(annualMetrics.totalCompras)}</td>
                                        <td className="px-6 py-5 text-right text-sm font-black text-teal-300 whitespace-nowrap">{formatCurrency(annualMetrics.totalOtrosIngresos)}</td>
                                        <td className="px-6 py-5 text-right text-sm font-black text-orange-300 whitespace-nowrap">{formatCurrency(annualMetrics.totalOtrosGastos)}</td>
                                        <td className="px-6 py-5 text-right text-lg font-black text-yellow-400 whitespace-nowrap">{formatCurrency(annualMetrics.cashFlow)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ReportsPage;
