import React, { useState, useEffect, useMemo } from 'react';
import { db, getSecurityHeaders } from '../../firebase';
import { 
  collection, 
  doc,
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';

const formatARS = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(val) || 0);

const formatAnyDate = (dateVal) => {
    if (!dateVal) return 'N/A';
    if (typeof dateVal?.toDate === 'function') {
        return dateVal.toDate().toLocaleDateString('es-AR');
    }
    if (typeof dateVal === 'string') {
        const clean = dateVal.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return clean;
    }
    return 'N/A';
};

const getTimestampMs = (dateVal) => {
    if (!dateVal) return Number.MAX_SAFE_INTEGER;
    if (typeof dateVal?.toDate === 'function') return dateVal.toDate().getTime();
    if (typeof dateVal === 'string') {
        const ms = new Date(dateVal).getTime();
        return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
    }
    return Number.MAX_SAFE_INTEGER;
};

const AIAnalyzer = () => {
    const [operations, setOperations] = useState([]);
    const [cheques, setCheques] = useState([]);
    const [cashflowItems, setCashflowItems] = useState([]);
    const [financeConfig, setFinanceConfig] = useState({
        incomeGoal: 0,
        expenseBudget: 0,
        initialCashBalance: 0,
        safetyReserve: 0
    });
    const [facturasVenta, setFacturasVenta] = useState([]);
    const [pagosRecibidos, setPagosRecibidos] = useState([]);
    const [facturasCompra, setFacturasCompra] = useState([]);
    const [pagosRealizados, setPagosRealizados] = useState([]);

    const { user } = useAuth();
    const { targetUserId, activeEntity, isViewingClient } = useClientSelection();
    const currentUid = targetUserId || user?.uid;
    
    useEffect(() => {
        if (!currentUid) return;

        const qOps = query(collection(db, 'users', currentUid, 'operations'), orderBy("fechaEmision", "desc"), limit(50));
        const unsubOps = onSnapshot(qOps, (snapshot) => {
            setOperations(snapshot.docs.map(d => d.data()));
        }, () => setOperations([]));

        const qCheques = query(collection(db, 'users', currentUid, 'cheques'));
        const unsubCheques = onSnapshot(qCheques, (snapshot) => {
            setCheques(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setCheques([]));

        const qCashflow = query(collection(db, 'users', currentUid, 'cashflow_items'), orderBy("date", "asc"), limit(20));
        const unsubCashflow = onSnapshot(qCashflow, (snapshot) => {
            setCashflowItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setCashflowItems([]));

        const configRef = doc(db, 'users', currentUid, 'settings', 'finance_config');
        const unsubConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const d = docSnap.data() || {};
                setFinanceConfig({
                    incomeGoal: Number(d.incomeGoal) || 0,
                    expenseBudget: Number(d.expenseBudget) || 0,
                    initialCashBalance: Number(d.initialCashBalance) || 0,
                    safetyReserve: Number(d.safetyReserve) || 0
                });
            } else {
                setFinanceConfig({
                    incomeGoal: 0,
                    expenseBudget: 0,
                    initialCashBalance: 0,
                    safetyReserve: 0
                });
            }
        }, () => {});

        const unsubFv = onSnapshot(collection(db, 'users', currentUid, 'facturasVenta'), (snap) => {
            setFacturasVenta(snap.docs.map(d => d.data()));
        }, () => setFacturasVenta([]));

        const unsubPr = onSnapshot(collection(db, 'users', currentUid, 'pagosRecibidos'), (snap) => {
            setPagosRecibidos(snap.docs.map(d => d.data()));
        }, () => setPagosRecibidos([]));

        const unsubFc = onSnapshot(collection(db, 'users', currentUid, 'facturasCompra'), (snap) => {
            setFacturasCompra(snap.docs.map(d => d.data()));
        }, () => setFacturasCompra([]));

        const unsubPReal = onSnapshot(collection(db, 'users', currentUid, 'pagosRealizados'), (snap) => {
            setPagosRealizados(snap.docs.map(d => d.data()));
        }, () => setPagosRealizados([]));

        return () => {
            unsubOps();
            unsubCheques();
            unsubCashflow();
            unsubConfig();
            unsubFv();
            unsubPr();
            unsubFc();
            unsubPReal();
        };
    }, [currentUid]);

    const chequesSummary = useMemo(() => {
        const estadosActivos = ['En Cartera', 'Depositado', 'Emitido'];
        const activeCheques = cheques.filter(c => estadosActivos.includes(c.estado));
        let enCartera = 0;
        let depositados = 0;
        let emitidosACubrir = 0;

        activeCheques.forEach(c => {
            const monto = Number(c.monto) || 0;
            if (c.estado === 'En Cartera') enCartera += monto;
            else if (c.estado === 'Depositado') depositados += monto;
            else if (c.estado === 'Emitido') emitidosACubrir += monto;
        });

        const nextCheques = [...activeCheques]
            .sort((a, b) => getTimestampMs(a.fechaVencimiento) - getTimestampMs(b.fechaVencimiento))
            .slice(0, 15);

        return {
            activeCount: activeCheques.length,
            enCartera,
            depositados,
            emitidosACubrir,
            nextCheques
        };
    }, [cheques]);

    const cuentasCorrientesSummary = useMemo(() => {
        const totalFacturasVenta = facturasVenta.reduce((acc, f) => acc + (Number(f.montoTotal) || 0), 0);
        const totalPagosRecibidos = pagosRecibidos.reduce((acc, p) => acc + (Number(p.montoPagado) || 0), 0);
        const saldoPorCobrar = totalFacturasVenta - totalPagosRecibidos;

        const totalFacturasCompra = facturasCompra.reduce((acc, f) => acc + (Number(f.montoTotal) || 0), 0);
        const totalPagosRealizados = pagosRealizados.reduce((acc, p) => acc + (Number(p.montoPagado) || 0), 0);
        const saldoPorPagar = totalFacturasCompra - totalPagosRealizados;

        const hasMovements =
            facturasVenta.length > 0 ||
            pagosRecibidos.length > 0 ||
            facturasCompra.length > 0 ||
            pagosRealizados.length > 0;

        return {
            totalFacturasVenta,
            totalPagosRecibidos,
            saldoPorCobrar,
            totalFacturasCompra,
            totalPagosRealizados,
            saldoPorPagar,
            hasMovements
        };
    }, [facturasVenta, pagosRecibidos, facturasCompra, pagosRealizados]);

    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAnalysis = async () => {
        if (!prompt.trim()) {
            setError('Por favor, escribe una pregunta.');
            return;
        }
        const hasAnyData =
            operations.length > 0 ||
            cheques.length > 0 ||
            cashflowItems.length > 0 ||
            cuentasCorrientesSummary.hasMovements;

        if (!hasAnyData) {
            setError(`No hay operaciones, cheques, flujos ni movimientos de cuenta corriente registrados para analizar en ${activeEntity?.displayName || activeEntity?.name || 'esta cuenta'}.`);
            return;
        }

        setLoading(true);
        setResult('');
        setError('');

        const apiUrl = 'https://us-central1-gyrconsultores-82422.cloudfunctions.net/secureGeminiCall';

        const metasBlock = [
            `1. METAS Y LIQUIDEZ CONFIGURADA:`,
            `- Meta mensual de ingresos: ${formatARS(financeConfig.incomeGoal)}`,
            `- Presupuesto mensual de gastos: ${formatARS(financeConfig.expenseBudget)}`,
            `- Saldo inicial de caja: ${formatARS(financeConfig.initialCashBalance)}`,
            `- Reserva de seguridad definida: ${formatARS(financeConfig.safetyReserve)}`
        ].join('\n');

        const ctasCtesBlock = [
            `2. RESUMEN DE CUENTAS CORRIENTES (DEUDORES Y PROVEEDORES):`,
            `- Clientes (Deudores): Total Facturado ${formatARS(cuentasCorrientesSummary.totalFacturasVenta)} | Total Cobrado ${formatARS(cuentasCorrientesSummary.totalPagosRecibidos)} | Saldo Neto por Cobrar: ${formatARS(cuentasCorrientesSummary.saldoPorCobrar)}`,
            `- Proveedores: Total Compras Facturadas ${formatARS(cuentasCorrientesSummary.totalFacturasCompra)} | Total Pagado ${formatARS(cuentasCorrientesSummary.totalPagosRealizados)} | Saldo Neto por Pagar: ${formatARS(cuentasCorrientesSummary.saldoPorPagar)}`
        ].join('\n');

        const chequesDetalle = chequesSummary.nextCheques.length > 0
            ? chequesSummary.nextCheques.map(c =>
                `  * Vto ${formatAnyDate(c.fechaVencimiento || c.fechaPagoStr)}: [${c.estado}] ${formatARS(c.monto)} - ${c.terceroNombre || 'Tercero'} (N° ${c.numero || 'eCheq'})`
            ).join('\n')
            : '  * Sin cheques activos próximos.';

        const chequesBlock = [
            `3. CARTERA DE CHEQUES Y VALORES (eCheq / Físicos):`,
            `- Total En Cartera (a depositar): ${formatARS(chequesSummary.enCartera)}`,
            `- Total Depositados (en clearing): ${formatARS(chequesSummary.depositados)}`,
            `- Total Emitidos (a cubrir): ${formatARS(chequesSummary.emitidosACubrir)}`,
            `- Próximos ${chequesSummary.nextCheques.length} cheques activos:`,
            chequesDetalle
        ].join('\n');

        const cashflowDetalle = cashflowItems.length > 0
            ? cashflowItems.map(cf =>
                `- ${formatAnyDate(cf.date)}: [${cf.type || 'movimiento'} | ${cf.status || 'pending'}] ${formatARS(cf.amount)} - ${cf.category || 'General'}: ${cf.description || ''}`
            ).join('\n')
            : '- Sin compromisos proyectados en Cash Flow.';

        const cashflowBlock = [
            `4. COMPROMISOS DE CASH FLOW PROYECTADO (hasta 20 registros):`,
            cashflowDetalle
        ].join('\n');

        const operationsContext = operations.length > 0
            ? operations.map(op =>
                `- ${formatAnyDate(op.fechaEmision)}: ${op.type} de ${(Number(op.amount) || 0).toFixed(2)} ARS (${op.description || 'Sin descripción'})`
            ).join('\n')
            : '- Sin operaciones registradas en el período reciente.';

        const operationsBlock = [
            `5. ÚLTIMAS OPERACIONES REGISTRADAS (${operations.length} registros):`,
            operationsContext
        ].join('\n');

        const entityLabel = isViewingClient
            ? `el cliente "${activeEntity?.displayName || activeEntity?.name}" (CUIT: ${activeEntity?.cuit || 'S/D'})`
            : 'el Estudio Contable "GyR Consultores"';

        const systemPrompt = `Actúa como un director financiero (CFO) y asesor contable argentino experto, conciso y accionable. Estás analizando la situación integral 360° de ${entityLabel} combinando operaciones, metas presupuestarias, cuentas corrientes de clientes y proveedores, cartera de cheques/eCheq y compromisos de cash flow. Responde en español basándote únicamente en los datos provistos. Si falta algún dato puntual para responder, indícalo con claridad. Formatea tu respuesta de forma clara con viñetas y conclusiones concretas.`;

        const rawFullPrompt = `Contexto financiero integral 360° para ${entityLabel}:\n\n${metasBlock}\n\n${ctasCtesBlock}\n\n${chequesBlock}\n\n${cashflowBlock}\n\n${operationsBlock}\n\nPor favor, responde a la siguiente consulta: "${prompt}"`;
        const fullPrompt = rawFullPrompt.slice(0, 45000);

        const payload = {
            contents: [{ parts: [{ text: fullPrompt }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        try {
            const headers = await getSecurityHeaders();
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 const errorBody = await response.json().catch(() => ({}));
                 console.error("Error response from backend:", errorBody);
                 throw new Error(`Error del servidor: ${response.status}`);
            }

            const data = await response.json();
            
            const text = data.text;

            if (text) {
                setResult(text);
            } else {
                throw new Error("No se recibió una respuesta válida de la IA.");
            }
        } catch (err) {
            console.error("Error calling the secure backend:", err);
            setError("Hubo un error al contactar al asistente de IA. Por favor, intenta de nuevo más tarde.");
        } finally {
            setLoading(false);
        }
    };

    const quickPrompts = [
        { label: '📊 Diagnóstico 360°', text: 'Realiza un resumen ejecutivo integral combinando ingresos/egresos, metas presupuestarias, saldos de cuentas corrientes y posición de cheques.' },
        { label: '🏦 Cheques y Liquidez', text: 'Analiza los cheques emitidos a cubrir frente a los cheques en cartera, el flujo de caja y la reserva de seguridad. ¿Hay riesgo de liquidez próximo?' },
        { label: '🤝 Cobranzas vs. Proveedores', text: 'Evalúa los saldos pendientes por cobrar a clientes frente a la deuda con proveedores y recomienda prioridades de cobranza y pago.' },
        { label: '💡 Optimización y Costos', text: 'Identifica los mayores egresos registrados frente al presupuesto mensual y dame 3 acciones concretas para mejorar el margen neto.' }
    ];

    return (
        <div className="w-full bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-blue-100/70 flex flex-col justify-between">
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight flex items-center">
                        <Icon name="Sparkles" className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-blue-600" />
                        Análisis Financiero IA 360°
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            {operations.length} ops.
                        </span>
                        <span className="text-[11px] font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                            {chequesSummary.activeCount} cheques activos
                        </span>
                        <span className="text-[11px] font-bold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                            Ctas. Ctes. {cuentasCorrientesSummary.hasMovements ? 'activas' : 'sin mov.'} / Cash Flow ({cashflowItems.length})
                        </span>
                        {isViewingClient ? (
                            <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                                Auditando a: {activeEntity?.name || activeEntity?.displayName}
                            </span>
                        ) : (
                            <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-700 rounded-full">
                                Estudio Propio (GyR)
                            </span>
                        )}
                    </div>
                </div>

                <p className="text-xs text-slate-400 font-medium mb-3">
                    Selecciona una consulta estratégica multi-módulo o escribe tu pregunta personalizada sobre operaciones, cheques, cuentas corrientes y cash flow:
                </p>

                {/* Chips de consulta rápida */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {quickPrompts.map((chip, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => {
                                setPrompt(chip.text);
                                setError('');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                prompt === chip.text
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-slate-50 hover:bg-blue-50/60 text-slate-700 hover:text-blue-700 border-slate-200/80'
                            }`}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={isViewingClient 
                        ? `Ej: ¿Cómo está la liquidez de ${activeEntity?.name || activeEntity?.displayName} considerando cheques emitidos y saldos por cobrar?`
                        : "Ej: ¿Cuál es la exposición en cheques a cubrir este mes frente al saldo proyectado de caja?"
                    }
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none text-sm font-medium text-gray-800 transition-all resize-none"
                    rows="3"
                />
                <button
                    onClick={handleAnalysis}
                    disabled={loading}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-700 to-sky-700 text-white rounded-2xl hover:from-blue-800 hover:to-sky-800 disabled:opacity-50 transition-all shadow-md shadow-blue-500/20 font-black text-xs uppercase tracking-widest cursor-pointer"
                >
                    {loading ? 'Analizando ecosistema financiero...' : `Analizar Finanzas 360° de ${isViewingClient ? (activeEntity?.name || activeEntity?.displayName) : 'Mi Estudio'}`}
                </button>
                {error && <p className="text-sm text-red-600 text-center font-medium">{error}</p>}
                {loading && (
                    <div className="text-center text-gray-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                        <p className="text-xs font-semibold">El asistente está procesando operaciones, cheques, cuentas corrientes y cash flow...</p>
                    </div>
                )}
                {result && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 shadow-inner">
                        <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">{result}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalyzer;
