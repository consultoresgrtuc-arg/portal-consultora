import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';
import DateFilter from '../Common/DateFilter';
import FixedDepositCalculator from './FixedDepositCalculator';
import PricingCalculatorForm from './PricingCalculatorForm';
import CashFlowModal from './CashFlowModal';
import ConfirmModal from '../Common/ConfirmModal';

// --- IMPORTACIÓN Y REGISTRO DE CHART.JS ---
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

const FALLBACK_DOLLAR_RATES = [
  { casa: 'oficial', nombre: 'Oficial', compra: 1050, venta: 1090 },
  { casa: 'blue', nombre: 'Blue', compra: 1210, venta: 1230 },
  { casa: 'bolsa', nombre: 'Bolsa (MEP)', compra: 1185, venta: 1190 },
  { casa: 'contadoconliqui', nombre: 'Contado con Liqui', compra: 1195, venta: 1205 }
];

const FinancesPage = () => {
    const { user, userData } = useAuth();
    const { targetUserId, activeEntity, isViewingClient, resetToStudio } = useClientSelection();
    const currentUid = targetUserId || user?.uid;

    const [activePageTab, setActivePageTab] = useState('summary'); // 'summary' | 'cashflow' | 'calculators'
    const [calculatorTab, setCalculatorTab] = useState('deposit'); // 'deposit' | 'pricing'
    const [filterDate, setFilterDate] = useState(new Date());

    // Cotizaciones y Conversor Rápido
    const [dollarRates, setDollarRates] = useState([]);
    const [loadingRates, setLoadingRates] = useState(true);
    const [converterAmount, setConverterAmount] = useState('1000000');
    const [converterDirection, setConverterDirection] = useState('ARS_TO_USD'); // 'ARS_TO_USD' | 'USD_TO_ARS'
    const [toastMessage, setToastMessage] = useState(null);

    // Metas y Operaciones
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [budget, setBudget] = useState({ incomeGoal: 0, expenseBudget: 0 });
    const [operations, setOperations] = useState([]);

    // Estados de Cash Flow
    const [cashflowItems, setCashflowItems] = useState([]);
    const [cheques, setCheques] = useState([]);
    const [microcredits, setMicrocredits] = useState([]);
    const [includeSystemCommitments, setIncludeSystemCommitments] = useState(true);
    const [projectionType, setProjectionType] = useState('weekly'); // 'weekly' | 'monthly' | 'quarterly'
    const [initialCashBalance, setInitialCashBalance] = useState(0);
    const [safetyReserve, setSafetyReserve] = useState(0);
    const [isEditingSettings, setIsEditingSettings] = useState(false);
    const [showCashFlowModal, setShowCashFlowModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [prefillCashFlowData, setPrefillCashFlowData] = useState(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);

    const triggerToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3200);
    };

    // --- LEER OPERACIONES DEL MES SELECCIONADO ---
    useEffect(() => {
        if (!currentUid) return;
        const selectedYear = filterDate.getFullYear();
        const selectedMonth = filterDate.getMonth() + 1;
        const q = query(
            collection(db, 'users', currentUid, 'operations'),
            where("year", "==", selectedYear),
            where("month", "==", selectedMonth)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOperations(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        }, (err) => console.error("Error leyendo operaciones en Finanzas:", err));
        return () => unsubscribe();
    }, [currentUid, filterDate]);

    // --- LEER CONFIGURACIÓN DE FINANZAS POR ENTIDAD/CLIENTE ---
    useEffect(() => {
        if (!currentUid) return;
        const configRef = doc(db, 'users', currentUid, 'settings', 'finance_config');
        const unsubscribe = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) {
                const d = docSnap.data();
                setBudget({
                    incomeGoal: d.incomeGoal ?? (currentUid === user?.uid ? (userData?.incomeGoal || 0) : 0),
                    expenseBudget: d.expenseBudget ?? (currentUid === user?.uid ? (userData?.expenseBudget || 0) : 0)
                });
                setInitialCashBalance(d.initialCashBalance ?? (currentUid === user?.uid ? (userData?.initialCashBalance || 0) : 0));
                setSafetyReserve(d.safetyReserve ?? (currentUid === user?.uid ? (userData?.safetyReserve || 0) : 0));
            } else if (currentUid === user?.uid && userData) {
                setBudget({ incomeGoal: userData.incomeGoal || 0, expenseBudget: userData.expenseBudget || 0 });
                setInitialCashBalance(userData.initialCashBalance || 0);
                setSafetyReserve(userData.safetyReserve || 0);
            } else {
                setBudget({ incomeGoal: 0, expenseBudget: 0 });
                setInitialCashBalance(0);
                setSafetyReserve(0);
            }
        });
        return () => unsubscribe();
    }, [currentUid, user?.uid, userData]);

    // --- LEER ITEMS DEL CASH FLOW ---
    useEffect(() => {
        if (!currentUid) return;
        const q = query(collection(db, 'users', currentUid, 'cashflow_items'), orderBy("date", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCashflowItems(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        });
        return () => unsubscribe();
    }, [currentUid]);

    // --- LEER CHEQUES Y MICROCRÉDITOS PARA INTEGRACIÓN AUTOMÁTICA EN CASH FLOW ---
    useEffect(() => {
        if (!currentUid) return;
        const qCheques = query(collection(db, 'users', currentUid, 'cheques'));
        const unsubCheques = onSnapshot(qCheques, (snap) => {
            setCheques(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setCheques([]));

        const qMc = query(collection(db, 'users', currentUid, 'microcredits'));
        const unsubMc = onSnapshot(qMc, (snap) => {
            setMicrocredits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setMicrocredits([]));

        return () => {
            unsubCheques();
            unsubMc();
        };
    }, [currentUid]);

    // --- MÉTRICAS MENSUALES Y PROYECCIÓN RUN-RATE ---
    const monthlyMetrics = useMemo(() => {
        let income = 0, expense = 0, opsCount = 0;
        operations.forEach(op => {
            const amt = Number(op.amount) || 0;
            if (['venta', 'ingreso'].includes(op.type)) income += amt;
            else expense += amt;
            opsCount++;
        });
        const net = income - expense;
        const marginPct = income > 0 ? (net / income) * 100 : 0;

        const now = new Date();
        const isCurrentMonth = filterDate.getFullYear() === now.getFullYear() && filterDate.getMonth() === now.getMonth();
        const daysInMonth = new Date(filterDate.getFullYear(), filterDate.getMonth() + 1, 0).getDate();
        const elapsedDays = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;

        const projectedIncome = isCurrentMonth ? (income / elapsedDays) * daysInMonth : income;
        const projectedExpense = isCurrentMonth ? (expense / elapsedDays) * daysInMonth : expense;
        const projectedNet = projectedIncome - projectedExpense;

        return {
            income,
            expense,
            net,
            marginPct,
            opsCount,
            daysInMonth,
            elapsedDays,
            isCurrentMonth,
            projectedIncome,
            projectedExpense,
            projectedNet
        };
    }, [operations, filterDate]);

    const handleSaveBudget = async () => {
        if (!currentUid) return;
        try {
            const payload = {
                incomeGoal: parseFloat(budget.incomeGoal) || 0,
                expenseBudget: parseFloat(budget.expenseBudget) || 0
            };
            await setDoc(doc(db, 'users', currentUid, 'settings', 'finance_config'), payload, { merge: true });
            if (currentUid === user?.uid) {
                await updateDoc(doc(db, 'users', user.uid), payload).catch(() => {});
            }
            setIsEditingBudget(false);
            triggerToast('Metas mensuales actualizadas');
        } catch (error) {
            console.error("Error updating budget:", error);
        }
    };

    const handleSaveSettings = async (overrideInitial = null) => {
        if (!currentUid) return;
        try {
            const nextInitial = overrideInitial !== null ? overrideInitial : (parseFloat(initialCashBalance) || 0);
            const payload = {
                initialCashBalance: nextInitial,
                safetyReserve: parseFloat(safetyReserve) || 0
            };
            await setDoc(doc(db, 'users', currentUid, 'settings', 'finance_config'), payload, { merge: true });
            if (currentUid === user?.uid) {
                await updateDoc(doc(db, 'users', user.uid), payload).catch(() => {});
            }
            if (overrideInitial !== null) {
                setInitialCashBalance(nextInitial);
            }
            setIsEditingSettings(false);
            triggerToast('Parámetros de caja actualizados');
        } catch (err) {
            console.error("Error updating settings:", err);
        }
    };

    const promptDelete = (itemId) => {
        setItemToDelete(itemId);
        setShowConfirmDelete(true);
    };

    const handleDeleteItem = async () => {
        if (!itemToDelete || !currentUid) return;
        try {
            await deleteDoc(doc(db, 'users', currentUid, 'cashflow_items', itemToDelete));
            setShowConfirmDelete(false);
            setItemToDelete(null);
            triggerToast('Estimación eliminada');
        } catch (err) {
            console.error("Error deleting item:", err);
        }
    };

    // --- EJECUTAR / CONCILIAR FLUJO PROYECTADO Y REGISTRAR EN OPERACIONES ---
    const handleToggleExecuteCashflowItem = async (item) => {
        if (!currentUid || item.isSystemCommitment) return;
        const isAlreadyExecuted = item.status === 'executed';
        try {
            const itemRef = doc(db, 'users', currentUid, 'cashflow_items', item.id);
            if (isAlreadyExecuted) {
                await updateDoc(itemRef, {
                    status: 'pending',
                    executedAmount: null,
                    executedAt: null
                });
                triggerToast(`Flujo "${item.description}" revertido a pendiente`);
            } else {
                const today = new Date();
                const todayISO = today.toISOString().split('T')[0];
                await updateDoc(itemRef, {
                    status: 'executed',
                    executedAmount: Number(item.amount) || 0,
                    executedAt: todayISO
                });

                // Registrar en Libro de Operaciones automáticamente
                await addDoc(collection(db, 'users', currentUid, 'operations'), {
                    type: item.type === 'ingreso' ? 'venta' : 'gasto',
                    amount: Number(item.amount) || 0,
                    description: `[Cash Flow] ${item.category}: ${item.description}`,
                    fechaEmision: Timestamp.fromDate(today),
                    year: today.getFullYear(),
                    month: today.getMonth() + 1,
                    day: today.getDate(),
                    source: 'cashflow'
                });
                triggerToast(`Ejecutado por ${formatCurrency(item.amount)} y registrado en Operaciones`);
            }
        } catch (err) {
            console.error("Error al conciliar flujo:", err);
        }
    };

    const formatCurrency = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return '$--';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    };

    const formatUSD = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return 'USD 0,00';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(value);
    };

    useEffect(() => {
        const fetchFinancialData = async () => {
            setLoadingRates(true);
            try {
                const response = await fetch('https://dolarapi.com/v1/dolares');
                if (!response.ok) throw new Error('Network response error');
                const data = await response.json();
                setDollarRates(Array.isArray(data) && data.length > 0 ? data : FALLBACK_DOLLAR_RATES);
            } catch (error) {
                setDollarRates(FALLBACK_DOLLAR_RATES);
            } finally {
                setLoadingRates(false);
            }
        };
        fetchFinancialData();
    }, []);

    const officialVenta = useMemo(() => {
        const ofi = dollarRates.find(r => r.casa === 'oficial');
        return ofi?.venta || 0;
    }, [dollarRates]);

    const incomePct = Math.min((monthlyMetrics.income / (budget.incomeGoal || 1)) * 100, 100);
    const expensePct = Math.min((monthlyMetrics.expense / (budget.expenseBudget || 1)) * 100, 100);

    // --- CONVERSIÓN DE COMPROMISOS REALES DEL SISTEMA (CHEQUES Y MICROCRÉDITOS) A FLUJOS ---
    const systemCommitmentItems = useMemo(() => {
        const list = [];

        // 1. Cheques activos (En Cartera / Depositado = Ingreso; Emitido = Egreso)
        cheques.forEach(c => {
            if (!['En Cartera', 'Depositado', 'Emitido'].includes(c.estado)) return;
            let dateStr = null;
            if (c.fechaVencimiento?.toDate) {
                dateStr = c.fechaVencimiento.toDate().toISOString().split('T')[0];
            } else if (typeof c.fechaVencimiento === 'string' && c.fechaVencimiento.includes('-')) {
                dateStr = c.fechaVencimiento.split('T')[0];
            }
            if (!dateStr) return;

            const isIngreso = c.estado === 'En Cartera' || c.estado === 'Depositado';
            list.push({
                id: `sys_cheque_${c.id}`,
                isSystemCommitment: true,
                sourceLabel: `Cheque #${c.numero || ''} (${c.estado})`,
                type: isIngreso ? 'ingreso' : 'egreso',
                category: isIngreso ? 'Cheque a Cobrar' : 'Cheque a Cubrir',
                description: `${c.banco || 'Banco'} - ${c.terceroNombre || 'Tercero'}`,
                amount: Number(c.monto) || 0,
                date: dateStr,
                periodicity: 'once',
                status: 'pending'
            });
        });

        // 2. Cuotas pendientes o en mora de Microcréditos
        microcredits.forEach(mc => {
            if (!Array.isArray(mc.schedule)) return;
            mc.schedule.forEach(row => {
                if (row.status === 'paid') return;
                let dateStr = null;
                if (typeof row.fecha === 'string' && row.fecha.includes('/')) {
                    const parts = row.fecha.split('/');
                    if (parts.length === 3) {
                        dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    }
                }
                if (!dateStr) return;

                const exigible = Number(row.totalToPay !== undefined ? row.totalToPay : row.cuotaPura) || 0;
                if (exigible <= 0) return;

                list.push({
                    id: `sys_mc_${mc.id}_${row.week}`,
                    isSystemCommitment: true,
                    sourceLabel: 'Microcrédito',
                    type: 'ingreso',
                    category: 'Cuota Microcrédito',
                    description: `${mc.nombre || 'Cliente'} - Cuota #${row.week}`,
                    amount: exigible,
                    date: dateStr,
                    periodicity: 'once',
                    status: 'pending'
                });
            });
        });

        list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        return list;
    }, [cheques, microcredits]);

    // --- ALGORITMO FINANCIERO DE PROYECCIÓN DE CASH FLOW (CON OCURRENCIAS MÚLTIPLES EXACTAS) ---
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
                initialBalance: 0,
                inflow: 0,
                outflow: 0,
                net: 0,
                balance: 0
            });
        }

        const activeSourceItems = [
            ...cashflowItems.filter(it => !(it.periodicity === 'once' && it.status === 'executed')),
            ...(includeSystemCommitments ? systemCommitmentItems : [])
        ];

        const countOccurrencesInBucket = (itemDate, periodicity, bucketStart, bucketEnd) => {
            if (periodicity === 'once' || !periodicity) {
                return (itemDate >= bucketStart && itemDate <= bucketEnd) ? 1 : 0;
            }
            let count = 0;
            let tempDate = new Date(itemDate);
            let safetyGuard = 0;
            while (tempDate <= bucketEnd && safetyGuard < 500) {
                safetyGuard++;
                if (tempDate >= bucketStart && tempDate <= bucketEnd) {
                    count++;
                }
                if (periodicity === 'weekly') {
                    tempDate.setDate(tempDate.getDate() + 7);
                } else if (periodicity === 'monthly') {
                    tempDate.setMonth(tempDate.getMonth() + 1);
                } else if (periodicity === 'quarterly') {
                    tempDate.setMonth(tempDate.getMonth() + 3);
                } else {
                    break;
                }
            }
            return count;
        };

        activeSourceItems.forEach(item => {
            if (!item.date) return;
            const parts = String(item.date).split('-');
            const itemDate = parts.length === 3
                ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0)
                : new Date(item.date);
            if (isNaN(itemDate.getTime())) return;

            const amount = Number(item.amount) || 0;
            const type = item.type;

            timeline.forEach((bucket) => {
                const occurrences = countOccurrencesInBucket(itemDate, item.periodicity, bucket.start, bucket.end);
                if (occurrences > 0) {
                    const totalBucketAmount = amount * occurrences;
                    if (type === 'ingreso') bucket.inflow += totalBucketAmount;
                    else bucket.outflow += totalBucketAmount;
                }
            });
        });

        let runningBalance = parseFloat(initialCashBalance) || 0;
        timeline.forEach(bucket => {
            bucket.initialBalance = runningBalance;
            bucket.net = bucket.inflow - bucket.outflow;
            bucket.balance = runningBalance + bucket.net;
            runningBalance = bucket.balance;
        });

        return timeline;
    }, [projectionType, cashflowItems, systemCommitmentItems, includeSystemCommitments, initialCashBalance]);

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
                borderColor: liquidityWarning.isNegative ? '#ef4444' : '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.08)',
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

    const handleScheduleFromDepositCalculator = (prefillData) => {
        setEditingItem(null);
        setPrefillCashFlowData(prefillData);
        setActivePageTab('cashflow');
        setShowCashFlowModal(true);
    };

    const displayedCashflowList = useMemo(() => {
        const combined = [
            ...cashflowItems,
            ...(includeSystemCommitments ? systemCommitmentItems : [])
        ];
        combined.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        return combined;
    }, [cashflowItems, systemCommitmentItems, includeSystemCommitments]);

    const formatPeriodicityLabel = (periodicity) => {
        if (periodicity === 'once') return 'Único';
        if (periodicity === 'weekly') return 'Semanal';
        if (periodicity === 'monthly') return 'Mensual';
        if (periodicity === 'quarterly') return 'Trimestral';
        return periodicity;
    };

    return (
        <div className="space-y-6 sm:space-y-8 bg-gray-50/50 min-h-screen pb-12">
            {toastMessage && (
                <div className="fixed top-20 right-5 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl z-[80] flex items-center gap-2 text-xs sm:text-sm font-bold animate-bounce">
                    <Icon name="CheckCircle" size={18} />
                    {toastMessage}
                </div>
            )}

            {showCashFlowModal && (
                <CashFlowModal 
                    item={editingItem}
                    initialData={prefillCashFlowData}
                    targetUserId={currentUid}
                    targetEntityName={activeEntity?.name}
                    onClose={() => {
                        setShowCashFlowModal(false);
                        setEditingItem(null);
                        setPrefillCashFlowData(null);
                    }} 
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

            {/* HEADER */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-5 sm:p-6 bg-white border-b border-slate-100 no-print rounded-3xl shadow-sm mx-4 sm:mx-6 mt-4">
                <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                            Centro Financiero
                        </h2>
                        {isViewingClient ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                                <Icon name="Users" size={13} />
                                {activeEntity?.name}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                <Icon name="Landmark" size={13} />
                                {activeEntity?.name || 'Mi Estudio Contable'}
                            </span>
                        )}
                    </div>
                    <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                        Monitorea rentabilidad mensual, divisas, flujo de fondos proyectado y simuladores.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    {isViewingClient && (
                        <button
                            onClick={resetToStudio}
                            className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                            <Icon name="ArrowLeft" size={14} /> Volver al Estudio
                        </button>
                    )}
                    {activePageTab === 'summary' && (
                        <DateFilter date={filterDate} setDate={setFilterDate} />
                    )}
                </div>
            </header>

            {/* --- TABS --- */}
            <div className="flex border-b border-slate-200 px-4 sm:px-6 no-print overflow-x-auto scrollbar-hide whitespace-nowrap">
                <button 
                    onClick={() => setActivePageTab('summary')}
                    className={`pb-3.5 px-4 sm:px-6 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 shrink-0 ${activePageTab === 'summary' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Icon name="Target" size={16} /> Resumen y Mercado
                </button>
                <button 
                    onClick={() => setActivePageTab('cashflow')}
                    className={`pb-3.5 px-4 sm:px-6 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 shrink-0 ${activePageTab === 'cashflow' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Icon name="TrendingUp" size={16} /> Flujo de Fondos Proyectado
                </button>
                <button 
                    onClick={() => setActivePageTab('calculators')}
                    className={`pb-3.5 px-4 sm:px-6 font-bold text-xs sm:text-sm border-b-2 transition-all cursor-pointer flex items-center gap-2 shrink-0 ${activePageTab === 'calculators' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    <Icon name="PieChart" size={16} /> Calculadoras
                </button>
            </div>

            {/* --- PESTAÑA 1: RESUMEN Y MERCADO --- */}
            {activePageTab === 'summary' && (
                <div className="px-4 sm:px-6 space-y-6 sm:space-y-8">
                    {/* KPIs Ejecutivos del Período */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Resultado Neto */}
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Resultado Neto del Mes</span>
                                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${monthlyMetrics.net >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                                    {monthlyMetrics.net >= 0 ? 'Superávit' : 'Déficit'}
                                </span>
                            </div>
                            <p className={`text-2xl font-black mt-2 ${monthlyMetrics.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {monthlyMetrics.net >= 0 ? '+' : ''}{formatCurrency(monthlyMetrics.net)}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-1">
                                Margen operativo: <strong className="text-slate-700">{monthlyMetrics.marginPct.toFixed(1)}%</strong> ({monthlyMetrics.opsCount} op.)
                            </p>
                        </div>

                        {/* Proyección Run-Rate */}
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Proyección Cierre Mes</span>
                                <Icon name="Activity" size={16} className="text-blue-500" />
                            </div>
                            <p className="text-2xl font-black text-slate-800 mt-2">
                                {formatCurrency(monthlyMetrics.projectedIncome)}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-1">
                                Neto est.: <strong className={monthlyMetrics.projectedNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(monthlyMetrics.projectedNet)}</strong> ({monthlyMetrics.elapsedDays}/{monthlyMetrics.daysInMonth}d)
                            </p>
                        </div>

                        {/* Margen Presupuestario de Gastos */}
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Margen de Gasto Disponible</span>
                                <Icon name="Shield" size={16} className={budget.expenseBudget >= monthlyMetrics.expense ? 'text-emerald-500' : 'text-rose-500'} />
                            </div>
                            <p className={`text-2xl font-black mt-2 ${(budget.expenseBudget - monthlyMetrics.expense) >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                                {budget.expenseBudget > 0
                                    ? formatCurrency(budget.expenseBudget - monthlyMetrics.expense)
                                    : 'Sin límite'}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-1">
                                {budget.expenseBudget > 0
                                    ? `Ejecutado el ${expensePct.toFixed(0)}% del presupuesto`
                                    : 'Configura tu límite en Metas Mensuales'}
                            </p>
                        </div>

                        {/* Cobertura de Gastos */}
                        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Relación Ingreso / Gasto</span>
                                <Icon name="Award" size={16} className="text-indigo-500" />
                            </div>
                            <p className="text-2xl font-black text-indigo-600 mt-2">
                                {monthlyMetrics.expense > 0
                                    ? `${((monthlyMetrics.income / monthlyMetrics.expense) * 100).toFixed(0)}%`
                                    : (monthlyMetrics.income > 0 ? '100%+' : '0%')}
                            </p>
                            <p className="text-[11px] text-slate-400 font-medium mt-1">
                                {monthlyMetrics.income >= monthlyMetrics.expense
                                    ? 'Gastos 100% cubiertos por ingresos'
                                    : `Faltan ${formatCurrency(monthlyMetrics.expense - monthlyMetrics.income)} para equilibrio`}
                            </p>
                        </div>
                    </section>

                    {/* Metas Mensuales */}
                    <section className="w-full">
                        <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition-all">
                            <div className="flex justify-between items-center mb-6 sm:mb-8 relative z-10 flex-wrap gap-2">
                                <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center">
                                    <Icon name="Target" className="w-6 h-6 mr-2.5 text-blue-500"/> 
                                    Metas Mensuales
                                </h3>
                                {!isEditingBudget && (
                                    <button onClick={() => setIsEditingBudget(true)} className="flex items-center gap-2 text-xs sm:text-sm font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer">
                                        <Icon name="Edit2" className="w-4 h-4"/> Editar Metas
                                    </button>
                                )}
                            </div>
                            
                            {isEditingBudget ? (
                                <div className="space-y-6 relative z-10 bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-100">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Meta de Ingresos Mensual</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-blue-500 font-bold">$</span>
                                                <input type="number" value={budget.incomeGoal} onChange={e => setBudget({...budget, incomeGoal: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border border-slate-200 rounded-xl transition-all font-bold text-slate-700 outline-none shadow-sm"/>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Límite Presupuestado de Gastos</label>
                                            <div className="relative">
                                                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-red-500 font-bold">$</span>
                                                <input type="number" value={budget.expenseBudget} onChange={e => setBudget({...budget, expenseBudget: e.target.value})} onFocus={e => e.target.select()} className="w-full pl-8 p-3 bg-white border border-slate-200 rounded-xl transition-all font-bold text-slate-700 outline-none shadow-sm"/>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-2">
                                        <button onClick={() => setIsEditingBudget(false)} className="py-2.5 px-5 bg-white text-slate-500 rounded-xl hover:bg-slate-100 font-bold transition-colors border border-slate-200 cursor-pointer text-xs sm:text-sm">Cancelar</button>
                                        <button onClick={handleSaveBudget} className="py-2.5 px-6 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 font-bold transition-all cursor-pointer text-xs sm:text-sm">Guardar Metas</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-8 relative z-10">
                                    {/* Barra Ingresos */}
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between items-end flex-wrap gap-2">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ingresos Actuales</p>
                                                <p className="text-2xl sm:text-3xl font-black text-slate-800">{formatCurrency(monthlyMetrics.income)}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-bold text-slate-400">Objetivo: {formatCurrency(budget.incomeGoal)}</p>
                                                <p className="text-sm font-black text-emerald-600">{incomePct.toFixed(0)}%</p>
                                            </div>
                                        </div>
                                        <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden shadow-inner">
                                            <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-1000 ease-out" style={{ width: `${incomePct}%` }}></div>
                                        </div>
                                    </div>
        
                                    {/* Barra Gastos */}
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between items-end flex-wrap gap-2">
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Gastos Actuales</p>
                                                <p className="text-2xl sm:text-3xl font-black text-slate-800">{formatCurrency(monthlyMetrics.expense)}</p>
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
      
                    {/* SECCIÓN COTIZACIONES Y CONVERSOR EN VIVO */}
                    <section className="space-y-5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
                            <div>
                                <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center">
                                    <Icon name="TrendingUp" className="w-6 h-6 mr-2.5 text-emerald-500"/> 
                                    Mercado de Divisas y Conversor en Vivo
                                </h3>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">
                                    Ingresa un monto para convertir simultáneamente en todas las cotizaciones y medir la brecha cambiaria.
                                </p>
                            </div>

                            {/* Barra Conversora Interactiva */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                                <div className="flex rounded-xl bg-white p-1 border border-slate-200 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setConverterDirection('ARS_TO_USD')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${converterDirection === 'ARS_TO_USD' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        ARS → USD
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConverterDirection('USD_TO_ARS')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${converterDirection === 'USD_TO_ARS' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                                    >
                                        USD → ARS
                                    </button>
                                </div>

                                <div className="relative flex-1 sm:w-48">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                                        {converterDirection === 'ARS_TO_USD' ? '$' : 'U$S'}
                                    </span>
                                    <input
                                        type="number"
                                        value={converterAmount}
                                        onChange={e => setConverterAmount(e.target.value)}
                                        placeholder="Monto a convertir"
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm font-black text-slate-800 outline-none focus:border-blue-500 font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                            {loadingRates ? (
                                [1,2,3,4].map(i => <div key={i} className="h-48 bg-white rounded-3xl animate-pulse border border-slate-100"></div>)
                            ) : dollarRates.length > 0 ? dollarRates.map(rate => {
                                const venta = Number(rate.venta) || 0;
                                const compra = Number(rate.compra) || 0;
                                const numConv = parseFloat(converterAmount) || 0;
                                const convertedVal = venta > 0
                                    ? (converterDirection === 'ARS_TO_USD' ? numConv / venta : numConv * venta)
                                    : 0;
                                const brechaOficial = (officialVenta > 0 && rate.casa !== 'oficial' && venta > 0)
                                    ? ((venta / officialVenta) - 1) * 100
                                    : null;
                                const spreadPct = (compra > 0 && venta >= compra)
                                    ? ((venta - compra) / compra) * 100
                                    : 0;

                                return (
                                    <div key={rate.casa} className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between gap-4">
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-4">
                                                <h4 className="font-black text-base text-slate-800 capitalize whitespace-nowrap" title={rate.nombre}>
                                                    {rate.casa === 'contadoconliqui' ? 'CCL' : rate.casa === 'bolsa' ? 'MEP' : rate.nombre}
                                                </h4>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {brechaOficial !== null ? (
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${brechaOficial >= 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`} title="Brecha respecto al Dólar Oficial">
                                                            Brecha {brechaOficial >= 0 ? `+${brechaOficial.toFixed(1)}%` : `${brechaOficial.toFixed(1)}%`}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-black bg-slate-800 text-white px-2 py-0.5 rounded-full uppercase">Base Oficial</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex justify-between items-end gap-2">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Compra</p>
                                                    <p className="text-sm xl:text-base font-bold text-slate-600 whitespace-nowrap">{formatCurrency(compra)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mb-0.5">Venta</p>
                                                    <p className="text-lg xl:text-xl font-black text-emerald-600 whitespace-nowrap">{formatCurrency(venta)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Resultado del Conversor en cada tarjeta */}
                                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 bg-slate-50/80 px-3 py-2 rounded-2xl">
                                            <div className="min-w-0">
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                                    {converterDirection === 'ARS_TO_USD' ? 'Equivale en USD' : 'Equivale en ARS'} (Spread {spreadPct.toFixed(1)}%)
                                                </span>
                                                <span className="text-xs sm:text-sm font-black text-slate-800 font-mono truncate block">
                                                    {converterDirection === 'ARS_TO_USD' ? formatUSD(convertedVal) : formatCurrency(convertedVal)}
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const formatted = converterDirection === 'ARS_TO_USD' ? formatUSD(convertedVal) : formatCurrency(convertedVal);
                                                    navigator.clipboard.writeText(formatted);
                                                    triggerToast(`Copiado: ${formatted} (${rate.nombre})`);
                                                }}
                                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors cursor-pointer shrink-0"
                                                title="Copiar conversión"
                                            >
                                                <Icon name="FileText" size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            }) : <p className="text-slate-500 text-center col-span-full py-10">Cotizaciones no disponibles en este momento.</p>}
                        </div>
                    </section>
                </div>
            )}

            {/* --- PESTAÑA 2: FLUJO DE FONDOS PROYECTADO (CASH FLOW) --- */}
            {activePageTab === 'cashflow' && (
                <div className="px-4 sm:px-6 space-y-6 sm:space-y-8">
                    {/* --- BANNER DE ALERTA DE LIQUIDEZ --- */}
                    {liquidityWarning.hasAlert && (
                        <div className={`p-5 rounded-3xl border shadow-md flex items-start gap-4 ${liquidityWarning.isNegative ? 'bg-red-500/10 border-red-500/25 text-red-700' : 'bg-orange-500/10 border-orange-500/25 text-orange-700'}`}>
                            <div className="p-2.5 rounded-2xl bg-white/60 shadow-sm shrink-0">
                                <Icon name="ShieldAlert" className={`w-6 h-6 ${liquidityWarning.isNegative ? 'text-red-600' : 'text-orange-600'}`} />
                            </div>
                            <div>
                                <h4 className="font-extrabold uppercase text-xs tracking-wider">
                                    {liquidityWarning.isNegative ? 'Alerta de Iliquidez Crítica Detectada' : 'Reserva de Seguridad Mínima Comprometida'}
                                </h4>
                                <p className="text-xs sm:text-sm mt-1 leading-relaxed">
                                    {liquidityWarning.isNegative 
                                       ? `Se prevé un saldo de caja negativo de ${formatCurrency(liquidityWarning.balance)} para el período "${liquidityWarning.period}". ¡Se requiere cubrir un faltante de al menos ${formatCurrency(Math.abs(liquidityWarning.balance))} para evitar saldos descubiertos!`
                                       : `El saldo acumulado proyectado caerá a ${formatCurrency(liquidityWarning.balance)} en el período "${liquidityWarning.period}", quedando por debajo de tu colchón de seguridad de ${formatCurrency(liquidityWarning.threshold)}.`
                                    }
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Controles Principales e Integración Automática */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 no-print bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 tracking-tight">Simulador de Proyecciones y Tesorería</h3>
                            <p className="text-slate-400 text-xs font-medium">
                                Proyecta tus flujos manuales junto con compromisos reales de Cheques y Microcréditos.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                            {/* Toggle de integración con Cheques y Microcréditos */}
                            <label className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50/80 border border-emerald-200 rounded-xl cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includeSystemCommitments}
                                    onChange={e => setIncludeSystemCommitments(e.target.checked)}
                                    className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                                />
                                <span className="text-xs font-bold text-emerald-900">
                                    Integrar Cheques y Microcréditos ({systemCommitmentItems.length})
                                </span>
                            </label>

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
                                onClick={() => { setEditingItem(null); setPrefillCashFlowData(null); setShowCashFlowModal(true); }}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-2"
                            >
                                <Icon name="PlusCircle" size={14} /> Cargar Estimación
                            </button>
                        </div>
                    </div>

                    {/* Visualización y Parámetros */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
                        {/* Gráfico (Col-span 2) */}
                        <div className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
                                <h4 className="font-black text-slate-800 text-base">Tendencia de Caja Acumulada Proyectada</h4>
                                <span className="text-[11px] font-bold text-slate-400">
                                    Saldo Final Proyectado: <strong className="text-slate-800">{formatCurrency(projectionTimeline[projectionTimeline.length - 1]?.balance || 0)}</strong>
                                </span>
                            </div>
                            <div className="h-[260px] sm:h-[290px] w-full relative">
                                <Line data={cashFlowChartData} options={cashFlowChartOptions} />
                            </div>
                        </div>

                        {/* Configuración de Caja (Col-span 1) */}
                        <div className="bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-center mb-4">
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
                                <p className="text-slate-400 text-xs font-medium mb-6">
                                    Establece el punto de partida real y tus límites de protección de liquidez.
                                </p>
                            </div>

                            {isEditingSettings ? (
                                <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
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
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Reserva Mínima (Colchón)</label>
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
                                        <button onClick={() => handleSaveSettings()} className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs shadow-sm cursor-pointer">Guardar</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo de Caja Inicial</p>
                                            <p className="text-xl sm:text-2xl font-black text-slate-800 mt-1">{formatCurrency(initialCashBalance)}</p>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                            <Icon name="Landmark" size={20} />
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reserva de Seguridad Mínima</p>
                                            <p className="text-xl sm:text-2xl font-black text-slate-800 mt-1">{formatCurrency(safetyReserve)}</p>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-orange-50 text-orange-500 border border-orange-100">
                                            <Icon name="Target" size={20} />
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleSaveSettings(Math.max(0, monthlyMetrics.net))}
                                        className="w-full py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                        title="Tomar el Resultado Neto del mes actual como Saldo Inicial de Caja"
                                    >
                                        <Icon name="Sparkles" size={14} /> Usar Saldo Neto del Mes ({formatCurrency(Math.max(0, monthlyMetrics.net))})
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Matriz / Tabla Resumen Período a Período */}
                    <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                            <div>
                                <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Cuadro de Flujo de Fondos por Período</h4>
                                <p className="text-slate-400 text-xs font-medium">Desglose de ingresos, egresos y saldo acumulado proyectado en cada tramo.</p>
                            </div>
                        </div>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 text-xs sm:text-sm">
                                <thead className="bg-slate-50/70 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <tr>
                                        <th className="px-4 sm:px-6 py-3.5 text-left">Período</th>
                                        <th className="px-4 py-3.5 text-right">Saldo Inicial</th>
                                        <th className="px-4 py-3.5 text-right text-emerald-600">(+) Ingresos</th>
                                        <th className="px-4 py-3.5 text-right text-rose-600">(-) Egresos</th>
                                        <th className="px-4 py-3.5 text-right">Flujo Neto</th>
                                        <th className="px-4 sm:px-6 py-3.5 text-right">Saldo Acumulado</th>
                                        <th className="px-4 py-3.5 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                                    {projectionTimeline.map((b, idx) => {
                                        const reserveVal = parseFloat(safetyReserve) || 0;
                                        const isNeg = b.balance < 0;
                                        const isBelowReserve = !isNeg && b.balance < reserveVal;
                                        return (
                                            <tr key={idx} className={`hover:bg-slate-50/70 transition-colors ${isNeg ? 'bg-red-50/30' : isBelowReserve ? 'bg-amber-50/20' : ''}`}>
                                                <td className="px-4 sm:px-6 py-3.5 font-sans font-bold text-slate-800 whitespace-nowrap">{b.label}</td>
                                                <td className="px-4 py-3.5 text-right text-slate-500 whitespace-nowrap">{formatCurrency(b.initialBalance)}</td>
                                                <td className="px-4 py-3.5 text-right font-bold text-emerald-600 whitespace-nowrap">+{formatCurrency(b.inflow)}</td>
                                                <td className="px-4 py-3.5 text-right font-bold text-rose-600 whitespace-nowrap">-{formatCurrency(b.outflow)}</td>
                                                <td className={`px-4 py-3.5 text-right font-bold whitespace-nowrap ${b.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                    {b.net >= 0 ? '+' : ''}{formatCurrency(b.net)}
                                                </td>
                                                <td className={`px-4 sm:px-6 py-3.5 text-right font-black whitespace-nowrap ${isNeg ? 'text-red-600' : 'text-slate-900'}`}>
                                                    {formatCurrency(b.balance)}
                                                </td>
                                                <td className="px-4 py-3.5 text-center font-sans whitespace-nowrap">
                                                    {isNeg ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Descubierto</span>
                                                    ) : isBelowReserve ? (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Bajo Reserva</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Óptimo</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Vista Mobile del Cuadro de Flujo por Período */}
                        <div className="md:hidden divide-y divide-slate-100">
                            {projectionTimeline.map((b, idx) => {
                                const reserveVal = parseFloat(safetyReserve) || 0;
                                const isNeg = b.balance < 0;
                                const isBelowReserve = !isNeg && b.balance < reserveVal;
                                return (
                                    <div key={idx} className={`p-4 space-y-2.5 ${isNeg ? 'bg-red-50/30' : isBelowReserve ? 'bg-amber-50/20' : ''}`}>
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-sm text-slate-800">{b.label}</span>
                                            {isNeg ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Descubierto</span>
                                            ) : isBelowReserve ? (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Bajo Reserva</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">Óptimo</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                            <div>
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">(+) Ingresos</span>
                                                <span className="font-mono font-bold text-emerald-600">+{formatCurrency(b.inflow)}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase block">(-) Egresos</span>
                                                <span className="font-mono font-bold text-rose-600">-{formatCurrency(b.outflow)}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-[11px] font-bold text-slate-400 uppercase">Saldo Acumulado</span>
                                            <span className={`font-mono font-black text-sm ${isNeg ? 'text-red-600' : 'text-slate-900'}`}>
                                                {formatCurrency(b.balance)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Listado de Movimientos Proyectados y Compromisos Integrados */}
                    <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <h4 className="text-base sm:text-lg font-black text-slate-800 tracking-tight">Movimientos y Compromisos de Tesorería</h4>
                                <p className="text-slate-400 text-xs font-medium">
                                    Marca con el tilde (<strong className="text-emerald-600">✓</strong>) cualquier estimación manual cuando se concrete para registrarla en el Libro de Operaciones.
                                </p>
                            </div>
                            <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                                {displayedCashflowList.length} Flujos en Agenda
                            </span>
                        </div>

                        {displayedCashflowList.length > 0 ? (
                            <>
                                {/* --- TABLA ESCRITORIO --- */}
                                <div className="hidden md:block overflow-x-auto">
                                    <table className="min-w-full divide-y divide-slate-100">
                                        <thead className="bg-slate-50/50">
                                            <tr>
                                                <th className="px-5 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha Base</th>
                                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoría / Origen</th>
                                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descripción</th>
                                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Frecuencia</th>
                                                <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto / Estado</th>
                                                <th className="px-5 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gestión</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-100">
                                            {displayedCashflowList.map(item => {
                                                const isExecuted = item.status === 'executed';
                                                return (
                                                    <tr key={item.id} className={`hover:bg-slate-50/60 transition-colors ${isExecuted ? 'bg-emerald-50/30' : ''}`}>
                                                        <td className="px-5 py-4 text-xs font-semibold text-slate-600 whitespace-nowrap">{item.date}</td>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${item.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                                    {item.category}
                                                                </span>
                                                                {item.isSystemCommitment && (
                                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                        Auto • {item.sourceLabel}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 text-sm font-bold text-slate-800">{item.description}</td>
                                                        <td className="px-4 py-4 text-xs font-bold text-slate-400 whitespace-nowrap">
                                                            {formatPeriodicityLabel(item.periodicity)}
                                                        </td>
                                                        <td className="px-4 py-4 text-right whitespace-nowrap">
                                                            <span className={`font-extrabold text-sm block ${item.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {item.type === 'ingreso' ? '+' : '-'}{formatCurrency(item.amount)}
                                                            </span>
                                                            {isExecuted && (
                                                                <span className="text-[10px] font-black text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md inline-block mt-1">
                                                                    Concretado: {formatCurrency(item.executedAmount || item.amount)}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 text-center whitespace-nowrap">
                                                            {item.isSystemCommitment ? (
                                                                <span className="text-[10px] font-bold text-slate-400 italic">Sincronizado</span>
                                                            ) : (
                                                                <div className="flex justify-center items-center gap-2">
                                                                    <button 
                                                                        onClick={() => { setEditingItem(item); setPrefillCashFlowData(null); setShowCashFlowModal(true); }}
                                                                        className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl cursor-pointer transition-colors"
                                                                        title="Editar estimación"
                                                                    >
                                                                        <Icon name="Edit" size={14} />
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => promptDelete(item.id)}
                                                                        className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl cursor-pointer transition-colors"
                                                                        title="Eliminar estimación"
                                                                    >
                                                                        <Icon name="Trash2" size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleToggleExecuteCashflowItem(item)}
                                                                        className={`w-8 h-8 rounded-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                                                                            isExecuted
                                                                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-xs'
                                                                                : 'bg-white border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-600'
                                                                        }`}
                                                                        title={isExecuted ? 'Revertir a pendiente' : 'Confirmar y registrar en Libro de Operaciones'}
                                                                    >
                                                                        <Icon name="Check" size={15} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* --- CARDS MÓVIL --- */}
                                <div className="block md:hidden p-4 space-y-3 bg-slate-50/50">
                                    {displayedCashflowList.map(item => {
                                        const isExecuted = item.status === 'executed';
                                        return (
                                            <div key={item.id} className={`bg-white p-4 rounded-2xl border ${isExecuted ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-100'} shadow-sm flex flex-col justify-between gap-3`}>
                                                <div className="flex justify-between items-start gap-2">
                                                    <div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${item.type === 'ingreso' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                                {item.category}
                                                            </span>
                                                            {item.isSystemCommitment && (
                                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                    Auto
                                                                </span>
                                                            )}
                                                        </div>
                                                        <h5 className="font-extrabold text-slate-800 text-sm mt-2">{item.description}</h5>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                                                            {item.date} • {formatPeriodicityLabel(item.periodicity)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className={`font-black text-base block ${item.type === 'ingreso' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {item.type === 'ingreso' ? '+' : '-'}{formatCurrency(item.amount)}
                                                        </span>
                                                        {isExecuted && (
                                                            <span className="text-[9px] font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md inline-block mt-1">
                                                                Concretado
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {!item.isSystemCommitment && (
                                                    <div className="flex justify-end items-center gap-2 pt-3 border-t border-slate-100">
                                                        <button 
                                                            onClick={() => { setEditingItem(item); setPrefillCashFlowData(null); setShowCashFlowModal(true); }}
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
                                                        <button
                                                            onClick={() => handleToggleExecuteCashflowItem(item)}
                                                            className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer ${
                                                                isExecuted
                                                                    ? 'bg-emerald-600 text-white'
                                                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                            }`}
                                                        >
                                                            <Icon name="Check" size={12} /> {isExecuted ? 'Concretado' : 'Confirmar'}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="py-16 text-center px-4">
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
                <div className="px-4 sm:px-6 space-y-6">
                    <div className="flex bg-slate-100 p-1 rounded-2xl mb-4 self-start no-print max-w-sm">
                        <button 
                            onClick={() => setCalculatorTab('deposit')}
                            className={`flex-1 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${calculatorTab === 'deposit' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Icon name="PieChart" size={14} /> Plazo Fijo / Tasa Real
                        </button>
                        <button 
                            onClick={() => setCalculatorTab('pricing')}
                            className={`flex-1 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${calculatorTab === 'pricing' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <Icon name="BarChart3" size={14} /> Calculadora Precios
                        </button>
                    </div>
                    <div className="w-full">
                        {calculatorTab === 'deposit' ? (
                            <FixedDepositCalculator
                                dollarRates={dollarRates}
                                onScheduleInCashFlow={handleScheduleFromDepositCalculator}
                            />
                        ) : (
                            <PricingCalculatorForm
                                dollarRates={dollarRates}
                                targetUserId={currentUid}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancesPage;
