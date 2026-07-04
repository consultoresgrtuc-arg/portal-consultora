import React, { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend
} from 'chart.js';
import Icon from '../Common/Icon';
import { calcularPrecioVenta } from './pricingCalculator';

// Registrar los elementos requeridos de Chart.js para el gráfico circular
ChartJS.register(ArcElement, ChartTooltip, ChartLegend);

const PricingCalculatorForm = ({ dollarRates = [] }) => {
    // Inputs del formulario
    const [costo, setCosto] = useState('10000');
    const [iibb, setIibb] = useState('3.5');
    const [tem, setTem] = useState('0.9');
    const [comisiones, setComisiones] = useState('15');
    const [inflacion, setInflacion] = useState('2.1');
    const [rentabilidad, setRentabilidad] = useState('15');
    
    // Divisas
    const [monedaEntrada, setMonedaEntrada] = useState('ARS'); // 'ARS' | 'USD'
    const [monedaSalida, setMonedaSalida] = useState('ARS'); // 'ARS' | 'USD'
    const [tipoDolar, setTipoDolar] = useState('blue');

    // Descuento
    const [descuentoActivo, setDescuentoActivo] = useState(true);
    const [descuento, setDescuento] = useState('5');

    // Historial local
    const [nombreSimulacion, setNombreSimulacion] = useState('');
    const [simulaciones, setSimulaciones] = useState([]);

    // Resultados
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Cargar Historial al montar el componente
    useEffect(() => {
        const stored = localStorage.getItem('gyr_pricing_simulations');
        if (stored) {
            try {
                setSimulaciones(JSON.parse(stored));
            } catch (err) {
                console.error("Error al cargar simulaciones:", err);
            }
        }
    }, []);

    // Helper para formatear monedas dinámicamente
    const formatCurrency = (value, currency = 'ARS') => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) {
            return currency === 'ARS' ? '$0,00' : 'USD 0,00';
        }
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency === 'ARS' ? 'ARS' : 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    };

    // Helper para formatear porcentaje
    const formatPercentage = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return '0,00%';
        return new Intl.NumberFormat('es-AR', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    };

    // Tasa de cambio seleccionada
    const getExchangeRate = () => {
        const selectedRate = dollarRates?.find(r => r.casa === tipoDolar) || dollarRates?.[0];
        return selectedRate ? selectedRate.venta : 1;
    };

    const currentRateValue = getExchangeRate();

    // Efecto reactivo para realizar los cálculos del motor
    useEffect(() => {
        const rate = currentRateValue;
        
        // El costo de adquisición base se convierte a ARS si se ingresó en USD
        const rawCosto = parseFloat(costo);
        const numCosto = monedaEntrada === 'USD' ? (rawCosto * rate) : rawCosto;

        const numIibb = parseFloat(iibb) / 100;
        const numTem = parseFloat(tem) / 100;
        const numComisiones = parseFloat(comisiones) / 100;
        const numInflacion = parseFloat(inflacion) / 100;
        const numRentabilidad = parseFloat(rentabilidad) / 100;
        const numDescuento = descuentoActivo && descuento !== '' ? parseFloat(descuento) / 100 : undefined;

        if (
            !isNaN(numCosto) && numCosto >= 0 &&
            !isNaN(numIibb) && numIibb >= 0 &&
            !isNaN(numTem) && numTem >= 0 &&
            !isNaN(numComisiones) && numComisiones >= 0 &&
            !isNaN(numInflacion) && numInflacion >= 0 &&
            !isNaN(numRentabilidad) && numRentabilidad >= 0
        ) {
            try {
                const res = calcularPrecioVenta({
                    costo_adquisicion: numCosto,
                    alicuota_iibb: numIibb,
                    alicuota_tem: numTem,
                    comisiones_venta: numComisiones,
                    inflacion_estimada: numInflacion,
                    rentabilidad_esperada: numRentabilidad,
                    porcentaje_descuento: numDescuento
                });
                setResult(res);
                setError('');
            } catch (err) {
                setError(err.message);
                setResult(null);
            }
        } else {
            setError('Todos los valores numéricos deben ser válidos y mayores o iguales a cero.');
            setResult(null);
        }
    }, [costo, iibb, tem, comisiones, inflacion, rentabilidad, descuentoActivo, descuento, monedaEntrada, tipoDolar, currentRateValue]);

    // Guardar simulación en LocalStorage
    const handleGuardarSimulacion = (e) => {
        e.preventDefault();
        if (!nombreSimulacion.trim()) return;

        const nuevaSim = {
            id: Date.now(),
            nombre: nombreSimulacion,
            costo,
            iibb,
            tem,
            comisiones,
            inflacion,
            rentabilidad,
            descuento,
            descuentoActivo,
            monedaEntrada,
            tipoDolar
        };

        const updated = [nuevaSim, ...simulaciones];
        setSimulaciones(updated);
        localStorage.setItem('gyr_pricing_simulations', JSON.stringify(updated));
        setNombreSimulacion('');
    };

    // Cargar simulación guardada
    const handleCargarSimulacion = (sim) => {
        setCosto(sim.costo);
        setIibb(sim.iibb);
        setTem(sim.tem);
        setComisiones(sim.comisiones);
        setInflacion(sim.inflacion);
        setRentabilidad(sim.rentabilidad);
        setDescuento(sim.descuento || '5');
        setDescuentoActivo(!!sim.descuentoActivo);
        setMonedaEntrada(sim.monedaEntrada || 'ARS');
        setTipoDolar(sim.tipoDolar || 'blue');
    };

    // Eliminar simulación guardada
    const handleEliminarSimulacion = (id, e) => {
        e.stopPropagation();
        const updated = simulaciones.filter(s => s.id !== id);
        setSimulaciones(updated);
        localStorage.setItem('gyr_pricing_simulations', JSON.stringify(updated));
    };

    // Exportar a CSV
    const handleExportarCSV = () => {
        if (!result) return;
        const rate = currentRateValue;
        
        let csvContent = "\uFEFF"; // UTF-8 BOM para soporte de caracteres en español en Excel
        csvContent += "Concepto,Valor base (ARS),Valor calculado (" + monedaSalida + ")\r\n";
        
        const getVal = (valArs) => monedaSalida === 'USD' ? (valArs / rate) : valArs;

        csvContent += `Costo de Adquisición,${result.recupero_costo},${getVal(result.recupero_costo).toFixed(2)}\r\n`;
        csvContent += `Impuestos IIBB (${iibb}%),${result.pago_iibb},${getVal(result.pago_iibb).toFixed(2)}\r\n`;
        csvContent += `Tasa Emergencia Municipal TEM (${tem}%),${result.pago_tem},${getVal(result.pago_tem).toFixed(2)}\r\n`;
        csvContent += `Comisiones Venta (${comisiones}%),${result.pago_comisiones},${getVal(result.pago_comisiones).toFixed(2)}\r\n`;
        csvContent += `Resguardo Inflación (${inflacion}%),${result.cobertura_inflacion},${getVal(result.cobertura_inflacion).toFixed(2)}\r\n`;
        csvContent += `Ganancia Neta Obtenida (${rentabilidad}%),${result.ganancia_neta_obtenida},${getVal(result.ganancia_neta_obtenida).toFixed(2)}\r\n`;
        csvContent += `Precio Sugerido Final,${result.precio_venta_sugerido},${getVal(result.precio_venta_sugerido).toFixed(2)}\r\n`;
        
        if (descuentoActivo && result.simulacion_descuento) {
            csvContent += "\r\n--- Simulación de Descuento ---\r\n";
            csvContent += `Porcentaje Descuento,${descuento}%\r\n`;
            csvContent += `Precio con Descuento (ARS),${result.simulacion_descuento.precio_con_descuento},${getVal(result.simulacion_descuento.precio_con_descuento).toFixed(2)}\r\n`;
            csvContent += `Nueva Ganancia Neta (ARS),${result.simulacion_descuento.nueva_ganancia_neta},${getVal(result.simulacion_descuento.nueva_ganancia_neta).toFixed(2)}\r\n`;
            csvContent += `Nueva Rentabilidad Real,${(result.simulacion_descuento.nueva_rentabilidad_real * 100).toFixed(2)}%\r\n`;
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `cotizacion_precio_${nombreSimulacion || 'sugerido'}_${Date.now()}.csv`);
    };

    // Helper de conversión a mostrar en pantalla
    const displayVal = (valArs) => {
        const rate = currentRateValue;
        const val = monedaSalida === 'USD' ? (valArs / rate) : valArs;
        return formatCurrency(val, monedaSalida);
    };

    // Configuración del gráfico Doughnut
    const getChartData = () => {
        if (!result) return null;
        return {
            labels: ['Costo Recup.', 'Impuestos (IIBB+TEM)', 'Comisiones', 'Resguardo Infl.', 'Ganancia Neta'],
            datasets: [{
                data: [
                    result.recupero_costo,
                    result.pago_iibb + result.pago_tem,
                    result.pago_comisiones,
                    result.cobertura_inflacion,
                    result.ganancia_neta_obtenida
                ],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.75)',  // Azul (Costo)
                    'rgba(249, 115, 22, 0.75)',  // Naranja (Impuestos)
                    'rgba(168, 85, 247, 0.75)',  // Violeta (Comisiones)
                    'rgba(234, 179, 8, 0.75)',   // Amarillo (Inflación)
                    'rgba(16, 185, 129, 0.75)'   // Verde (Ganancia)
                ],
                borderColor: [
                    '#3b82f6', '#f97316', '#a855f7', '#eab308', '#10b981'
                ],
                borderWidth: 1
            }]
        };
    };

    const chartData = getChartData();
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#cbd5e1',
                    font: { family: 'Inter', size: 9, weight: '500' },
                    padding: 8
                }
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const val = context.raw;
                        return ` ${context.label}: ${displayVal(val)}`;
                    }
                }
            }
        }
    };

    return (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl shadow-xl text-white relative overflow-hidden group hover:shadow-[0_8px_40px_rgba(99,102,241,0.2)] transition-all flex flex-col gap-6">
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500 opacity-5 mix-blend-overlay rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 group-hover:scale-110 transition-transform duration-700 pointer-events-none"></div>
            
            {/* Cabecera */}
            <div className="flex justify-between items-center border-b border-white/5 pb-4 no-print">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/10 p-2 rounded-xl border border-indigo-500/20">
                        <Icon name="BarChart3" className="w-5 h-5 text-indigo-400"/>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Calculadora de Precios Sugeridos</h3>
                        <p className="text-[10px] text-slate-400 font-medium">Margen inteligente en base a costos e impuestos</p>
                    </div>
                </div>
                
                {/* Botón Imprimir Ficha */}
                <button 
                    onClick={() => window.print()} 
                    className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                    title="Imprimir Ficha Cotización"
                >
                    <Icon name="Printer" size={14} className="text-slate-300" />
                </button>
            </div>

            {/* Controles de Entrada (Divisas & Moneda) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/40 p-4 rounded-2xl border border-white/5 no-print">
                {/* Moneda de Entrada */}
                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Moneda del Costo</label>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setMonedaEntrada('ARS')}
                            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${monedaEntrada === 'ARS' ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                        >
                            ARS ($)
                        </button>
                        <button 
                            onClick={() => setMonedaEntrada('USD')}
                            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer ${monedaEntrada === 'USD' ? 'bg-indigo-600 border-indigo-500 text-white shadow-md' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
                        >
                            USD (U$S)
                        </button>
                    </div>
                </div>

                {/* Tipo de Dólar / Tipo de Cambio */}
                <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de Cambio (Venta)</label>
                    {dollarRates.length > 0 ? (
                        <div className="flex gap-2">
                            <select 
                                value={tipoDolar}
                                onChange={e => setTipoDolar(e.target.value)}
                                className="flex-1 bg-white/5 border border-white/10 text-white rounded-lg p-1.5 text-xs font-bold outline-none cursor-pointer focus:border-indigo-500"
                            >
                                {dollarRates.map(rate => (
                                    <option key={rate.casa} value={rate.casa} className="bg-slate-900 text-white">
                                        {rate.nombre} (${rate.venta})
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <p className="text-[10px] text-amber-400/80 font-bold italic py-1.5">Cotizaciones no disponibles (1 USD = 1 ARS)</p>
                    )}
                </div>
            </div>

            {/* Inputs en Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 no-print">
                {/* Costo Adquisición */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all col-span-2 sm:col-span-1">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">
                        Costo ({monedaEntrada})
                    </label>
                    <div className="flex items-center px-2 pb-1">
                        <span className="text-indigo-300 font-bold mr-1">{monedaEntrada === 'ARS' ? '$' : 'U$S'}</span>
                        <input 
                            type="number" 
                            value={costo} 
                            onChange={e => setCosto(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                            placeholder="0.00"
                        />
                    </div>
                </div>

                {/* Margen Rentabilidad Esperada */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">Rentabilidad</label>
                    <div className="flex items-center px-2 pb-1">
                        <input 
                            type="number" 
                            step="0.5"
                            value={rentabilidad} 
                            onChange={e => setRentabilidad(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                        />
                        <span className="text-indigo-300 font-bold">%</span>
                    </div>
                </div>

                {/* Comisiones Venta */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">Comisión Venta</label>
                    <div className="flex items-center px-2 pb-1">
                        <input 
                            type="number" 
                            step="0.5"
                            value={comisiones} 
                            onChange={e => setComisiones(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                        />
                        <span className="text-indigo-300 font-bold">%</span>
                    </div>
                </div>

                {/* Ingresos Brutos IIBB */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">Alícuota IIBB</label>
                    <div className="flex items-center px-2 pb-1">
                        <input 
                            type="number" 
                            step="0.1"
                            value={iibb} 
                            onChange={e => setIibb(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                        />
                        <span className="text-indigo-300 font-bold">%</span>
                    </div>
                </div>

                {/* Tasa Emergencia Municipal TEM */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">Alícuota TEM</label>
                    <div className="flex items-center px-2 pb-1">
                        <input 
                            type="number" 
                            step="0.1"
                            value={tem} 
                            onChange={e => setTem(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                        />
                        <span className="text-indigo-300 font-bold">%</span>
                    </div>
                </div>

                {/* Cobertura Inflación */}
                <div className="bg-white/5 rounded-2xl p-2.5 backdrop-blur-md border border-white/5 focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                    <label className="block text-[9px] font-bold text-indigo-200 uppercase tracking-widest px-2 pt-1">Inflación mensual</label>
                    <div className="flex items-center px-2 pb-1">
                        <input 
                            type="number" 
                            step="0.1"
                            value={inflacion} 
                            onChange={e => setInflacion(e.target.value)} 
                            onFocus={e => e.target.select()} 
                            className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-indigo-300/30 outline-none text-sm"
                        />
                        <span className="text-indigo-300 font-bold">%</span>
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-rose-500/15 border border-rose-500/25 rounded-2xl p-4 text-xs text-rose-300 flex items-start gap-3 z-10 relative no-print">
                    <Icon name="ShieldAlert" className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-extrabold uppercase tracking-wider text-[10px] mb-1">Cálculo Inválido</p>
                        <p className="font-medium leading-relaxed">{error}</p>
                    </div>
                </div>
            )}

            {/* Resultados principales */}
            {result && (
                <div className="space-y-6 flex-1 flex flex-col justify-between">
                    
                    {/* Resultados Visuales y Desglose */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                        
                        {/* Ficha Principal */}
                        <div className="bg-white/5 rounded-2xl p-6 border border-white/5 flex flex-col justify-between relative">
                            {/* Selector Mostrar en Moneda */}
                            <div className="absolute top-4 right-4 flex gap-1.5 bg-slate-950/40 p-0.5 rounded-lg border border-white/5 no-print">
                                <button 
                                    onClick={() => setMonedaSalida('ARS')} 
                                    className={`px-2 py-1 rounded text-[8px] font-black tracking-widest ${monedaSalida === 'ARS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    ARS
                                </button>
                                <button 
                                    onClick={() => setMonedaSalida('USD')} 
                                    className={`px-2 py-1 rounded text-[8px] font-black tracking-widest ${monedaSalida === 'USD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                >
                                    USD
                                </button>
                            </div>

                            <div>
                                <h4 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1.5">Monto de Venta Sugerido</h4>
                                <div className="text-3xl md:text-4xl font-black text-white tracking-tight leading-none mb-2">
                                    {displayVal(result.precio_venta_sugerido)}
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-[85%]">
                                    {monedaEntrada === 'USD' ? `Convertido a tasa de ${currentRateValue} ARS. ` : ''}
                                    Precio ideal para recuperar costo, cubrir impuestos/comisiones y asegurar un margen neto del {rentabilidad}% mensual.
                                </p>
                            </div>

                            <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs">
                                <span className="text-slate-400 font-medium">Margen Neto Limpio:</span>
                                <span className="font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                                    {displayVal(result.ganancia_neta_obtenida)} ({formatPercentage(result.rentabilidad_real_lograda)})
                                </span>
                            </div>
                        </div>

                        {/* Visualización Gráfica Doughnut */}
                        <div className="bg-black/20 rounded-2xl p-4 border border-white/5 flex flex-col justify-center items-center h-[200px] lg:h-full relative overflow-hidden">
                            <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 self-start pl-2">Distribución del Ingreso</h5>
                            <div className="w-full h-[150px] relative">
                                <Doughnut data={chartData} options={chartOptions} />
                            </div>
                        </div>
                    </div>

                    {/* Desglose Detallado en Ficha (no-print) */}
                    <div className="bg-black/10 rounded-2xl p-4 border border-white/5 text-xs space-y-2.5 no-print">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Desglose de Costos e Impuestos</h5>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                            <div className="flex justify-between items-center text-slate-300">
                                <span>Costo Adquisición (Recupero):</span>
                                <span className="font-bold text-white">{displayVal(result.recupero_costo)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300">
                                <span>Comisiones Venta ({comisiones}%):</span>
                                <span className="font-bold text-white">{displayVal(result.pago_comisiones)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300">
                                <span>Impuesto IIBB ({iibb}%):</span>
                                <span className="font-bold text-white">{displayVal(result.pago_iibb)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300">
                                <span>Tasa TEM Municipal ({tem}%):</span>
                                <span className="font-bold text-white">{displayVal(result.pago_tem)}</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-300 col-span-1 sm:col-span-2 pt-2 border-t border-white/5">
                                <span>Resguardo Inflacionario ({inflacion}%):</span>
                                <span className="font-bold text-white">{displayVal(result.cobertura_inflacion)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Simulador de Descuentos */}
                    <div className="bg-slate-950/40 rounded-2xl p-5 border border-white/5 space-y-4">
                        <div className="flex items-center justify-between no-print">
                            <label className="flex items-center cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={descuentoActivo} 
                                    onChange={e => setDescuentoActivo(e.target.checked)} 
                                    className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500/20 w-4 h-4 mr-2"
                                />
                                <span className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Simular Descuento en Venta</span>
                            </label>
                            {descuentoActivo && (
                                <div className="flex items-center bg-white/5 px-2.5 py-0.5 rounded-lg border border-white/10 text-xs">
                                    <input 
                                        type="number" 
                                        step="0.5"
                                        value={descuento} 
                                        onChange={e => setDescuento(e.target.value)} 
                                        onFocus={e => e.target.select()} 
                                        className="w-12 bg-transparent border-none text-white font-bold p-0 text-right outline-none focus:ring-0 mr-1"
                                    />
                                    <span className="text-indigo-300 font-bold">%</span>
                                </div>
                            )}
                        </div>

                        {descuentoActivo && result.simulacion_descuento && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5 text-center sm:text-left">
                                <div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Precio con Descuento</p>
                                    <p className="text-lg font-extrabold text-white">{displayVal(result.simulacion_descuento.precio_con_descuento)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Ganancia Neta Restante</p>
                                    <p className="text-lg font-extrabold text-white">{displayVal(result.simulacion_descuento.nueva_ganancia_neta)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Rentabilidad Real Lograda</p>
                                    <p className={`text-lg font-black ${result.simulacion_descuento.nueva_rentabilidad_real <= 0 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : result.simulacion_descuento.nueva_rentabilidad_real < result.rentabilidad_real_lograda * 0.5 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'} px-2 py-0.5 rounded-lg border w-fit mx-auto sm:mx-0`}>
                                        {formatPercentage(result.simulacion_descuento.nueva_rentabilidad_real)}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Historial & Exportación (Sección no-print) */}
                    <div className="border-t border-white/5 pt-5 space-y-4 no-print">
                        {/* Formulario guardar simulación */}
                        <form onSubmit={handleGuardarSimulacion} className="flex gap-2">
                            <input 
                                type="text"
                                value={nombreSimulacion}
                                onChange={e => setNombreSimulacion(e.target.value)}
                                placeholder="Nombre de simulación (ej. Auriculares)"
                                className="flex-1 px-3 py-2 bg-slate-950/40 border border-white/5 hover:border-white/10 focus:border-indigo-500 rounded-xl text-xs outline-none transition-all placeholder-slate-500 text-white"
                            />
                            <button 
                                type="submit"
                                disabled={!nombreSimulacion.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 shrink-0"
                            >
                                <Icon name="Save" size={12} /> Guardar
                            </button>
                            <button 
                                type="button"
                                onClick={handleExportarCSV}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5 shrink-0"
                                title="Descargar Cotización en CSV"
                            >
                                <Icon name="Download" size={12} /> CSV
                            </button>
                        </form>

                        {/* Listado de simulaciones del Historial */}
                        {simulaciones.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Simulaciones Guardadas ({simulaciones.length})</p>
                                <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto pr-1">
                                    {simulaciones.map(sim => (
                                        <div 
                                            key={sim.id} 
                                            onClick={() => handleCargarSimulacion(sim)}
                                            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 px-2.5 py-1 rounded-xl text-[10px] cursor-pointer font-semibold transition-all text-slate-300 hover:text-white"
                                        >
                                            <span>{sim.nombre}</span>
                                            <span className="text-[8px] text-slate-500 font-bold">({formatCurrency(parseFloat(sim.costo), sim.monedaEntrada)})</span>
                                            <button 
                                                onClick={(e) => handleEliminarSimulacion(sim.id, e)}
                                                className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-all cursor-pointer"
                                                title="Eliminar del historial"
                                            >
                                                <Icon name="X" size={10} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PricingCalculatorForm;
