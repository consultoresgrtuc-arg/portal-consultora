import React, { useState, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend
} from 'chart.js';
import { db } from '../../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import { calcularPrecioVenta } from './pricingCalculator';

ChartJS.register(ArcElement, ChartTooltip, ChartLegend);

const PricingCalculatorForm = ({ dollarRates = [], targetUserId, onScheduleInCashFlow }) => {
    const { user } = useAuth();
    const currentUid = targetUserId || user?.uid;

    // Parámetros de Costos y Reposición
    const [costo, setCosto] = useState('10000');
    const [costosAdicionales, setCostosAdicionales] = useState('0');
    const [inflacion, setInflacion] = useState('2.1');
    const [diasReposicion, setDiasReposicion] = useState('30');
    const [modoInflacion, setModoInflacion] = useState('costo'); // 'costo' | 'precio'

    // Parámetros Comerciales e Impositivos
    const [iibb, setIibb] = useState('3.5');
    const [tem, setTem] = useState('0.9');
    const [comisiones, setComisiones] = useState('15');
    const [baseComision, setBaseComision] = useState('bruto'); // 'bruto' (sobre Total c/IVA) | 'neto' (sobre Neto s/IVA)
    const [iva, setIva] = useState('21'); // '0' | '10.5' | '21' | '27'

    // Parámetros de Rentabilidad y Volumen
    const [rentabilidad, setRentabilidad] = useState('15');
    const [modoRentabilidad, setModoRentabilidad] = useState('margen_venta'); // 'margen_venta' (ROS) | 'markup_costo' (ROI)
    const [cantidadUnidades, setCantidadUnidades] = useState('1');

    // Divisas
    const [monedaEntrada, setMonedaEntrada] = useState('ARS'); // 'ARS' | 'USD'
    const [monedaSalida, setMonedaSalida] = useState('ARS'); // 'ARS' | 'USD'
    const [tipoDolar, setTipoDolar] = useState('blue');

    // Simulador de Descuento
    const [descuentoActivo, setDescuentoActivo] = useState(true);
    const [descuento, setDescuento] = useState('5');

    // Historial y Feedback
    const [nombreSimulacion, setNombreSimulacion] = useState('');
    const [simulaciones, setSimulaciones] = useState([]);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [copiedLabel, setCopiedLabel] = useState('');

    // Cargar Historial desde Firestore (con respaldo en localStorage)
    useEffect(() => {
        if (!currentUid) {
            const stored = localStorage.getItem('gyr_pricing_simulations');
            if (stored) {
                try {
                    setSimulaciones(JSON.parse(stored));
                } catch (err) {
                    console.error("Error al cargar simulaciones:", err);
                }
            }
            return;
        }

        const q = query(collection(db, 'users', currentUid, 'pricing_simulations'), orderBy('id', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const loaded = snapshot.docs.map(d => ({ docId: d.id, ...d.data() }));
                setSimulaciones(loaded);
                localStorage.setItem('gyr_pricing_simulations', JSON.stringify(loaded));
            } else {
                const stored = localStorage.getItem('gyr_pricing_simulations');
                if (stored) {
                    try {
                        setSimulaciones(JSON.parse(stored));
                    } catch {
                        setSimulaciones([]);
                    }
                } else {
                    setSimulaciones([]);
                }
            }
        }, (err) => {
            console.error("Error cargando simulaciones de precios:", err);
        });

        return () => unsubscribe();
    }, [currentUid]);

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

    const formatPercentage = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return '0,00%';
        return new Intl.NumberFormat('es-AR', {
            style: 'percent',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    };

    const getExchangeRate = () => {
        const selectedRate = dollarRates?.find(r => r.casa === tipoDolar) || dollarRates?.[0];
        return selectedRate ? Number(selectedRate.venta) || 1 : 1;
    };

    const currentRateValue = getExchangeRate();

    // Efecto reactivo para realizar los cálculos del motor
    useEffect(() => {
        const rate = currentRateValue;

        const rawCosto = parseFloat(costo) || 0;
        const rawAdicionales = parseFloat(costosAdicionales) || 0;
        const numCosto = monedaEntrada === 'USD' ? (rawCosto * rate) : rawCosto;
        const numAdicionales = monedaEntrada === 'USD' ? (rawAdicionales * rate) : rawAdicionales;

        const numIibb = parseFloat(iibb) / 100;
        const numTem = parseFloat(tem) / 100;
        const numComisiones = parseFloat(comisiones) / 100;
        const numInflacion = parseFloat(inflacion) / 100;
        const numDiasReposicion = Math.max(0, parseFloat(diasReposicion) || 0);
        const numRentabilidad = parseFloat(rentabilidad) / 100;
        const numIva = parseFloat(iva) / 100;
        const numUnidades = Math.max(1, parseInt(cantidadUnidades, 10) || 1);
        const numDescuento = descuentoActivo && descuento !== '' ? parseFloat(descuento) / 100 : undefined;

        if (
            !isNaN(numCosto) && numCosto >= 0 &&
            !isNaN(numAdicionales) && numAdicionales >= 0 &&
            !isNaN(numIibb) && numIibb >= 0 &&
            !isNaN(numTem) && numTem >= 0 &&
            !isNaN(numComisiones) && numComisiones >= 0 &&
            !isNaN(numInflacion) && numInflacion >= 0 &&
            !isNaN(numRentabilidad) && numRentabilidad >= 0 &&
            !isNaN(numIva) && numIva >= 0
        ) {
            try {
                const res = calcularPrecioVenta({
                    costo_adquisicion: numCosto,
                    costos_adicionales: numAdicionales,
                    alicuota_iibb: numIibb,
                    alicuota_tem: numTem,
                    comisiones_venta: numComisiones,
                    base_comision: baseComision,
                    inflacion_estimada: numInflacion,
                    dias_reposicion: numDiasReposicion,
                    modo_inflacion: modoInflacion,
                    rentabilidad_esperada: numRentabilidad,
                    modo_rentabilidad: modoRentabilidad,
                    alicuota_iva: numIva,
                    porcentaje_descuento: numDescuento,
                    cantidad_unidades: numUnidades
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
    }, [
        costo,
        costosAdicionales,
        iibb,
        tem,
        comisiones,
        baseComision,
        inflacion,
        diasReposicion,
        modoInflacion,
        rentabilidad,
        modoRentabilidad,
        iva,
        cantidadUnidades,
        descuentoActivo,
        descuento,
        monedaEntrada,
        tipoDolar,
        currentRateValue
    ]);

    const displayVal = (valArs) => {
        const rate = currentRateValue;
        const val = monedaSalida === 'USD' ? (valArs / rate) : valArs;
        return formatCurrency(val, monedaSalida);
    };

    const handleCopyValue = (valArs, label) => {
        const formatted = displayVal(valArs);
        navigator.clipboard.writeText(formatted);
        setCopiedLabel(label);
        setTimeout(() => setCopiedLabel(''), 2000);
    };

    // Guardar simulación en la Nube (Firestore) y LocalStorage
    const handleGuardarSimulacion = async (e) => {
        e.preventDefault();
        if (!nombreSimulacion.trim()) return;

        const simId = Date.now();
        const nuevaSim = {
            id: simId,
            nombre: nombreSimulacion.trim(),
            costo,
            costosAdicionales,
            iibb,
            tem,
            comisiones,
            baseComision,
            inflacion,
            diasReposicion,
            modoInflacion,
            rentabilidad,
            modoRentabilidad,
            cantidadUnidades,
            descuento,
            descuentoActivo,
            monedaEntrada,
            tipoDolar,
            iva
        };

        const updated = [nuevaSim, ...simulaciones];
        setSimulaciones(updated);
        localStorage.setItem('gyr_pricing_simulations', JSON.stringify(updated));
        setNombreSimulacion('');

        if (currentUid) {
            try {
                await setDoc(doc(db, 'users', currentUid, 'pricing_simulations', String(simId)), nuevaSim);
            } catch (err) {
                console.error("Error guardando simulación en Firestore:", err);
            }
        }
    };

    const handleCargarSimulacion = (sim) => {
        setCosto(sim.costo ?? '10000');
        setCostosAdicionales(sim.costosAdicionales ?? '0');
        setIibb(sim.iibb ?? '3.5');
        setTem(sim.tem ?? '0.9');
        setComisiones(sim.comisiones ?? '15');
        setBaseComision(sim.baseComision || 'bruto');
        setInflacion(sim.inflacion ?? '2.1');
        setDiasReposicion(sim.diasReposicion ?? '30');
        setModoInflacion(sim.modoInflacion || 'costo');
        setRentabilidad(sim.rentabilidad ?? '15');
        setModoRentabilidad(sim.modoRentabilidad || 'margen_venta');
        setCantidadUnidades(sim.cantidadUnidades ?? '1');
        setDescuento(sim.descuento || '5');
        setDescuentoActivo(!!sim.descuentoActivo);
        setMonedaEntrada(sim.monedaEntrada || 'ARS');
        setTipoDolar(sim.tipoDolar || 'blue');
        setIva(sim.iva ?? '21');
    };

    const handleEliminarSimulacion = async (id, e) => {
        e.stopPropagation();
        const target = simulaciones.find(s => s.id === id);
        const updated = simulaciones.filter(s => s.id !== id);
        setSimulaciones(updated);
        localStorage.setItem('gyr_pricing_simulations', JSON.stringify(updated));

        if (currentUid) {
            try {
                const docKey = target?.docId || String(id);
                await deleteDoc(doc(db, 'users', currentUid, 'pricing_simulations', docKey));
            } catch (err) {
                console.error("Error eliminando simulación en Firestore:", err);
            }
        }
    };

    const handleExportarCSV = () => {
        if (!result) return;
        const rate = currentRateValue;
        const getVal = (valArs) => (monedaSalida === 'USD' ? (valArs / rate) : valArs).toFixed(2);

        let csvContent = "\uFEFF";
        csvContent += `Concepto,Monto Base (ARS),Monto en Moneda Salida (${monedaSalida}),Incidencia s/Neto (%),Incidencia s/Final (%)\r\n`;

        const pctNeto = (v) => result.precio_neto > 0 ? ((v / result.precio_neto) * 100).toFixed(2) + '%' : '0.00%';
        const pctFinal = (v) => result.precio_venta_sugerido > 0 ? ((v / result.precio_venta_sugerido) * 100).toFixed(2) + '%' : '0.00%';

        csvContent += `Costo de Adquisición Base,${result.costo_base.toFixed(2)},${getVal(result.costo_base)},${pctNeto(result.costo_base)},${pctFinal(result.costo_base)}\r\n`;
        if (result.costos_adicionales > 0) {
            csvContent += `Costos Directos Adicionales (Flete/Pack),${result.costos_adicionales.toFixed(2)},${getVal(result.costos_adicionales)},${pctNeto(result.costos_adicionales)},${pctFinal(result.costos_adicionales)}\r\n`;
        }
        csvContent += `Costo Total Unitario (Recupero),${result.recupero_costo.toFixed(2)},${getVal(result.recupero_costo)},${pctNeto(result.recupero_costo)},${pctFinal(result.recupero_costo)}\r\n`;
        csvContent += `Resguardo Inflacionario (${inflacion}% mensual / ${diasReposicion}d),${result.cobertura_inflacion.toFixed(2)},${getVal(result.cobertura_inflacion)},${pctNeto(result.cobertura_inflacion)},${pctFinal(result.cobertura_inflacion)}\r\n`;
        csvContent += `Costo de Reposición Total,${result.costo_reposicion_total.toFixed(2)},${getVal(result.costo_reposicion_total)},${pctNeto(result.costo_reposicion_total)},${pctFinal(result.costo_reposicion_total)}\r\n`;
        csvContent += `Impuesto IIBB (${iibb}%),${result.pago_iibb.toFixed(2)},${getVal(result.pago_iibb)},${pctNeto(result.pago_iibb)},${pctFinal(result.pago_iibb)}\r\n`;
        csvContent += `Tasa Municipal TEM (${tem}%),${result.pago_tem.toFixed(2)},${getVal(result.pago_tem)},${pctNeto(result.pago_tem)},${pctFinal(result.pago_tem)}\r\n`;
        csvContent += `Comisiones Venta (${comisiones}% s/${baseComision}),${result.pago_comisiones.toFixed(2)},${getVal(result.pago_comisiones)},${pctNeto(result.pago_comisiones)},${pctFinal(result.pago_comisiones)}\r\n`;
        csvContent += `Ganancia Neta Limpia,${result.ganancia_neta_obtenida.toFixed(2)},${getVal(result.ganancia_neta_obtenida)},${pctNeto(result.ganancia_neta_obtenida)},${pctFinal(result.ganancia_neta_obtenida)}\r\n`;
        csvContent += `Precio Neto (Base Imponible),${result.precio_neto.toFixed(2)},${getVal(result.precio_neto)},100.00%,${pctFinal(result.precio_neto)}\r\n`;
        csvContent += `IVA Débito Fiscal (${iva}%),${result.pago_iva.toFixed(2)},${getVal(result.pago_iva)},${iva}%,${pctFinal(result.pago_iva)}\r\n`;
        csvContent += `Precio Final de Venta Sugerido,${result.precio_venta_sugerido.toFixed(2)},${getVal(result.precio_venta_sugerido)},-,100.00%\r\n`;
        csvContent += `Precio de Equilibrio Final (Ganancia $0),${result.precio_equilibrio_final.toFixed(2)},${getVal(result.precio_equilibrio_final)},-,-\r\n`;
        csvContent += `ROI s/Costo Invertido,${(result.roi_sobre_costo * 100).toFixed(2)}%,-,-,-\r\n`;
        csvContent += `Recargo Comercial Neto (Markup),+${(result.markup_neto * 100).toFixed(2)}%,-,-,-\r\n`;
        csvContent += `Descuento Máximo de Equilibrio,${(result.descuento_maximo_equilibrio * 100).toFixed(2)}%,-,-,-\r\n`;

        if (descuentoActivo && result.simulacion_descuento) {
            csvContent += "\r\n--- Simulación de Descuento Comercial ---\r\n";
            csvContent += `Porcentaje Descuento Aplicado,${descuento}%,-,-,-\r\n`;
            csvContent += `Precio Neto con Descuento,${result.simulacion_descuento.precio_neto_con_descuento.toFixed(2)},${getVal(result.simulacion_descuento.precio_neto_con_descuento)},-,-\r\n`;
            csvContent += `Precio Final con Descuento,${result.simulacion_descuento.precio_con_descuento.toFixed(2)},${getVal(result.simulacion_descuento.precio_con_descuento)},-,-\r\n`;
            csvContent += `Nueva Ganancia Neta Unitaria,${result.simulacion_descuento.nueva_ganancia_neta.toFixed(2)},${getVal(result.simulacion_descuento.nueva_ganancia_neta)},-,-\r\n`;
            csvContent += `Nuevo Margen Neto s/Venta,${(result.simulacion_descuento.nueva_rentabilidad_real * 100).toFixed(2)}%,-,-,-\r\n`;
            csvContent += `Nuevo ROI s/Costo,${(result.simulacion_descuento.nuevo_roi_sobre_costo * 100).toFixed(2)}%,-,-,-\r\n`;
        }

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        saveAs(blob, `estructura_costos_precio_${nombreSimulacion || 'sugerido'}_${Date.now()}.csv`);
    };

    // Configuración del gráfico Doughnut con paleta ejecutiva
    const getChartData = () => {
        if (!result) return null;

        const labels = ['Costo Unitario', 'Resguardo Inflación', 'IIBB + Tasa Mun.', 'Comisiones'];
        const data = [
            result.recupero_costo,
            result.cobertura_inflacion,
            result.pago_iibb + result.pago_tem,
            result.pago_comisiones
        ];
        const backgroundColor = [
            '#3b82f6', // Blue - Costo
            '#f59e0b', // Amber - Inflación
            '#f97316', // Orange - Impuestos locales
            '#8b5cf6'  // Violet - Comisiones
        ];

        if (result.pago_iva > 0) {
            labels.push('IVA Débito');
            data.push(result.pago_iva);
            backgroundColor.push('#06b6d4'); // Cyan - IVA
        }

        labels.push('Ganancia Neta');
        data.push(Math.max(0, result.ganancia_neta_obtenida));
        backgroundColor.push('#10b981'); // Emerald - Ganancia

        return {
            labels,
            datasets: [{
                data,
                backgroundColor,
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 6
            }]
        };
    };

    const chartData = getChartData();
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: '#334155',
                    usePointStyle: true,
                    pointStyle: 'circle',
                    font: { family: 'Inter', size: 12, weight: '600' },
                    padding: 16
                }
            },
            tooltip: {
                backgroundColor: '#0f172a',
                padding: 12,
                cornerRadius: 10,
                titleFont: { family: 'Inter', size: 13, weight: '700' },
                bodyFont: { family: 'Inter', size: 12 },
                callbacks: {
                    label: (context) => {
                        const val = context.raw || 0;
                        const total = result?.precio_venta_sugerido || 1;
                        const pct = ((val / total) * 100).toFixed(1);
                        return ` ${context.label}: ${displayVal(val)} (${pct}% del total)`;
                    }
                }
            }
        }
    };

    // Desglose estructurado para barras de composición
    const breakdownRows = result ? [
        {
            label: 'Costo Directo Total (Recupero)',
            sub: result.costos_adicionales > 0
                ? `Base ${displayVal(result.costo_base)} + Adic. ${displayVal(result.costos_adicionales)}`
                : 'Costo de compra o producción',
            amount: result.recupero_costo,
            pctNeto: result.precio_neto > 0 ? (result.recupero_costo / result.precio_neto) * 100 : 0,
            pctTotal: result.precio_venta_sugerido > 0 ? (result.recupero_costo / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-blue-500',
            badge: 'bg-blue-50 text-blue-700 border-blue-200'
        },
        {
            label: `Resguardo Inflacionario (${ (result.inflacion_periodo * 100).toFixed(2) }%)`,
            sub: `${inflacion}% mensual • Ciclo ${diasReposicion}d (${modoInflacion === 'costo' ? 's/Costo Reposición' : 's/Precio Neto'})`,
            amount: result.cobertura_inflacion,
            pctNeto: result.precio_neto > 0 ? (result.cobertura_inflacion / result.precio_neto) * 100 : 0,
            pctTotal: result.precio_venta_sugerido > 0 ? (result.cobertura_inflacion / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-amber-500',
            badge: 'bg-amber-50 text-amber-700 border-amber-200'
        },
        {
            label: `Comisiones Comerciales (${comisiones}%)`,
            sub: baseComision === 'bruto' && Number(iva) > 0
                ? `Calculado s/Total c/IVA (${(result.comision_efectiva_neto * 100).toFixed(2)}% ef. s/Neto)`
                : 'Calculado sobre Precio Neto sin IVA',
            amount: result.pago_comisiones,
            pctNeto: result.precio_neto > 0 ? (result.pago_comisiones / result.precio_neto) * 100 : 0,
            pctTotal: result.precio_venta_sugerido > 0 ? (result.pago_comisiones / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-violet-500',
            badge: 'bg-violet-50 text-violet-700 border-violet-200'
        },
        {
            label: `Impuestos Locales (IIBB ${iibb}% + TEM ${tem}%)`,
            sub: 'Liquidados sobre Base Imponible (Precio Neto)',
            amount: result.pago_iibb + result.pago_tem,
            pctNeto: result.precio_neto > 0 ? ((result.pago_iibb + result.pago_tem) / result.precio_neto) * 100 : 0,
            pctTotal: result.precio_venta_sugerido > 0 ? ((result.pago_iibb + result.pago_tem) / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-orange-500',
            badge: 'bg-orange-50 text-orange-700 border-orange-200'
        },
        ...(result.pago_iva > 0 ? [{
            label: `IVA Débito Fiscal (${iva}%)`,
            sub: 'Impuesto trasladado al precio final',
            amount: result.pago_iva,
            pctNeto: Number(iva),
            pctTotal: result.precio_venta_sugerido > 0 ? (result.pago_iva / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-cyan-500',
            badge: 'bg-cyan-50 text-cyan-700 border-cyan-200'
        }] : []),
        {
            label: 'Ganancia Neta Limpia (Utilidad Real)',
            sub: `ROS: ${formatPercentage(result.rentabilidad_real_lograda)} s/Neto • ROI: ${formatPercentage(result.roi_sobre_costo)} s/Costo`,
            amount: result.ganancia_neta_obtenida,
            pctNeto: result.precio_neto > 0 ? (result.ganancia_neta_obtenida / result.precio_neto) * 100 : 0,
            pctTotal: result.precio_venta_sugerido > 0 ? (result.ganancia_neta_obtenida / result.precio_venta_sugerido) * 100 : 0,
            color: 'bg-emerald-500',
            badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }
    ] : [];

    return (
        <div className="space-y-6 md:space-y-7">
            {/* CABECERA Y CONTROLES DE MONEDA / EXPORTACIÓN */}
            <div className="bg-white p-5 sm:p-6 md:p-7 rounded-3xl shadow-sm border border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
                <div className="flex items-start sm:items-center gap-3.5 md:gap-4">
                    <div className="bg-indigo-50 p-3 md:p-3.5 rounded-2xl border border-indigo-100 text-indigo-600 shrink-0">
                        <Icon name="Calculator" className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                                Calculadora Financiera de Precios y Costos
                            </h3>
                            <span className="px-2.5 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Costeo + Reposición
                            </span>
                        </div>
                        <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
                            Determina precios exactos contemplando costo de reposición inflacionario, pasarelas de cobro, presión impositiva y punto de equilibrio.
                        </p>
                    </div>
                </div>

                {/* Controles de Divisa y Acciones Rápidas */}
                <div className="flex flex-wrap items-center gap-2.5 md:gap-3">
                    {/* Moneda Costo */}
                    <div className="flex items-center bg-slate-50 p-1 md:p-1.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase px-2">Costo en:</span>
                        <button
                            type="button"
                            onClick={() => setMonedaEntrada('ARS')}
                            className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-extrabold transition-all cursor-pointer ${monedaEntrada === 'ARS' ? 'bg-slate-800 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            ARS
                        </button>
                        <button
                            type="button"
                            onClick={() => setMonedaEntrada('USD')}
                            className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-extrabold transition-all cursor-pointer ${monedaEntrada === 'USD' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            USD
                        </button>
                    </div>

                    {/* Tipo de Cambio */}
                    {dollarRates.length > 0 && (
                        <select
                            value={tipoDolar}
                            onChange={e => setTipoDolar(e.target.value)}
                            className="bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 md:px-4 py-2 md:py-2.5 text-xs md:text-sm font-bold outline-none cursor-pointer focus:border-indigo-500"
                            title="Cotización para conversión ARS / USD"
                        >
                            {dollarRates.map(rate => (
                                <option key={rate.casa} value={rate.casa}>
                                    TC {rate.casa === 'contadoconliqui' ? 'CCL' : rate.casa === 'bolsa' ? 'MEP' : rate.nombre}: ${rate.venta}
                                </option>
                            ))}
                        </select>
                    )}

                    {/* Moneda Visualización */}
                    <div className="flex items-center bg-slate-50 p-1 md:p-1.5 rounded-xl border border-slate-200">
                        <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase px-2">Ver en:</span>
                        <button
                            type="button"
                            onClick={() => setMonedaSalida('ARS')}
                            className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-extrabold transition-all cursor-pointer ${monedaSalida === 'ARS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            ARS
                        </button>
                        <button
                            type="button"
                            onClick={() => setMonedaSalida('USD')}
                            className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-extrabold transition-all cursor-pointer ${monedaSalida === 'USD' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            USD
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportarCSV}
                        disabled={!result}
                        className="px-3.5 md:px-4 py-2 md:py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs md:text-sm font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Exportar planilla de costos en CSV"
                    >
                        <Icon name="Download" size={16} /> CSV
                    </button>

                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="p-2 md:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer"
                        title="Imprimir Ficha de Costos y Precios"
                    >
                        <Icon name="Printer" size={18} />
                    </button>
                </div>
            </div>

            {/* ALERTA DE ERROR MATEMÁTICO (ej. suma de porcentajes >= 100%) */}
            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 md:p-6 text-rose-800 flex items-start gap-3.5 shadow-sm">
                    <div className="p-2.5 bg-white rounded-2xl text-rose-600 shadow-xs shrink-0">
                        <Icon name="ShieldAlert" className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-extrabold uppercase tracking-wider text-xs md:text-sm">Inconsistencia en Parámetros Financieros</p>
                        <p className="text-xs sm:text-sm md:text-base font-medium mt-1 leading-relaxed">{error}</p>
                    </div>
                </div>
            )}

            {/* BANDA DE 4 KPIs EJECUTIVOS */}
            {result && (
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                    {/* KPI 1: Precio de Venta Final Sugerido */}
                    <div className="bg-gradient-to-br from-indigo-950 via-blue-950 to-slate-900 p-5 md:p-6 rounded-3xl shadow-md text-white flex flex-col justify-between relative overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-indigo-200">
                                {result.pago_iva > 0 ? 'Precio Final Sugerido (c/IVA)' : 'Precio de Venta Sugerido'}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleCopyValue(result.precio_venta_sugerido, 'final')}
                                className="text-[10px] md:text-xs font-bold bg-white/10 hover:bg-white/20 text-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                title="Copiar precio sugerido"
                            >
                                <Icon name={copiedLabel === 'final' ? 'Check' : 'Copy'} size={12} />
                                {copiedLabel === 'final' ? 'Copiado' : 'Copiar'}
                            </button>
                        </div>
                        <p className="text-2xl sm:text-3xl xl:text-4xl font-black tracking-tight mt-2.5 font-mono">
                            {displayVal(result.precio_venta_sugerido)}
                        </p>
                        <div className="text-[11px] md:text-xs lg:text-sm text-indigo-200/90 font-medium mt-2 flex items-center justify-between flex-wrap gap-1">
                            <span>Neto s/IVA: <strong className="text-white font-mono">{displayVal(result.precio_neto)}</strong></span>
                            {result.pago_iva > 0 && (
                                <span className="text-[10px] md:text-xs bg-white/10 px-2 py-0.5 rounded-md font-bold">IVA {iva}%</span>
                            )}
                        </div>
                    </div>

                    {/* KPI 2: Ganancia Neta Limpia y Retornos (ROS y ROI) */}
                    <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500">Ganancia Neta Unitaria</span>
                            <span className="text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                ROS {formatPercentage(result.rentabilidad_real_lograda)}
                            </span>
                        </div>
                        <p className="text-2xl sm:text-3xl xl:text-4xl font-black text-emerald-600 mt-2.5 font-mono">
                            +{displayVal(result.ganancia_neta_obtenida)}
                        </p>
                        <p className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-2">
                            Retorno s/Costo (ROI): <strong className="text-slate-800">+{formatPercentage(result.roi_sobre_costo)}</strong>
                        </p>
                    </div>

                    {/* KPI 3: Precio de Equilibrio y Descuento Máximo */}
                    <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500">Precio Mínimo Equilibrio</span>
                            <span className="text-[10px] md:text-xs font-black px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200" title="Descuento máximo antes de perder capital de reposición">
                                Dto. Máx {(result.descuento_maximo_equilibrio * 100).toFixed(1)}%
                            </span>
                        </div>
                        <p className="text-2xl sm:text-3xl xl:text-4xl font-black text-slate-800 mt-2.5 font-mono">
                            {displayVal(result.precio_equilibrio_final)}
                        </p>
                        <p className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-2">
                            Cubre costo + reposición ({displayVal(result.costo_reposicion_total)}) e impuestos
                        </p>
                    </div>

                    {/* KPI 4: Markup Comercial y Factor Multiplicador */}
                    <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-500">Recargo s/Costo (Markup)</span>
                            <Icon name="Award" size={18} className="text-indigo-500" />
                        </div>
                        <p className="text-2xl sm:text-3xl xl:text-4xl font-black text-indigo-600 mt-2.5 font-mono">
                            +{(result.markup_neto * 100).toFixed(1)}% <span className="text-xs md:text-sm font-bold text-slate-400 font-sans">neto</span>
                        </p>
                        <p className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-2">
                            Factor Neto: <strong className="text-slate-800">x{result.multiplicador_neto.toFixed(2)}</strong> • Final: <strong className="text-slate-800">x{result.multiplicador_final.toFixed(2)}</strong>
                        </p>
                    </div>
                </section>
            )}

            {/* CUERPO PRINCIPAL: PARÁMETROS (7 COL) + COMPOSICIÓN Y DESGLOSE (5 COL) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-7 items-start">
                {/* COLUMNA IZQUIERDA: FORMULARIO ESTRUCTURADO DE COSTOS E IMPUESTOS */}
                <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-7 md:space-y-8 no-print">
                    {/* 1. Estructura de Costos y Reposición */}
                    <div className="space-y-4 md:space-y-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                            <h4 className="text-sm md:text-base lg:text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <Icon name="Package" size={18} className="text-blue-600" />
                                1. Costos Directos y Reposición por Inflación
                            </h4>
                            {result && (
                                <span className="text-xs md:text-sm font-bold text-slate-500">
                                    Costo Reposición: <strong className="text-slate-800 font-mono">{displayVal(result.costo_reposicion_total)}</strong>
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                            {/* Costo de Adquisición */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-blue-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Costo de Adquisición / Producción ({monedaEntrada})
                                </label>
                                <div className="flex items-center">
                                    <span className="text-blue-600 font-black mr-2 text-sm md:text-lg">{monedaEntrada === 'ARS' ? '$' : 'U$S'}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={costo}
                                        onChange={e => setCosto(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                        placeholder="10000"
                                    />
                                </div>
                            </div>

                            {/* Costos Adicionales Fijos por Unidad */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-blue-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Flete, Packaging o Adicionales ({monedaEntrada})
                                </label>
                                <div className="flex items-center">
                                    <span className="text-slate-400 font-black mr-2 text-sm md:text-lg">{monedaEntrada === 'ARS' ? '$' : 'U$S'}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={costosAdicionales}
                                        onChange={e => setCostosAdicionales(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Inflación y Ciclo de Reposición */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 pt-1">
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-amber-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Inflación Mensual Est.
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={inflacion}
                                        onChange={e => setInflacion(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-amber-600 font-black text-sm md:text-lg">%</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-amber-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Ciclo Reposición / Cobro
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={diasReposicion}
                                        onChange={e => setDiasReposicion(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-slate-400 font-bold text-xs md:text-sm">días</span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Base Resguardo Inflación
                                </label>
                                <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setModoInflacion('costo')}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${modoInflacion === 'costo' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                        title="Indexa el costo de reposición del producto según los días de rotación"
                                    >
                                        s/Costo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setModoInflacion('precio')}
                                        className={`py-1.5 px-2 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${modoInflacion === 'precio' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                        title="Calcula el resguardo como porcentaje sobre el precio de venta neto"
                                    >
                                        s/Precio
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Estrategia de Rentabilidad y Lote */}
                    <div className="space-y-4 md:space-y-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                            <h4 className="text-sm md:text-base lg:text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <Icon name="Target" size={18} className="text-emerald-600" />
                                2. Objetivo de Rentabilidad y Volumen
                            </h4>
                            <div className="flex items-center bg-slate-100 p-1 md:p-1.5 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setModoRentabilidad('margen_venta')}
                                    className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${modoRentabilidad === 'margen_venta' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    Margen s/Venta (ROS)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModoRentabilidad('markup_costo')}
                                    className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${modoRentabilidad === 'markup_costo' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    Retorno s/Costo (ROI)
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                            {/* Rentabilidad Esperada */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-emerald-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    {modoRentabilidad === 'margen_venta' ? 'Margen Neto s/Venta Deseado' : 'Retorno Limpio s/Costo Deseado'}
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={rentabilidad}
                                        onChange={e => setRentabilidad(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-emerald-600 font-black text-sm md:text-lg">%</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 md:gap-2 mt-2.5 pt-2.5 border-t border-slate-200/60">
                                    {[10, 15, 20, 30, 50].map(pct => (
                                        <button
                                            key={pct}
                                            type="button"
                                            onClick={() => setRentabilidad(String(pct))}
                                            className={`text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${Number(rentabilidad) === pct ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Cantidad de Unidades / Lote */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-indigo-500 transition-all flex flex-col justify-between">
                                <div>
                                    <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                        Cantidad / Lote a Cotizar (Unidades)
                                    </label>
                                    <div className="flex items-center">
                                        <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={cantidadUnidades}
                                            onChange={e => setCantidadUnidades(e.target.value)}
                                            onFocus={e => e.target.select()}
                                            className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                        />
                                        <span className="text-slate-400 font-bold text-xs md:text-sm">unid.</span>
                                    </div>
                                </div>
                                {result && (
                                    <p className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-2.5 pt-2.5 border-t border-slate-200/60">
                                        Utilidad del lote ({result.cantidad_unidades} u.): <strong className="text-emerald-600 font-mono">+{displayVal(result.lote.ganancia_neta_lote)}</strong>
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. Carga Impositiva y Comisiones de Plataforma */}
                    <div className="space-y-4 md:space-y-5">
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
                            <h4 className="text-sm md:text-base lg:text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <Icon name="Scale" size={18} className="text-orange-500" />
                                3. Impuestos y Comisiones de Pasarela
                            </h4>
                            <div className="flex items-center bg-slate-100 p-1 md:p-1.5 rounded-xl">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 px-2">Comisión aplica s/:</span>
                                <button
                                    type="button"
                                    onClick={() => setBaseComision('bruto')}
                                    className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${baseComision === 'bruto' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                    title="Plataformas como Mercado Libre, Mercado Pago y tarjetas cobran su % sobre el Precio Final con IVA incluido"
                                >
                                    Total c/IVA (Real)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setBaseComision('neto')}
                                    className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-extrabold transition-all cursor-pointer ${baseComision === 'neto' ? 'bg-white text-violet-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                    title="Calcula la comisión únicamente sobre el Precio Neto sin IVA"
                                >
                                    Neto s/IVA
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 md:gap-4">
                            {/* Alícuota IVA */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-indigo-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Alícuota IVA
                                </label>
                                <select
                                    value={iva}
                                    onChange={e => setIva(e.target.value)}
                                    className="w-full bg-transparent border-none text-slate-800 font-black text-sm md:text-base lg:text-lg outline-none cursor-pointer"
                                >
                                    <option value="0">0% (Exento/Mono)</option>
                                    <option value="10.5">10.5% (Reducido)</option>
                                    <option value="21">21% (General)</option>
                                    <option value="27">27% (Incrementado)</option>
                                </select>
                            </div>

                            {/* Comisión Plataforma / Tarjeta */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-violet-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Comisión Venta
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        value={comisiones}
                                        onChange={e => setComisiones(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-violet-600 font-black text-sm md:text-lg">%</span>
                                </div>
                            </div>

                            {/* Ingresos Brutos IIBB */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-orange-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Ingresos Brutos
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={iibb}
                                        onChange={e => setIibb(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-orange-600 font-black text-sm md:text-lg">%</span>
                                </div>
                            </div>

                            {/* Tasa Municipal TEM */}
                            <div className="bg-slate-50 p-3.5 md:p-4 rounded-2xl border border-slate-200/80 focus-within:bg-white focus-within:border-orange-500 transition-all">
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                    Tasa Municipal
                                </label>
                                <div className="flex items-center">
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        value={tem}
                                        onChange={e => setTem(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-full bg-transparent border-none text-slate-800 font-black text-base md:text-xl lg:text-2xl outline-none font-mono"
                                    />
                                    <span className="text-orange-600 font-black text-sm md:text-lg">%</span>
                                </div>
                            </div>
                        </div>

                        {result && baseComision === 'bruto' && Number(iva) > 0 && Number(comisiones) > 0 && (
                            <div className="bg-violet-50/70 border border-violet-200/80 rounded-2xl px-4 py-3 text-xs md:text-sm text-violet-800 flex items-center gap-2.5">
                                <Icon name="Info" size={16} className="text-violet-600 shrink-0" />
                                <span>
                                    Al cobrarse el <strong>{comisiones}%</strong> sobre el precio final con IVA ({iva}%), el costo real de comisión equivale al <strong>{(result.comision_efectiva_neto * 100).toFixed(2)}%</strong> de tu Precio Neto.
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* COLUMNA DERECHA: GRÁFICO Y DESGLOSE CONTABLE DEL PRECIO */}
                {result && (
                    <div className="lg:col-span-5 space-y-6">
                        {/* Tarjeta Gráfico + Cuadro de Composición */}
                        <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-slate-100 space-y-6">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                    <h4 className="text-base md:text-lg lg:text-xl font-black text-slate-800 tracking-tight">Estructura del Precio Final</h4>
                                    <p className="text-xs md:text-sm text-slate-500 font-medium">Distribución de cada peso cobrado al cliente</p>
                                </div>
                                {onScheduleInCashFlow && (
                                    <button
                                        type="button"
                                        onClick={() => onScheduleInCashFlow({
                                            type: 'ingreso',
                                            category: 'Ventas Proyectadas',
                                            description: `Venta proyectada ${nombreSimulacion ? `(${nombreSimulacion})` : ''} x${result.cantidad_unidades} u.`,
                                            amount: result.lote.facturacion_final_lote,
                                            date: new Date().toISOString().split('T')[0],
                                            periodicity: 'once'
                                        })}
                                        className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs md:text-sm font-bold transition-colors cursor-pointer flex items-center gap-1.5 no-print"
                                        title="Agendar el ingreso proyectado en el Flujo de Fondos"
                                    >
                                        <Icon name="Calendar" size={15} /> Agendar en Cash Flow
                                    </button>
                                )}
                            </div>

                            <div className="h-[220px] md:h-[260px] w-full relative">
                                <Doughnut data={chartData} options={chartOptions} />
                            </div>

                            {/* Lista de Rubros con Barras de Participación */}
                            <div className="space-y-3.5 md:space-y-4 pt-3 border-t border-slate-100">
                                {breakdownRows.map((row, idx) => (
                                    <div key={idx} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs md:text-sm gap-2">
                                            <div className="min-w-0">
                                                <span className="font-bold text-slate-800 block truncate">{row.label}</span>
                                                <span className="text-[10px] md:text-xs text-slate-500 block truncate">{row.sub}</span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="font-black text-slate-800 font-mono text-xs md:text-sm lg:text-base block">{displayVal(row.amount)}</span>
                                                <span className="text-[10px] md:text-xs font-bold text-slate-400">
                                                    {row.pctTotal.toFixed(1)}% del total
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${row.color}`}
                                                style={{ width: `${Math.min(100, Math.max(2, row.pctTotal))}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Resumen Lote si cantidad > 1 */}
                            {result.cantidad_unidades > 1 && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 grid grid-cols-3 gap-2 text-center">
                                    <div>
                                        <span className="text-[9px] md:text-xs font-bold text-slate-400 uppercase block">Costo Lote ({result.cantidad_unidades}u)</span>
                                        <span className="text-xs md:text-sm font-black text-slate-700 font-mono">{displayVal(result.lote.costo_total_lote)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] md:text-xs font-bold text-slate-400 uppercase block">Facturación Lote</span>
                                        <span className="text-xs md:text-sm font-black text-indigo-700 font-mono">{displayVal(result.lote.facturacion_final_lote)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] md:text-xs font-bold text-slate-400 uppercase block">Ganancia Lote</span>
                                        <span className="text-xs md:text-sm font-black text-emerald-600 font-mono">+{displayVal(result.lote.ganancia_neta_lote)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* SIMULADOR INTERACTIVO DE DESCUENTOS Y PROMOCIONES */}
            {result && (
                <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-3">
                            <input
                                type="checkbox"
                                id="toggle-discount-sim"
                                checked={descuentoActivo}
                                onChange={e => setDescuentoActivo(e.target.checked)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 md:w-5 md:h-5 cursor-pointer no-print"
                            />
                            <div>
                                <label htmlFor="toggle-discount-sim" className="text-base md:text-lg font-black text-slate-800 cursor-pointer flex items-center gap-2">
                                    Simulador de Descuentos Comerciales y Punto de Equilibrio
                                </label>
                                <p className="text-xs md:text-sm text-slate-500 font-medium">
                                    Evalúa el impacto real de una promoción manteniendo intacto el costo de reposición inflacionario.
                                </p>
                            </div>
                        </div>

                        {descuentoActivo && (
                            <div className="flex flex-wrap items-center gap-2 md:gap-2.5 no-print">
                                {[5, 10, 15, 20].map(d => (
                                    <button
                                        key={d}
                                        type="button"
                                        onClick={() => setDescuento(String(d))}
                                        className={`px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-bold transition-colors cursor-pointer ${Number(descuento) === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                    >
                                        -{d}%
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setDescuento((result.descuento_maximo_equilibrio * 100).toFixed(2))}
                                    className="px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-lg text-xs md:text-sm font-bold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
                                    title="Aplicar el descuento máximo donde la Ganancia Neta es $0.00"
                                >
                                    Máx Equilibrio ({(result.descuento_maximo_equilibrio * 100).toFixed(1)}%)
                                </button>
                                <div className="flex items-center bg-slate-50 px-3 py-1 md:py-1.5 rounded-xl border border-slate-200">
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.5"
                                        value={descuento}
                                        onChange={e => setDescuento(e.target.value)}
                                        onFocus={e => e.target.select()}
                                        className="w-14 md:w-16 bg-transparent border-none text-slate-800 font-black text-sm md:text-base text-right outline-none font-mono mr-1"
                                    />
                                    <span className="text-indigo-600 font-black text-xs md:text-sm">%</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {descuentoActivo && result.simulacion_descuento && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                            <div className="p-4 md:p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest block">Precio Final Promocional</span>
                                <span className="text-xl md:text-2xl lg:text-3xl font-black text-slate-800 font-mono mt-1.5 block">
                                    {displayVal(result.simulacion_descuento.precio_con_descuento)}
                                </span>
                                <span className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-1.5 block">
                                    Ahorro cliente: <strong className="text-indigo-600 font-mono">-{displayVal(result.simulacion_descuento.ahorro_cliente)}</strong>
                                </span>
                            </div>

                            <div className="p-4 md:p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest block">Nueva Ganancia Neta Unitaria</span>
                                <span className={`text-xl md:text-2xl lg:text-3xl font-black font-mono mt-1.5 block ${result.simulacion_descuento.nueva_ganancia_neta < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {result.simulacion_descuento.nueva_ganancia_neta >= 0 ? '+' : ''}{displayVal(result.simulacion_descuento.nueva_ganancia_neta)}
                                </span>
                                <span className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-1.5 block">
                                    {result.cantidad_unidades > 1
                                        ? `Total Lote: ${displayVal(result.simulacion_descuento.nueva_ganancia_lote)}`
                                        : `Impuestos + Comis.: ${displayVal(result.simulacion_descuento.pago_iibb_desc + result.simulacion_descuento.pago_tem_desc + result.simulacion_descuento.pago_comisiones_desc)}`}
                                </span>
                            </div>

                            <div className="p-4 md:p-5 rounded-2xl bg-slate-50 border border-slate-100">
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest block">Nuevo Margen s/Venta (ROS)</span>
                                <span className={`text-xl md:text-2xl lg:text-3xl font-black font-mono mt-1.5 block ${result.simulacion_descuento.nueva_rentabilidad_real < 0 ? 'text-rose-600' : result.simulacion_descuento.nueva_rentabilidad_real < result.rentabilidad_real_lograda * 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                    {formatPercentage(result.simulacion_descuento.nueva_rentabilidad_real)}
                                </span>
                                <span className="text-[11px] md:text-xs lg:text-sm text-slate-500 font-medium mt-1.5 block">
                                    Antes del dto.: {formatPercentage(result.rentabilidad_real_lograda)}
                                </span>
                            </div>

                            <div className={`p-4 md:p-5 rounded-2xl border ${result.simulacion_descuento.nueva_ganancia_neta < 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-100'}`}>
                                <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest block">Nuevo Retorno s/Costo (ROI)</span>
                                <span className={`text-xl md:text-2xl lg:text-3xl font-black font-mono mt-1.5 block ${result.simulacion_descuento.nuevo_roi_sobre_costo < 0 ? 'text-rose-600' : 'text-indigo-600'}`}>
                                    {formatPercentage(result.simulacion_descuento.nuevo_roi_sobre_costo)}
                                </span>
                                <span className="text-[11px] md:text-xs lg:text-sm font-bold mt-1.5 block">
                                    {result.simulacion_descuento.nueva_ganancia_neta < 0 ? (
                                        <span className="text-rose-600">¡Descapitalización! Supera dto. equilibrio</span>
                                    ) : Math.abs(result.simulacion_descuento.nueva_ganancia_neta) < 0.05 ? (
                                        <span className="text-amber-700">En Punto de Equilibrio Exacto</span>
                                    ) : (
                                        <span className="text-emerald-700">Reposición de stock asegurada</span>
                                    )}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ESCENARIOS Y SIMULACIONES GUARDADAS (Nube + Local) */}
            <div className="bg-white p-6 sm:p-7 rounded-3xl shadow-sm border border-slate-100 space-y-4 no-print">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-sm md:text-base lg:text-lg font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <Icon name="Archive" size={18} className="text-indigo-600" />
                            Escenarios y Listas de Precios Guardadas ({simulaciones.length})
                        </h4>
                        <p className="text-xs md:text-sm text-slate-500 font-medium">
                            Guarda configuraciones por producto o línea para recargarlas con un clic.
                        </p>
                    </div>

                    <form onSubmit={handleGuardarSimulacion} className="flex items-center gap-2.5 w-full sm:w-auto">
                        <input
                            type="text"
                            value={nombreSimulacion}
                            onChange={e => setNombreSimulacion(e.target.value)}
                            placeholder="Nombre del producto o escenario..."
                            className="flex-1 sm:w-72 px-3.5 md:px-4 py-2 md:py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl text-xs md:text-sm font-bold text-slate-800 outline-none transition-all"
                        />
                        <button
                            type="submit"
                            disabled={!nombreSimulacion.trim()}
                            className="px-4 md:px-5 py-2 md:py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs md:text-sm font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                            <Icon name="Save" size={15} /> Guardar
                        </button>
                    </form>
                </div>

                {simulaciones.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
                        {simulaciones.map(sim => (
                            <div
                                key={sim.id}
                                onClick={() => handleCargarSimulacion(sim)}
                                className="flex items-center justify-between p-3.5 md:p-4 rounded-2xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 hover:border-indigo-200 cursor-pointer transition-all group"
                            >
                                <div className="min-w-0 pr-2">
                                    <p className="text-xs md:text-sm font-black text-slate-800 group-hover:text-indigo-700 truncate">
                                        {sim.nombre}
                                    </p>
                                    <p className="text-[10px] md:text-xs font-bold text-slate-500 mt-0.5">
                                        Costo: {formatCurrency(parseFloat(sim.costo), sim.monedaEntrada)} • Obj: {sim.rentabilidad}% • IVA: {sim.iva || 0}%
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => handleEliminarSimulacion(sim.id, e)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                                    title="Eliminar escenario"
                                >
                                    <Icon name="Trash2" size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PricingCalculatorForm;
