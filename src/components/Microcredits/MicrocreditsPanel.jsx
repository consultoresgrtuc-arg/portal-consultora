import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckSquare, 
  AlertCircle, 
  DollarSign, 
  FileText, 
  Calculator, 
  Check, 
  AlertTriangle, 
  Users, 
  Save, 
  Plus, 
  Eye, 
  Trash2,
  TrendingUp,
  Clock,
  MessageSquare,
  Zap,
  BrainCircuit,
  Loader2,
  Cloud,
  Calendar,
  Phone,
  Copy,
  Send,
  BellRing,
  AlertOctagon,
  CalendarDays,
  ExternalLink,
  Edit3,
  Table,
  FileSpreadsheet,
  Printer,
  ShieldCheck,
  Receipt,
  Scale,
  Coins
} from 'lucide-react';
import { db, auth } from '../../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { cleanWhatsAppNumber, openWhatsApp } from '../../utils/whatsapp';

export default function MicrocreditsPanel({ userData }) {
  // --- CONFIGURACIÓN Y ESTADOS ---
  const todayStr = new Date().toISOString().split('T')[0];
  const initialFirstDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  })();

  const defaultParams = {
    capital: 1000000,
    weeks: 12,
    frecuencia: 'semanal',
    fechaOtorgamiento: todayStr,
    fechaInicio: initialFirstDue,
    tna: 120, 
    moraTna: 180, 
    sellosRate: 1.0, 
    iibbRate: 5.5, 
  };

  const defaultChecklist = [
    { id: 1, text: "Constancia AFIP y DGR Tucumán (Activos)", checked: false },
    { id: 2, text: "Copia DNI Titular y Garante", checked: false },
    { id: 3, text: "Servicio/Alquiler a nombre del titular (Validación Domicilio)", checked: false },
    { id: 4, text: "Consulta BCRA (Central de Deudores - Sit. 1 o 2 máx)", checked: false },
    { id: 5, text: "Análisis 3 últimas DDJJ (Cuota < 20% facturación mensual)", checked: false },
    { id: 6, text: "Firma de Mutuo Comercial y Pagaré 'A la vista'", checked: false },
  ];

  const [params, setParams] = useState(defaultParams);
  const [schedule, setSchedule] = useState([]);
  const [checklist, setChecklist] = useState(defaultChecklist);
  const [cartera, setCartera] = useState([]);
  const [clienteId, setClienteId] = useState(null); 
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [showNotification, setShowNotification] = useState(null);
  
  // Estados para Cuadro de Amortización Francés
  const [showAmortizationModal, setShowAmortizationModal] = useState(false);
  const [amortizationTarget, setAmortizationTarget] = useState(null); // null = simulación en curso, objeto = cliente confirmado

  // Estados para Imputación de Pagos (Art. 903 CCCN)
  const [paymentModalData, setPaymentModalData] = useState(null); // { index, cuota }
  const [montoAbonoInput, setMontoAbonoInput] = useState('');

  // Estados para la IA y Mensajería
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiCollectionMsg, setAiCollectionMsg] = useState(null);
  const [msgModalMode, setMsgModalMode] = useState('cobranza'); // 'cobranza' | 'recordatorio'
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Estados para la Nube
  const user = auth.currentUser;
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const carteraRef = collection(db, 'users', user.uid, 'microcredits');
    const unsubscribe = onSnapshot(carteraRef, (snapshot) => {
      const loadedCartera = [];
      snapshot.forEach((doc) => {
        loadedCartera.push({ id: doc.id, ...doc.data() });
      });
      setCartera(loadedCartera);
    }, (error) => {
      console.error("Error cargando cartera:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // --- UTILIDADES DE FECHAS Y FORMATO ---
  const parseISODate = (str) => {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  };

  const getFechaOtorgamiento = (p, client) => {
    if (p?.fechaOtorgamiento) return p.fechaOtorgamiento;
    if (client?.createdAt) return client.createdAt.split('T')[0];
    if (client?.fechaCreacion) {
      const parts = client.fechaCreacion.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    if (p?.fechaInicio) {
      const freq = p.frecuencia || 'semanal';
      const days = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);
      const d = parseISODate(p.fechaInicio);
      if (d) {
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  };

  // Motor numérico para calcular tasas anuales efectivas (TEA y CFT EA) considerando fechas reales (XIRR)
  const solveAnnualRate = (initialAmount, paymentsWithDays) => {
    if (initialAmount <= 0 || !paymentsWithDays || paymentsWithDays.length === 0) return 0;
    const totalPayments = paymentsWithDays.reduce((acc, p) => acc + p.amount, 0);
    if (totalPayments <= initialAmount) return 0;

    const npv = (r) => {
      let sum = 0;
      for (const p of paymentsWithDays) {
        sum += p.amount / Math.pow(1 + r, p.days / 365);
      }
      return sum - initialAmount;
    };

    let low = 0.0;
    let high = 50.0;
    while (npv(high) > 0 && high < 500.0) {
      high *= 2;
    }

    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const val = npv(mid);
      if (Math.abs(val) < 1e-4) {
        return mid * 100;
      }
      if (val > 0) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return ((low + high) / 2) * 100;
  };

  const calculateEndDate = (startDateStr, periods, freq) => {
    if (!startDateStr || !periods) return null;
    const [year, month, day] = startDateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const offset = periods - 1; 

    if (freq === 'semanal') {
      date.setDate(date.getDate() + (offset * 7));
    } else if (freq === 'quincenal') {
      date.setDate(date.getDate() + (offset * 15));
    } else if (freq === 'mensual') {
      date.setMonth(date.getMonth() + offset);
    }
    return date;
  };

  const formatDateToLocal = (date) => {
     if (!date) return '---';
     return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val || 0);

  const formatCurrencyWithDecimals = (val) => new Intl.NumberFormat('es-AR', { 
    style: 'currency', 
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(val || 0);

  // Obtiene el detalle exacto del valor cobrado en una cuota (total o parcial, incluyendo registros históricos)
  const getDetalleCobroCuota = (row, currentParams = params) => {
    if (!row) {
      return { montoCobrado: 0, punitorioCobrado: 0, compensatorioCobrado: 0, capitalCobrado: 0, ultimoPagoMonto: 0, fechaUltimoPago: null };
    }
    const principalOrig = typeof row.capitalOriginal === 'number'
      ? row.capitalOriginal
      : (typeof row.principal === 'number' ? row.principal : Math.max(0, (row.cuotaPura || 0) - (row.interest || 0)));
    const interestOrig = typeof row.interesCompensatorioOriginal === 'number'
      ? row.interesCompensatorioOriginal
      : (typeof row.interest === 'number' ? row.interest : 0);
    const moraDailyRate = ((parseFloat(currentParams?.moraTna) || 0) / 100) / 365;
    const punitorioPorDias = (row.lateDays > 0 && principalOrig > 0)
      ? Math.round(principalOrig * moraDailyRate * row.lateDays * 100) / 100
      : 0;

    if (Array.isArray(row.pagos) && row.pagos.length > 0) {
      const montoCobrado = Math.round(row.pagos.reduce((acc, p) => acc + (Number(p.montoTotal) || 0), 0) * 100) / 100;
      const punitorioCobrado = Math.round(row.pagos.reduce((acc, p) => acc + (Number(p.imputacion?.punitorio) || 0), 0) * 100) / 100;
      const compensatorioCobrado = Math.round(row.pagos.reduce((acc, p) => acc + (Number(p.imputacion?.compensatorio) || 0), 0) * 100) / 100;
      const capitalCobrado = Math.round(row.pagos.reduce((acc, p) => acc + (Number(p.imputacion?.capital) || 0), 0) * 100) / 100;
      const ultimoPago = row.pagos[row.pagos.length - 1];
      return {
        montoCobrado,
        punitorioCobrado,
        compensatorioCobrado,
        capitalCobrado,
        ultimoPagoMonto: Number(ultimoPago?.montoTotal) || montoCobrado,
        fechaUltimoPago: row.fechaUltimoPago || ultimoPago?.fecha || null
      };
    }

    if (typeof row.montoCobrado === 'number' && row.montoCobrado > 0) {
      const punitorioCobrado = Math.max(0, Math.round((row.montoCobrado - (row.cuotaPura || 0)) * 100) / 100);
      return {
        montoCobrado: row.montoCobrado,
        punitorioCobrado,
        compensatorioCobrado: interestOrig,
        capitalCobrado: principalOrig,
        ultimoPagoMonto: row.ultimoPagoMonto || row.montoCobrado,
        fechaUltimoPago: row.fechaUltimoPago || row.fechaUltimoCalculoMora || null
      };
    }

    if (row.status === 'paid') {
      const montoCobrado = Math.round(((row.cuotaPura || 0) + punitorioPorDias) * 100) / 100;
      return {
        montoCobrado,
        punitorioCobrado: punitorioPorDias,
        compensatorioCobrado: interestOrig,
        capitalCobrado: principalOrig,
        ultimoPagoMonto: montoCobrado,
        fechaUltimoPago: row.fechaUltimoPago || row.fechaUltimoCalculoMora || null
      };
    }

    return {
      montoCobrado: 0,
      punitorioCobrado: 0,
      compensatorioCobrado: 0,
      capitalCobrado: 0,
      ultimoPagoMonto: 0,
      fechaUltimoPago: null
    };
  };

  // Generador de datos del Cuadro de Amortización Francés (precisión financiera exacta)
  const getAmortizationData = (targetCliente = null) => {
    const p = targetCliente ? targetCliente.params : params;
    const s = targetCliente ? targetCliente.schedule : schedule;
    const client = targetCliente || (clienteId ? cartera.find(c => c.id === clienteId) : null);
    
    const capital = parseFloat(p.capital) || 0;
    const tna = parseFloat(p.tna) || 0;
    const periods = parseInt(p.weeks) || 0;
    const freq = p.frecuencia || 'semanal';
    const daysPerPeriod = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);

    const fechaOtorgamientoStr = getFechaOtorgamiento(p, client);
    const dOtorgamiento = parseISODate(fechaOtorgamientoStr) || new Date();
    const dPrimeraCuota = parseISODate(p.fechaInicio) || dOtorgamiento;
    const diffMs = dPrimeraCuota.getTime() - dOtorgamiento.getTime();
    const diasPrimeraCuota = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const diasEstandar = daysPerPeriod;

    const r = (tna / 100) * (daysPerPeriod / 365);
    const r1 = (tna / 100) * (diasPrimeraCuota / 365);

    let rows = [];
    let balance = capital;
    let totalAmort = 0;
    let totalInteresCompensatorio = 0;
    let totalCuotaPura = 0;
    let totalInteresPunitorio = 0;

    if (s && s.length > 0) {
      for (let i = 0; i < s.length; i++) {
        const item = s[i];
        const saldoInicial = balance;
        const currentRate = i === 0 ? r1 : r;
        const interest = typeof item.interest === 'number' && !isNaN(item.interest)
          ? item.interest 
          : Math.round(saldoInicial * currentRate * 100) / 100;
        
        let principal = 0;
        let cuota = item.cuotaPura || 0;
        let saldoFinal = 0;

        if (i === s.length - 1) {
          principal = saldoInicial;
          saldoFinal = 0;
        } else {
          principal = typeof item.principal === 'number' && !isNaN(item.principal)
            ? item.principal 
            : Math.round((cuota - interest) * 100) / 100;
          saldoFinal = Math.max(0, Math.round((saldoInicial - principal) * 100) / 100);
        }
        balance = saldoFinal;

        const lateDays = item.lateDays || 0;
        const lateInterest = typeof item.interes_punitorio_acumulado === 'number'
          ? item.interes_punitorio_acumulado 
          : (item.lateInterest || 0);
        const status = item.status || 'pending';

        const saldoCapitalCuota = typeof item.saldo_capital_cuota === 'number'
          ? item.saldo_capital_cuota
          : (status === 'paid' ? 0 : principal);
        const saldoCompCuota = typeof item.saldo_interes_compensatorio === 'number'
          ? item.saldo_interes_compensatorio
          : (status === 'paid' ? 0 : interest);

        totalAmort += principal;
        totalInteresCompensatorio += interest;
        totalCuotaPura += cuota;
        totalInteresPunitorio += lateInterest;

        const detalleCobro = getDetalleCobroCuota(item, p);

        rows.push({
          cuotaNum: item.week || (i + 1),
          fecha: item.fecha,
          saldoInicial,
          cuota,
          amortizacion: principal,
          interesCompensatorio: interest,
          saldoCapitalCuota,
          saldoCompCuota,
          saldoFinal,
          status,
          lateDays,
          lateInterest,
          montoCobrado: detalleCobro.montoCobrado,
          punitorioCobrado: detalleCobro.punitorioCobrado,
          totalExigible: item.totalToPay !== undefined ? item.totalToPay : (saldoCapitalCuota + saldoCompCuota + lateInterest)
        });
      }
    }

    const sellosRate = parseFloat(p.sellosRate) || 0;
    const sellosTax = Math.ceil(totalCuotaPura * (sellosRate / 100));
    const capitalNetoDesembolsado = Math.max(0, capital - sellosTax);

    // Flujos reales de fondos con fechas exactas para TEA y CFT EA
    const paymentsWithDays = [];
    if (s && s.length > 0) {
      for (let i = 0; i < s.length; i++) {
        const item = s[i];
        const cuotaDate = calculateEndDate(p.fechaInicio, i + 1, freq);
        let daysFromStart = diasPrimeraCuota + i * diasEstandar;
        if (cuotaDate && dOtorgamiento) {
          const diff = cuotaDate.getTime() - dOtorgamiento.getTime();
          daysFromStart = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
        }
        paymentsWithDays.push({
          amount: item.cuotaPura,
          days: daysFromStart
        });
      }
    }

    let tea = 0;
    let cftEa = 0;
    if (capital > 0 && paymentsWithDays.length > 0) {
      tea = solveAnnualRate(capital, paymentsWithDays);
      cftEa = solveAnnualRate(capitalNetoDesembolsado, paymentsWithDays);
    }

    return {
      clienteNombre: targetCliente ? targetCliente.nombre : (clienteNombre || 'Simulación Actual'),
      telefono: targetCliente ? targetCliente.telefono : clienteTelefono,
      capital,
      capitalNetoDesembolsado,
      sellosRate,
      sellosTax,
      tna,
      tea,
      cftEa,
      periods,
      freq,
      diasPrimeraCuota,
      diasEstandar,
      fechaOtorgamientoStr,
      fechaInicioStr: p.fechaInicio,
      rows,
      totales: {
        capital: totalAmort,
        interesCompensatorio: totalInteresCompensatorio,
        cuotaPura: totalCuotaPura,
        interesPunitorio: totalInteresPunitorio,
        totalGeneral: totalCuotaPura + totalInteresPunitorio
      }
    };
  };

  const abrirModalAmortizacionActual = () => {
    setAmortizationTarget(null);
    setShowAmortizationModal(true);
  };

  const abrirModalAmortizacionCliente = (c) => {
    setAmortizationTarget(c);
    setShowAmortizationModal(true);
  };

  const copiarAmortizacionParaExcel = (data) => {
    let tsv = "N°\tFecha de pago\tSaldo inicial\tCuota\tAmort de Capital\tInterés Compensatorio\tSaldo final\tDetalle\n";
    tsv += `0\t${data.fechaOtorgamientoStr}\t0.00\t-${data.sellosTax.toFixed(2)}\t0.00\t0.00\t${data.capital.toFixed(2)}\tDesembolso Inicial (Retención Sellos DGR ${data.sellosRate}% - Neto Entregado: ${data.capitalNetoDesembolsado.toFixed(2)})\n`;
    for (const r of data.rows) {
      tsv += `${r.cuotaNum}\t${r.fecha}\t${r.saldoInicial.toFixed(2)}\t${r.cuota.toFixed(2)}\t${r.amortizacion.toFixed(2)}\t${r.interesCompensatorio.toFixed(2)}\t${r.saldoFinal.toFixed(2)}\t${r.status || 'pendiente'}\n`;
    }
    tsv += `TOTALES\t\t\t${data.totales.cuotaPura.toFixed(2)}\t${data.totales.capital.toFixed(2)}\t${data.totales.interesCompensatorio.toFixed(2)}\t0.00\tCFT EA: ${data.cftEa.toFixed(2)}% | TEA: ${data.tea.toFixed(2)}%\n`;
    navigator.clipboard.writeText(tsv);
    triggerNotification("Cuadro copiado en formato Excel al portapapeles");
  };

  // --- LÓGICA DE API GEMINI ---
  const callGemini = async (prompt, systemPrompt) => {
    setAiLoading(true);
    
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const apiUrl = isLocalhost 
      ? 'http://127.0.0.1:5001/gyrconsultores-82422/us-central1/secureGeminiCall' 
      : 'https://us-central1-gyrconsultores-82422.cloudfunctions.net/secureGeminiCall';

    let delay = 1000;
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
          })
        });
        
        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Error response from backend:", errorBody);
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        const data = await response.json();
        setAiLoading(false);
        return data.text;
      } catch (err) {
        if (i === 2) {
          setAiLoading(false);
          triggerNotification("Error conectando con la IA. Intenta nuevamente más tarde.");
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  };

  const analizarRiesgoIA = async () => {
    const checklistStatus = checklist.map(c => `${c.text}: ${c.checked ? 'CUMPLIDO' : 'PENDIENTE'}`).join('\n');
    const prompt = `Analiza el riesgo de este microcrédito comercial en Tucumán, Argentina:
      Cliente: ${clienteNombre}
      Teléfono: ${clienteTelefono || 'No registrado'}
      Monto: ${formatCurrency(params.capital)}
      Plazo: ${params.weeks} cuotas (${params.frecuencia || 'semanal'})
      Tasa Anual: ${params.tna}%
      Estado de Documentación:
      ${checklistStatus}
      
      Dame un puntaje de riesgo del 1 al 10 (donde 10 es riesgo máximo) y 3 puntos clave de atención estratégica.`;
    
    const systemPrompt = "Eres un analista de riesgo crediticio senior para una consultora contable en Argentina. Tu tono es profesional, analítico y directo. Formatea la respuesta con negritas para los puntos clave.";
    
    const result = await callGemini(prompt, systemPrompt);
    if (result) setAiAnalysis(result);
  };

  // --- MOTOR DE CÁLCULO DE DEUDA Y MORA CONSOLIDADA (ARTS. 770 Y 903 CCCN) ---
  const parseLocalDate = (dateStr) => {
    if (!dateStr || dateStr === '---') return null;
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
  };

  // Simulación de la cascada de imputación legal (Art. 903 CCCN):
  // 1°) Cancelar interes_punitorio_acumulado
  // 2°) Cancelar saldo_interes_compensatorio
  // 3°) Remanente disminuye saldo_capital_cuota
  const simularImputacionArt903 = (cuota, monto) => {
    const montoNum = Math.round((parseFloat(monto) || 0) * 100) / 100;
    
    const principalOrig = typeof cuota.capitalOriginal === 'number' 
      ? cuota.capitalOriginal 
      : (typeof cuota.principal === 'number' ? cuota.principal : Math.max(0, cuota.cuotaPura - (cuota.interest || 0)));
    const interestOrig = typeof cuota.interesCompensatorioOriginal === 'number' 
      ? cuota.interesCompensatorioOriginal 
      : (typeof cuota.interest === 'number' ? cuota.interest : 0);

    const saldoPunitorio = cuota.interes_punitorio_acumulado !== undefined 
      ? cuota.interes_punitorio_acumulado 
      : (cuota.lateInterest || 0);
    const saldoCompensatorio = cuota.saldo_interes_compensatorio !== undefined 
      ? cuota.saldo_interes_compensatorio 
      : (cuota.status === 'paid' ? 0 : interestOrig);
    const saldoCapital = cuota.saldo_capital_cuota !== undefined 
      ? cuota.saldo_capital_cuota 
      : (cuota.status === 'paid' ? 0 : principalOrig);

    let remanente = montoNum;

    // 1° Cancelar interes_punitorio_acumulado
    const pagoPunitorio = Math.min(remanente, saldoPunitorio);
    const nuevoPunitorio = Math.round((saldoPunitorio - pagoPunitorio) * 100) / 100;
    remanente = Math.round((remanente - pagoPunitorio) * 100) / 100;

    // 2° Cancelar saldo_interes_compensatorio
    const pagoCompensatorio = Math.min(remanente, saldoCompensatorio);
    const nuevoCompensatorio = Math.round((saldoCompensatorio - pagoCompensatorio) * 100) / 100;
    remanente = Math.round((remanente - pagoCompensatorio) * 100) / 100;

    // 3° El remanente disminuye saldo_capital_cuota
    const pagoCapital = Math.min(remanente, saldoCapital);
    const nuevoCapital = Math.round((saldoCapital - pagoCapital) * 100) / 100;
    remanente = Math.round((remanente - pagoCapital) * 100) / 100;

    const totalExigibleRemanente = Math.round((nuevoCapital + nuevoCompensatorio + nuevoPunitorio) * 100) / 100;

    return {
      montoAbonado: montoNum,
      pagoPunitorio,
      pagoCompensatorio,
      pagoCapital,
      excedente: remanente,
      saldoPunitorioOriginal: saldoPunitorio,
      saldoCompensatorioOriginal: saldoCompensatorio,
      saldoCapitalOriginal: saldoCapital,
      nuevoPunitorio,
      nuevoCompensatorio,
      nuevoCapital,
      totalExigibleRemanente,
      esCancelacionTotal: totalExigibleRemanente <= 0
    };
  };

  // Ejecución efectiva de imputación registrando el comprobante en la cuota
  const ejecutarImputacionArt903 = (cuota, monto, fechaPagoStr = new Date().toISOString().split('T')[0]) => {
    const sim = simularImputacionArt903(cuota, monto);
    const historialPrevio = Array.isArray(cuota.pagos) ? cuota.pagos : [];

    const nuevoPagoRegistro = {
      id: Date.now().toString(),
      fecha: fechaPagoStr,
      montoTotal: sim.montoAbonado,
      imputacion: {
        punitorio: sim.pagoPunitorio,
        compensatorio: sim.pagoCompensatorio,
        capital: sim.pagoCapital,
        excedente: sim.excedente
      },
      nuevoSaldoCapital: sim.nuevoCapital
    };

    const isPaid = sim.esCancelacionTotal;
    const nuevosPagos = [...historialPrevio, nuevoPagoRegistro];
    const totalCobradoAcumulado = Math.round(nuevosPagos.reduce((acc, p) => acc + (Number(p.montoTotal) || 0), 0) * 100) / 100;

    const cuotaActualizada = {
      ...cuota,
      saldo_capital_cuota: sim.nuevoCapital,
      saldo_interes_compensatorio: sim.nuevoCompensatorio,
      interes_punitorio_acumulado: sim.nuevoPunitorio,
      lateInterest: sim.nuevoPunitorio,
      totalToPay: sim.totalExigibleRemanente,
      status: isPaid ? 'paid' : (cuota.lateDays > 0 ? 'late' : 'pending'),
      fechaUltimoCalculoMora: fechaPagoStr,
      pagos: nuevosPagos,
      montoCobrado: totalCobradoAcumulado,
      ultimoPagoMonto: sim.montoAbonado,
      fechaUltimoPago: fechaPagoStr
    };

    return { cuotaActualizada, detalle: nuevoPagoRegistro };
  };

  const abrirModalImputacion = (idx, cuota) => {
    setPaymentModalData({ index: idx, cuota });
    setMontoAbonoInput(cuota.totalToPay > 0 ? cuota.totalToPay.toString() : '');
  };

  const confirmarImputacionPago = () => {
    if (!paymentModalData) return;
    const monto = parseFloat(montoAbonoInput);
    if (isNaN(monto) || monto <= 0) {
      triggerNotification("Ingresa un monto válido a abonar");
      return;
    }
    const { index, cuota } = paymentModalData;
    const { cuotaActualizada } = ejecutarImputacionArt903(cuota, monto);

    const newSchedule = [...schedule];
    newSchedule[index] = cuotaActualizada;
    setSchedule(newSchedule);
    autoSaveCartera(newSchedule, checklist, clienteTelefono);

    setPaymentModalData(null);
    setMontoAbonoInput('');
    triggerNotification(`Pago de ${formatCurrency(monto)} imputado con éxito (Art. 903 CCCN)`);
  };

  // Cálculo diario de mora sin anatocismo (Art. 770 CCCN)
  // Base exclusiva: saldo_capital_cuota
  const checkAutoLateDays = (currentSchedule, currentParams) => {
    let changed = false;
    const now = new Date();
    now.setHours(0,0,0,0);
    const moraDailyRate = ((parseFloat(currentParams.moraTna) || 0) / 100) / 365;

    const newSchedule = currentSchedule.map(rawItem => {
      const principalOrig = typeof rawItem.capitalOriginal === 'number' 
        ? rawItem.capitalOriginal 
        : (typeof rawItem.principal === 'number' ? rawItem.principal : Math.max(0, rawItem.cuotaPura - (rawItem.interest || 0)));
      const interestOrig = typeof rawItem.interesCompensatorioOriginal === 'number' 
        ? rawItem.interesCompensatorioOriginal 
        : (typeof rawItem.interest === 'number' ? rawItem.interest : 0);

      let saldoCapital = rawItem.saldo_capital_cuota !== undefined 
        ? rawItem.saldo_capital_cuota 
        : (rawItem.status === 'paid' ? 0 : principalOrig);
      let saldoCompensatorio = rawItem.saldo_interes_compensatorio !== undefined 
        ? rawItem.saldo_interes_compensatorio 
        : (rawItem.status === 'paid' ? 0 : interestOrig);
      let punitorioAcumulado = rawItem.interes_punitorio_acumulado !== undefined 
        ? rawItem.interes_punitorio_acumulado 
        : (rawItem.status === 'paid' ? 0 : (rawItem.lateInterest || 0));

      if (rawItem.status === 'paid' || (saldoCapital <= 0 && saldoCompensatorio <= 0 && punitorioAcumulado <= 0)) {
        return {
          ...rawItem,
          status: 'paid',
          saldo_capital_cuota: 0,
          saldo_interes_compensatorio: 0,
          interes_punitorio_acumulado: 0,
          lateInterest: 0,
          totalToPay: 0
        };
      }

      const limitDate = parseLocalDate(rawItem.fecha);
      if (!limitDate) return rawItem;

      const diffTime = now.getTime() - limitDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        // Mora activa: fecha_actual > fecha_vencimiento
        // Base de cálculo: EXCLUSIVAMENTE saldo_capital_cuota (Sin anatocismo - Art. 770 CCCN)
        let nuevoPunitorio = punitorioAcumulado;

        if (rawItem.fechaUltimoCalculoMora) {
          const dUltimo = parseISODate(rawItem.fechaUltimoCalculoMora);
          if (dUltimo) {
            dUltimo.setHours(0,0,0,0);
            const diffUltimo = Math.floor((now.getTime() - dUltimo.getTime()) / (1000 * 60 * 60 * 24));
            if (diffUltimo > 0 && saldoCapital > 0) {
              const devengado = Math.round(saldoCapital * moraDailyRate * diffUltimo * 100) / 100;
              nuevoPunitorio = Math.round((punitorioAcumulado + devengado) * 100) / 100;
            }
          }
        } else {
          // Devengamiento diario simple directo sobre saldo_capital_cuota
          if (saldoCapital > 0) {
            nuevoPunitorio = Math.round(saldoCapital * moraDailyRate * diffDays * 100) / 100;
          }
        }

        const totalExigible = Math.round((saldoCapital + saldoCompensatorio + nuevoPunitorio) * 100) / 100;

        if (diffDays !== rawItem.lateDays || nuevoPunitorio !== rawItem.interes_punitorio_acumulado || rawItem.status !== 'late') {
          changed = true;
          return {
            ...rawItem,
            saldo_capital_cuota: saldoCapital,
            saldo_interes_compensatorio: saldoCompensatorio,
            interes_punitorio_acumulado: nuevoPunitorio,
            lateInterest: nuevoPunitorio,
            lateDays: diffDays,
            totalToPay: totalExigible,
            status: 'late',
            fechaUltimoCalculoMora: now.toISOString().split('T')[0]
          };
        }
      }

      return {
        ...rawItem,
        saldo_capital_cuota: saldoCapital,
        saldo_interes_compensatorio: saldoCompensatorio,
        interes_punitorio_acumulado: punitorioAcumulado,
        lateInterest: punitorioAcumulado,
        totalToPay: Math.round((saldoCapital + saldoCompensatorio + punitorioAcumulado) * 100) / 100
      };
    });

    return { newSchedule, changed };
  };

  // Cálculo consolidado de deuda con desglose de Capital, Compensatorio y Punitorio
  const calcularEstadoDeuda = (currentSchedule = schedule) => {
    const now = new Date();
    now.setHours(0,0,0,0);

    const cuotasVencidas = [];
    let totalCapitalVencido = 0;
    let totalCompensatorioVencido = 0;
    let totalCuotasVencidasPuras = 0;
    let totalInteresMora = 0;
    let totalDeudaVencida = 0;
    let proximaCuota = null;

    for (const item of currentSchedule) {
      if (item.status === 'paid') continue;

      const principalOrig = typeof item.capitalOriginal === 'number' 
        ? item.capitalOriginal 
        : (typeof item.principal === 'number' ? item.principal : Math.max(0, item.cuotaPura - (item.interest || 0)));
      const interestOrig = typeof item.interesCompensatorioOriginal === 'number' 
        ? item.interesCompensatorioOriginal 
        : (typeof item.interest === 'number' ? item.interest : 0);

      const saldoCapital = item.saldo_capital_cuota !== undefined ? item.saldo_capital_cuota : principalOrig;
      const saldoComp = item.saldo_interes_compensatorio !== undefined ? item.saldo_interes_compensatorio : interestOrig;
      const punitorio = item.interes_punitorio_acumulado !== undefined ? item.interes_punitorio_acumulado : (item.lateInterest || 0);
      const totalExigible = item.totalToPay !== undefined ? item.totalToPay : Math.round((saldoCapital + saldoComp + punitorio) * 100) / 100;

      if (item.status === 'late' || item.lateDays > 0) {
        cuotasVencidas.push({
          week: item.week,
          fecha: item.fecha,
          cuotaPura: item.cuotaPura,
          saldo_capital_cuota: saldoCapital,
          saldo_interes_compensatorio: saldoComp,
          interes_punitorio_acumulado: punitorio,
          lateDays: item.lateDays,
          lateInterest: punitorio,
          totalToPay: totalExigible,
          pagos: item.pagos || []
        });
        totalCapitalVencido += saldoCapital;
        totalCompensatorioVencido += saldoComp;
        totalCuotasVencidasPuras += (saldoCapital + saldoComp);
        totalInteresMora += punitorio;
        totalDeudaVencida += totalExigible;
      } else if (!proximaCuota && (item.status === 'pending' || !item.status)) {
        const fechaLimit = parseLocalDate(item.fecha);
        let diasParaVencer = null;
        if (fechaLimit) {
          const diff = fechaLimit - now;
          diasParaVencer = Math.ceil(diff / (1000 * 60 * 60 * 24));
        }
        proximaCuota = {
          week: item.week,
          fecha: item.fecha,
          cuotaPura: item.cuotaPura,
          saldo_capital_cuota: saldoCapital,
          saldo_interes_compensatorio: saldoComp,
          totalToPay: totalExigible,
          diasParaVencer: diasParaVencer
        };
      }
    }

    return {
      tieneMora: cuotasVencidas.length > 0,
      cuotasVencidas,
      totalCapitalVencido,
      totalCompensatorioVencido,
      totalCuotasVencidasPuras,
      totalInteresMora,
      totalDeudaVencida,
      proximaCuota
    };
  };

  // --- GENERACIÓN DE MENSAJES CON IA ---
  const generarMensajeCobranzaConsolidado = async () => {
    const estado = calcularEstadoDeuda(schedule);

    if (!estado.tieneMora) {
      triggerNotification("El cliente no posee cuotas vencidas a la fecha.");
      return;
    }

    const desgloseCuotas = estado.cuotasVencidas.map(c => 
      `• Cuota #${c.week} (Vto: ${c.fecha} | ${c.lateDays} días atraso): Capital Vencido: ${formatCurrency(c.saldo_capital_cuota)} + Int. Compensatorio: ${formatCurrency(c.saldo_interes_compensatorio)} + Int. Punitorio Mora (Art. 770 CCCN): ${formatCurrency(c.interes_punitorio_acumulado)} = Exigible: ${formatCurrency(c.totalToPay)}`
    ).join('\n');

    const proximaCuotaTexto = estado.proximaCuota
      ? `Próxima cuota (no vencida): Cuota #${estado.proximaCuota.week} con vencimiento el ${estado.proximaCuota.fecha} por ${formatCurrency(estado.proximaCuota.totalToPay)}.`
      : 'No registra cuotas pendientes posteriores.';

    const prompt = `Genera un mensaje de cobranza por WhatsApp para el cliente ${clienteNombre || 'Estimado Cliente'} emitido por Gramajo & Romero Consultores.

    DATOS EXACTOS CALCULADOS POR EL SISTEMA (Utiliza exactamente estos números, no los alteres ni dupliques):
    
    DESGLOSE DE CUOTAS VENCIDAS (CÁLCULO SIN ANATOCISMO - ARTS. 770 y 903 CCCN):
    ${desgloseCuotas}

    RESUMEN CONSOLIDADO:
    - Saldo de Capital puro vencido: ${formatCurrency(estado.totalCapitalVencido)}
    - Saldo de Interés compensatorio pactado: ${formatCurrency(estado.totalCompensatorioVencido)}
    - Intereses punitorios por mora devengados (sobre capital vencido): ${formatCurrency(estado.totalInteresMora)}
    - TOTAL EXIGIBLE A LA FECHA: ${formatCurrency(estado.totalDeudaVencida)}

    INFORMACIÓN DE PRÓXIMO VENCIMIENTO:
    ${proximaCuotaTexto}

    REGLAS DE REDACCIÓN:
    1. Saludo formal y profesional en español de Argentina.
    2. Detallar de forma ordenada y transparente cada una de las cuotas vencidas con su fecha de vencimiento original, días de mora, interés punitorio y subtotal exigible.
    3. Resaltar en negrita el TOTAL GENERAL EXIGIBLE a regularizar.
    4. Indicar que ante un pago parcial, conforme al Art. 903 del CCCN, los abonos se imputan primero a cancelar intereses punitorios, luego intereses compensatorios y el remanente a capital puro, recalculándose la mora futura exclusivamente sobre el saldo de capital remanente.
    5. Mencionar la fecha y monto de la próxima cuota a vencer para su debida planificación.
    6. Solicitar coordinar el pago o enviar el comprobante de transferencia bancaria.`;

    const systemPrompt = "Eres el especialista de cobranzas y gestión financiera de Gramajo & Romero Consultores en Tucumán, Argentina. Escribe mensajes profesionales, concisos, estructurados y perfectamente adaptados para WhatsApp con emojis sobrios.";

    setMsgModalMode('cobranza');
    const result = await callGemini(prompt, systemPrompt);
    if (result) {
      setAiCollectionMsg(result);
    }
  };

  const generarMensajeRecordatorioPreventivo = async () => {
    const estado = calcularEstadoDeuda(schedule);

    if (!estado.proximaCuota) {
      triggerNotification("No hay cuotas pendientes por vencer.");
      return;
    }

    const prompt = `Genera un mensaje recordatorio preventivo de WhatsApp para el cliente ${clienteNombre || 'Estimado Cliente'} emitido por Gramajo & Romero Consultores.

    DATOS DE LA PRÓXIMA CUOTA A VENCER:
    - Cuota: #${estado.proximaCuota.week}
    - Fecha de Vencimiento: ${estado.proximaCuota.fecha}
    - Monto a Abonar: ${formatCurrency(estado.proximaCuota.cuotaPura)}
    ${estado.tieneMora ? `ADVERTENCIA: El cliente registra también cuotas vencidas pendientes por un total de ${formatCurrency(estado.totalDeudaVencida)}. Mencionar brevemente la opción de regularizar todo junto.` : ''}

    REGLAS:
    1. Tono cordial, preventivo y de cortesía (recordatorio 1 día antes del vencimiento para evitar mora).
    2. Resaltar el número de cuota, la fecha límite de pago y el importe exacto.
    3. Indicar que una vez realizado el pago envíe el comprobante de transferencia por este medio.`;

    const systemPrompt = "Eres el asistente de atención al cliente y finanzas de Gramajo & Romero Consultores en Tucumán, Argentina. Tu tono es sumamente amable, preventivo y claro.";

    setMsgModalMode('recordatorio');
    const result = await callGemini(prompt, systemPrompt);
    if (result) {
      setAiCollectionMsg(result);
    }
  };

  const copiarMensajePortapapeles = () => {
    if (!aiCollectionMsg) return;
    navigator.clipboard.writeText(aiCollectionMsg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
    triggerNotification("Mensaje copiado al portapapeles");
  };

  const enviarWhatsAppDirecto = () => {
    if (!aiCollectionMsg) return;
    openWhatsApp(clienteTelefono, aiCollectionMsg);
  };

  const generateSchedule = () => {
    const tna = parseFloat(params.tna) || 0;
    const periods = parseInt(params.weeks) || 0;
    const capital = parseFloat(params.capital) || 0;
    const freq = params.frecuencia || 'semanal';
    const daysPerPeriod = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);

    const r = (tna / 100) * (daysPerPeriod / 365); 
    const n = periods;
    const c = capital;
    
    if (r <= 0 || n <= 0 || c <= 0) {
      setSchedule([]);
      return;
    }

    const cuotaExacta = c * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const cuotaFija = Math.ceil(cuotaExacta); 
    
    let balance = c;
    let newSchedule = [];
    
    for (let i = 1; i <= n; i++) {
      let interest = balance * r;
      let principal = cuotaFija - interest;
      balance -= principal;
      
      const principalRounded = Math.round(principal * 100) / 100;
      const interestRounded = Math.round(interest * 100) / 100;

      newSchedule.push({
        week: i,
        fecha: formatDateToLocal(calculateEndDate(params.fechaInicio, i, freq)),
        cuotaPura: cuotaFija,
        principal: principalRounded,
        interest: interestRounded,
        // Desglose de cuota y saldos (Art. 770 y 903 CCCN)
        saldo_capital_cuota: principalRounded,
        saldo_interes_compensatorio: interestRounded,
        interes_punitorio_acumulado: 0,
        capitalOriginal: principalRounded,
        interesCompensatorioOriginal: interestRounded,
        fechaUltimoCalculoMora: null,
        pagos: [],
        balance: Math.max(0, balance),
        status: 'pending', 
        lateDays: 0,
        lateInterest: 0,
        totalToPay: cuotaFija
      });
    }
    setSchedule(newSchedule);
  };

  useEffect(() => {
    if (!clienteId) {
      generateSchedule();
    }
  }, [params.capital, params.weeks, params.tna, params.frecuencia, params.fechaInicio, params.fechaOtorgamiento, clienteId]);

  // --- MANEJO DE EVENTOS ---
  const handleParamChange = (e) => {
    if (clienteId) return; 
    let { name, value } = e.target;
    
    if (name === 'fechaInicio') {
      setParams(prev => ({ ...prev, fechaInicio: value }));
      return;
    }

    if (name === 'fechaOtorgamiento') {
      const baseDate = parseISODate(value) || new Date();
      const freq = params.frecuencia || 'semanal';
      const days = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + days);
      setParams(prev => ({
        ...prev,
        fechaOtorgamiento: value,
        fechaInicio: nextDate.toISOString().split('T')[0]
      }));
      return;
    }

    if (name === 'frecuencia') {
      const freq = value;
      const baseDate = parseISODate(params.fechaOtorgamiento) || new Date();
      const days = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + days);
      setParams(prev => ({
        ...prev,
        frecuencia: freq,
        fechaInicio: nextDate.toISOString().split('T')[0]
      }));
      return;
    }

    if (value === '') {
      setParams(prev => ({ ...prev, [name]: '' }));
      return;
    }

    if (name === 'capital') {
      value = value.replace(/\./g, '');
    }

    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setParams(prev => ({ ...prev, [name]: numValue }));
    }
  };

  const updateLateDays = (index, days) => {
    const newSchedule = [...schedule];
    const item = { ...newSchedule[index] };
    const principalOrig = typeof item.capitalOriginal === 'number' 
      ? item.capitalOriginal 
      : (typeof item.principal === 'number' ? item.principal : Math.max(0, item.cuotaPura - (item.interest || 0)));
    const interestOrig = typeof item.interesCompensatorioOriginal === 'number' 
      ? item.interesCompensatorioOriginal 
      : (typeof item.interest === 'number' ? item.interest : 0);

    const saldoCapital = item.saldo_capital_cuota !== undefined ? item.saldo_capital_cuota : principalOrig;
    const saldoComp = item.saldo_interes_compensatorio !== undefined ? item.saldo_interes_compensatorio : interestOrig;

    item.lateDays = days;
    const moraDailyRate = ((parseFloat(params.moraTna) || 0) / 100) / 365;

    // BASE EXCLUSIVA: saldo_capital_cuota (Sin anatocismo - Art. 770 CCCN)
    const nuevoPunitorio = days > 0 && saldoCapital > 0 
      ? Math.round(saldoCapital * moraDailyRate * days * 100) / 100 
      : 0;

    item.interes_punitorio_acumulado = nuevoPunitorio;
    item.lateInterest = nuevoPunitorio;
    item.saldo_capital_cuota = saldoCapital;
    item.saldo_interes_compensatorio = saldoComp;
    item.totalToPay = Math.round((saldoCapital + saldoComp + nuevoPunitorio) * 100) / 100;

    if (days > 0 && item.status !== 'paid') {
      item.status = 'late';
    } else if (days === 0 && item.status === 'late') {
      item.status = 'pending';
    }

    newSchedule[index] = item;
    setSchedule(newSchedule);
    autoSaveCartera(newSchedule, checklist, clienteTelefono);
  };

  const togglePaymentStatus = (index) => {
    const newSchedule = [...schedule];
    const item = { ...newSchedule[index] };

    if (item.status === 'paid') {
      // Revertir a pendiente / mora restableciendo los saldos de capital e interés originales
      const principalOrig = typeof item.capitalOriginal === 'number' 
        ? item.capitalOriginal 
        : (typeof item.principal === 'number' ? item.principal : Math.max(0, item.cuotaPura - (item.interest || 0)));
      const interestOrig = typeof item.interesCompensatorioOriginal === 'number' 
        ? item.interesCompensatorioOriginal 
        : (typeof item.interest === 'number' ? item.interest : 0);

      item.saldo_capital_cuota = principalOrig;
      item.saldo_interes_compensatorio = interestOrig;

      const moraDailyRate = ((parseFloat(params.moraTna) || 0) / 100) / 365;
      const punitorio = item.lateDays > 0 ? Math.round(principalOrig * moraDailyRate * item.lateDays * 100) / 100 : 0;

      item.interes_punitorio_acumulado = punitorio;
      item.lateInterest = punitorio;
      item.totalToPay = Math.round((principalOrig + interestOrig + punitorio) * 100) / 100;
      item.status = item.lateDays > 0 ? 'late' : 'pending';
      item.pagos = [];
      item.montoCobrado = 0;
      item.ultimoPagoMonto = 0;
      item.fechaUltimoPago = null;
      item.fechaUltimoCalculoMora = null;

      newSchedule[index] = item;
    } else {
      // Cancelación total de la cuota con imputación en cascada Art. 903 CCCN
      const totalExigible = item.totalToPay || item.cuotaPura;
      const { cuotaActualizada } = ejecutarImputacionArt903(item, totalExigible);
      newSchedule[index] = cuotaActualizada;
      triggerNotification(`Cuota #${item.week} pagada — Valor cobrado: ${formatCurrency(cuotaActualizada.montoCobrado)}`);
    }

    setSchedule(newSchedule);
    autoSaveCartera(newSchedule, checklist, clienteTelefono);
  };

  const toggleChecklist = (id) => {
    const newChecklist = checklist.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    setChecklist(newChecklist);
    autoSaveCartera(schedule, newChecklist, clienteTelefono);
  };

  const handleTelefonoChange = (newPhone) => {
    setClienteTelefono(newPhone);
    if (clienteId && user) {
      autoSaveCartera(schedule, checklist, newPhone);
    }
  };

  const autoSaveCartera = async (updatedSchedule, updatedChecklist, updatedPhone = clienteTelefono) => {
    if (clienteId && user) {
      setIsSyncing(true);
      try {
        const currentClient = cartera.find(c => c.id === clienteId);
        const fechaOriginal = currentClient?.fechaCreacion || new Date().toLocaleDateString('es-AR');
        const docRef = doc(db, 'users', user.uid, 'microcredits', clienteId);
        await setDoc(docRef, {
          nombre: clienteNombre,
          telefono: updatedPhone || '',
          params: params,
          schedule: updatedSchedule,
          checklist: updatedChecklist,
          fechaCreacion: fechaOriginal,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Error guardando progreso", error);
        triggerNotification("Error sincronizando en la nube");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const guardarNuevoPrestamo = async () => {
    if (!clienteNombre.trim() || !user) return;
    setIsSyncing(true);
    const newId = Date.now().toString();
    const nuevoPrestamo = {
      nombre: clienteNombre,
      telefono: clienteTelefono || '',
      params: { ...params },
      schedule: [...schedule],
      checklist: [...checklist],
      fechaCreacion: new Date().toLocaleDateString('es-AR'),
      createdAt: new Date().toISOString()
    };
    
    try {
      const docRef = doc(db, 'users', user.uid, 'microcredits', newId);
      await setDoc(docRef, nuevoPrestamo);
      setClienteId(newId);
      triggerNotification("Préstamo guardado exitosamente");
    } catch (error) {
      triggerNotification("Error al guardar en la nube");
    } finally {
      setIsSyncing(false);
    }
  };

  const eliminarPrestamo = async (idToDelete) => {
    if (!user) return;
    if(window.confirm("¿Eliminar este préstamo permanentemente?")) {
       try {
          const docRef = doc(db, 'users', user.uid, 'microcredits', idToDelete);
          await deleteDoc(docRef);
          triggerNotification("Préstamo eliminado");
          if (clienteId === idToDelete) {
              iniciarNuevaSimulacion();
          }
       } catch(err) {
          console.error(err);
       }
    }
  };

  const gestionarCliente = async (cliente) => {
    setClienteId(cliente.id);
    setClienteNombre(cliente.nombre);
    setClienteTelefono(cliente.telefono || '');
    const clientParams = { ...cliente.params };
    if (!clientParams.fechaOtorgamiento) {
      clientParams.fechaOtorgamiento = getFechaOtorgamiento(cliente.params, cliente);
    }
    setParams(clientParams);
    setChecklist(cliente.checklist || defaultChecklist);
    setAiAnalysis(null);
    setAiCollectionMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });

    const { newSchedule, changed } = checkAutoLateDays(cliente.schedule, clientParams);
    setSchedule(newSchedule);

    if (changed && user) {
       try {
         setIsSyncing(true);
         const docRef = doc(db, 'users', user.uid, 'microcredits', cliente.id);
         await setDoc(docRef, {
            schedule: newSchedule,
            lastUpdated: new Date().toISOString()
         }, { merge: true });
       } catch (err) {
         console.error("Error al autoguardar mora", err);
       } finally {
         setIsSyncing(false);
       }
    }
  };

  const iniciarNuevaSimulacion = () => {
    setClienteId(null);
    setClienteNombre('');
    setClienteTelefono('');
    const today = new Date().toISOString().split('T')[0];
    const dInit = new Date();
    dInit.setDate(dInit.getDate() + 7);
    setParams({
      ...defaultParams,
      fechaOtorgamiento: today,
      fechaInicio: dInit.toISOString().split('T')[0]
    });
    setChecklist(defaultChecklist);
    setAiAnalysis(null);
    setAiCollectionMsg(null);
  };

  const triggerNotification = (msg) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3000);
  };

  const estadoDeuda = useMemo(() => calcularEstadoDeuda(schedule), [schedule]);

  const stats = useMemo(() => {
    const capital = parseFloat(params.capital) || 0;
    const tna = parseFloat(params.tna) || 0;
    const periods = parseInt(params.weeks) || 0;
    const sellosRate = parseFloat(params.sellosRate) || 0;
    const freq = params.frecuencia || 'semanal';
    const daysPerPeriod = freq === 'mensual' ? 30 : (freq === 'quincenal' ? 15 : 7);

    const totalPagar = schedule.length > 0 ? schedule[0].cuotaPura * periods : 0;
    const totalInterest = Math.max(0, totalPagar - capital);
    const sellosTax = Math.ceil(totalPagar * (sellosRate / 100)); 
    
    // Fechas de otorgamiento y 1ra cuota
    const currentClient = clienteId ? cartera.find(c => c.id === clienteId) : null;
    const fechaOtorgamientoStr = getFechaOtorgamiento(params, currentClient);
    const dOtorgamiento = parseISODate(fechaOtorgamientoStr) || new Date();
    const dPrimeraCuota = parseISODate(params.fechaInicio) || dOtorgamiento;

    const diffMs = dPrimeraCuota.getTime() - dOtorgamiento.getTime();
    const diasPrimeraCuota = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const diasPeriodoEstandar = daysPerPeriod;
    const tieneDesfasajeInicial = diasPrimeraCuota !== diasPeriodoEstandar;

    // Tasas proporcionales periódicas
    const tasaPeriodicaRegular = tna * (diasPeriodoEstandar / 365);
    const tasaPrimeraCuota = tna * (diasPrimeraCuota / 365);
    
    let freqLabel = 'Tasa Semanal';
    let freqCode = 'TNS';
    if (freq === 'mensual') {
      freqLabel = 'Tasa Mensual';
      freqCode = 'TNM';
    } else if (freq === 'quincenal') {
      freqLabel = 'Tasa Quincenal';
      freqCode = 'TNQ';
    }

    // Flujos reales de fondos con fechas exactas
    const paymentsWithDays = [];
    if (schedule.length > 0) {
      for (let i = 0; i < schedule.length; i++) {
        const row = schedule[i];
        const cuotaDate = calculateEndDate(params.fechaInicio, i + 1, freq);
        let daysFromStart = diasPrimeraCuota + i * diasPeriodoEstandar;
        if (cuotaDate && dOtorgamiento) {
          const diff = cuotaDate.getTime() - dOtorgamiento.getTime();
          daysFromStart = Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
        }
        paymentsWithDays.push({
          amount: row.cuotaPura,
          days: daysFromStart
        });
      }
    }

    let tea = 0;
    let cftEa = 0;
    if (capital > 0 && paymentsWithDays.length > 0) {
      tea = solveAnnualRate(capital, paymentsWithDays);
      const netCapital = Math.max(1, capital - sellosTax);
      cftEa = solveAnnualRate(netCapital, paymentsWithDays);
    }

    const tasaDirectaTotal = capital > 0 ? (totalInterest / capital) * 100 : 0;
    const mesesPlazo = ((periods * daysPerPeriod) / 30).toFixed(1);
    const recaudado = schedule.reduce((acc, row) => {
      return acc + getDetalleCobroCuota(row, params).montoCobrado;
    }, 0);
    const cuotasCobradasCount = schedule.filter(r => r.status === 'paid').length;
    const saldoRestante = schedule.filter(r => r.status !== 'paid').reduce((acc, row) => acc + (row.totalToPay || 0), 0);

    return { 
      totalInterest, 
      totalPagar, 
      tna,
      tasaPeriodicaRegular,
      tasaPrimeraCuota,
      freqLabel,
      freqCode,
      diasPrimeraCuota,
      diasPeriodoEstandar,
      tieneDesfasajeInicial,
      tea, 
      cftEa, 
      tasaDirectaTotal, 
      mesesPlazo, 
      recaudado, 
      cuotasCobradasCount,
      saldoRestante, 
      sellosTax 
    };
  }, [schedule, params, clienteId, cartera]);

  return (
    <div className="fade-in">
      {showNotification && (
        <div className="fixed top-20 right-5 bg-green-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[60] flex items-center gap-2 animate-bounce">
          <Check size={20} /> {showNotification}
        </div>
      )}

      {/* MODAL ANÁLISIS DE RIESGO */}
      {aiAnalysis && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col p-6 sm:p-8 relative animate-in zoom-in duration-300">
            <button onClick={() => setAiAnalysis(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors">
              <Plus className="rotate-45" size={24} />
            </button>
            <div className="flex items-center gap-3 mb-4 flex-shrink-0">
              <div className="bg-indigo-100 p-2.5 rounded-full text-indigo-600">
                <BrainCircuit size={24} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-800">✨ Análisis de Riesgo IA</h3>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 mb-6 scrollbar-thin scrollbar-thumb-slate-200">
              <div className="prose prose-slate max-w-none whitespace-pre-wrap text-slate-700 leading-relaxed text-sm sm:text-base">
                {aiAnalysis}
              </div>
            </div>
            <div className="flex-shrink-0 pt-3 border-t border-slate-100">
              <button onClick={() => setAiAnalysis(null)} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors">
                Cerrar Informe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MENSAJE DE COBRANZA / RECORDATORIO WHATSAPP */}
      {aiCollectionMsg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col p-6 sm:p-8 relative animate-in slide-in-from-bottom duration-300">
            <button onClick={() => setAiCollectionMsg(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 transition-colors">
              <Plus className="rotate-45" size={24} />
            </button>

            <div className="flex items-center justify-between gap-3 mb-4 flex-shrink-0 pr-8">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-2xl ${msgModalMode === 'cobranza' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                  {msgModalMode === 'cobranza' ? <MessageSquare size={24} /> : <BellRing size={24} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-800">
                    {msgModalMode === 'cobranza' ? '✨ Mensaje de Cobranza' : '✨ Recordatorio Preventivo'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {clienteNombre || 'Cliente'} • {clienteTelefono ? `WhatsApp: ${clienteTelefono}` : 'Sin teléfono cargado'}
                  </p>
                </div>
              </div>
            </div>

            {/* Selector de Modo */}
            <div className="flex gap-2 mb-4 bg-slate-100 p-1.5 rounded-2xl">
              <button 
                onClick={generarMensajeCobranzaConsolidado}
                disabled={aiLoading}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${msgModalMode === 'cobranza' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {aiLoading && msgModalMode === 'cobranza' ? <Loader2 size={14} className="animate-spin" /> : <AlertOctagon size={14} />}
                Cobranza Mora Consolidada
              </button>
              <button 
                onClick={generarMensajeRecordatorioPreventivo}
                disabled={aiLoading}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${msgModalMode === 'recordatorio' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {aiLoading && msgModalMode === 'recordatorio' ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
                Recordatorio (1 día antes)
              </button>
            </div>

            {/* Input rápido para teléfono si no tiene o quiere cambiarlo */}
            <div className="mb-3 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center gap-2">
              <Phone size={16} className="text-slate-400" />
              <input 
                type="tel"
                value={clienteTelefono}
                onChange={(e) => handleTelefonoChange(e.target.value)}
                placeholder="Teléfono/WhatsApp (Ej: 381 555 1234)"
                className="bg-transparent text-xs font-semibold text-slate-700 w-full outline-none"
              />
              {cleanWhatsAppNumber(clienteTelefono) && (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-md flex-shrink-0">
                  +{cleanWhatsAppNumber(clienteTelefono)}
                </span>
              )}
            </div>

            {/* Editor del mensaje generado */}
            <div className="flex-1 flex flex-col mb-4 overflow-hidden">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Edit3 size={12} /> Mensaje Editable
              </label>
              <textarea 
                value={aiCollectionMsg} 
                onChange={(e) => setAiCollectionMsg(e.target.value)}
                rows={9}
                className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-200 font-sans text-xs sm:text-sm text-slate-700 leading-relaxed outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none overflow-y-auto"
              />
            </div>

            {/* Botones de acción */}
            <div className="flex-shrink-0 pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
              <button 
                onClick={copiarMensajePortapapeles}
                className="flex-1 bg-slate-100 text-slate-700 font-bold py-3.5 px-4 rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                {copiedMsg ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                {copiedMsg ? '¡Copiado!' : 'Copiar Texto'}
              </button>

              <button 
                onClick={enviarWhatsAppDirecto}
                className="flex-1 bg-emerald-600 text-white font-bold py-3.5 px-4 rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2 text-xs sm:text-sm"
              >
                <Send size={18} />
                Enviar por WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CUADRO DE AMORTIZACIÓN FRANCÉS */}
      {showAmortizationModal && (() => {
        const data = getAmortizationData(amortizationTarget);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:fixed print:inset-0">
            <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 print:shadow-none print:border-none print:max-h-none print:w-full">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-700 via-emerald-800 to-teal-900 text-white p-5 sm:p-6 flex-shrink-0 flex items-center justify-between relative">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md">
                    <FileSpreadsheet size={24} className="text-emerald-200" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                        Cuadro de Amortización Francés
                      </h3>
                      <span className="text-[11px] font-bold bg-white/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider text-emerald-100">
                        {data.freq} • {data.periods} cuotas
                      </span>
                    </div>
                    <p className="text-xs text-emerald-100/90 font-medium mt-0.5">
                      {data.clienteNombre} {data.telefono ? `(${data.telefono})` : ''} • TNA: <span className="font-bold text-white">{data.tna}%</span> • TEA: <span className="font-bold text-white">{data.tea.toFixed(2)}%</span> • CFT EA: <span className="font-bold text-emerald-200">{data.cftEa.toFixed(2)}%</span> • 1er Vto: <span className="font-bold text-white">{data.diasPrimeraCuota} días</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 print:hidden">
                  <button 
                    onClick={() => copiarAmortizacionParaExcel(data)}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold p-2.5 rounded-xl transition-all border border-white/20 flex items-center gap-1.5 text-xs"
                    title="Copiar para pegar directamente en Excel (Ctrl+V)"
                  >
                    <Copy size={16} /> <span className="hidden sm:inline">Copiar Excel</span>
                  </button>
                  <button 
                    onClick={() => window.print()}
                    className="bg-white/10 hover:bg-white/20 text-white font-bold p-2.5 rounded-xl transition-all border border-white/20 flex items-center gap-1.5 text-xs"
                    title="Imprimir o Exportar PDF"
                  >
                    <Printer size={16} /> <span className="hidden sm:inline">Imprimir</span>
                  </button>
                  <button 
                    onClick={() => setShowAmortizationModal(false)}
                    className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors ml-1"
                  >
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>
              </div>

              {/* KPIs Resumen y Liquidación Inicial */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Capital Solicitado</span>
                  <span className="text-sm sm:text-base font-black text-slate-800 mt-1">{formatCurrencyWithDecimals(data.capital)}</span>
                  <span className="text-[9px] text-slate-400">Nominal financiado</span>
                </div>

                <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/70 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">(-) Sellos DGR ({data.sellosRate}%)</span>
                  <span className="text-sm sm:text-base font-black text-amber-700 mt-1">-{formatCurrencyWithDecimals(data.sellosTax)}</span>
                  <span className="text-[9px] text-amber-800/80">Retención inicial Tucumán</span>
                </div>

                <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">(=) Neto Entregado</span>
                  <span className="text-sm sm:text-base font-black text-emerald-700 mt-1">{formatCurrencyWithDecimals(data.capitalNetoDesembolsado)}</span>
                  <span className="text-[9px] text-emerald-700/80 font-medium">Base cálculo CFT</span>
                </div>

                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Int. Compensatorio</span>
                  <span className="text-sm sm:text-base font-black text-emerald-600 mt-1">{formatCurrencyWithDecimals(data.totales.interesCompensatorio)}</span>
                  <span className="text-[9px] text-slate-400">Pactado en cuotas</span>
                </div>

                <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">Total a Pagar</span>
                  <span className="text-sm sm:text-base font-black text-blue-700 mt-1">{formatCurrencyWithDecimals(data.totales.cuotaPura)}</span>
                  <span className="text-[9px] text-slate-400">{data.periods} cuotas fijas</span>
                </div>

                <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-200/80 shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">Costo Finan. Total</span>
                  <span className="text-sm sm:text-base font-black text-blue-700 mt-1">{data.cftEa.toFixed(2)}% <span className="text-xs font-bold text-blue-500">EA</span></span>
                  <span className="text-[9px] text-blue-600/80">TEA: {data.tea.toFixed(2)}%</span>
                </div>
              </div>

              {/* Tabla de Amortización */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#689f38] text-white uppercase text-[11px] font-bold tracking-wider">
                      <tr>
                        <th className="px-3 py-3 text-center">N°</th>
                        <th className="px-3 py-3">Fecha de pago</th>
                        <th className="px-4 py-3 text-right">Saldo inicial</th>
                        <th className="px-4 py-3 text-right">Cuota</th>
                        <th className="px-4 py-3 text-right">Amort de Capital</th>
                        <th className="px-4 py-3 text-right">Interés</th>
                        <th className="px-4 py-3 text-right">Saldo final</th>
                        {amortizationTarget && (
                          <th className="px-3 py-3 text-center">Estado</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {/* FILA 0: Momento Cero (t=0) - Otorgamiento, Desembolso y Retención Impuesto de Sellos DGR */}
                      <tr className="bg-amber-50/50 border-b-2 border-amber-200/60 hover:bg-amber-50/80 transition-colors">
                        <td className="px-3 py-3 text-center font-sans font-bold text-amber-900">
                          <span className="bg-amber-200/80 text-amber-950 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full inline-block shadow-xs">
                            0
                          </span>
                        </td>
                        <td className="px-3 py-3 font-sans font-semibold text-slate-800 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{data.fechaOtorgamientoStr}</span>
                            <span className="text-[10px] text-amber-800 font-sans font-semibold flex items-center gap-1">
                              Desembolso Inicial (t=0)
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-400 whitespace-nowrap">
                          $ 0,00
                        </td>
                        <td className="px-4 py-3 text-right font-black text-amber-800 whitespace-nowrap bg-amber-100/40">
                          <div className="flex flex-col items-end">
                            <span>-{formatCurrencyWithDecimals(data.sellosTax)}</span>
                            <span className="text-[9px] font-sans font-bold text-amber-700 uppercase tracking-tighter">
                              Sellos DGR {data.sellosRate}%
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-400 whitespace-nowrap">
                          ---
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-400 whitespace-nowrap">
                          ---
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900 whitespace-nowrap bg-slate-100/50">
                          {formatCurrencyWithDecimals(data.capital)}
                        </td>
                        {amortizationTarget && (
                          <td className="px-3 py-3 text-center font-sans whitespace-nowrap">
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Check size={10} strokeWidth={3} /> Neto: {formatCurrency(data.capitalNetoDesembolsado)}
                            </span>
                          </td>
                        )}
                      </tr>

                      {/* Cuotas 1 a N */}
                      {data.rows.map((r) => {
                        const isPaid = r.status === 'paid';
                        const isLate = r.status === 'late' || r.lateDays > 0;
                        return (
                          <tr key={r.cuotaNum} className={`hover:bg-slate-50/90 transition-colors ${r.cuotaNum % 2 === 0 ? 'bg-slate-50/40' : 'bg-white'} ${isPaid ? 'bg-emerald-50/30' : isLate ? 'bg-red-50/20' : ''}`}>
                            <td className="px-3 py-3 text-center font-sans font-bold text-slate-700">
                              {r.cuotaNum}
                            </td>
                            <td className="px-3 py-3 font-sans font-semibold text-slate-700 whitespace-nowrap">
                              {r.fecha}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-slate-600 whitespace-nowrap">
                              {formatCurrencyWithDecimals(r.saldoInicial)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-slate-900 whitespace-nowrap bg-slate-100/30">
                              {formatCurrencyWithDecimals(r.cuota)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                              {formatCurrencyWithDecimals(r.amortizacion)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-700 whitespace-nowrap">
                              {formatCurrencyWithDecimals(r.interesCompensatorio)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-700 whitespace-nowrap">
                              {formatCurrencyWithDecimals(r.saldoFinal)}
                            </td>
                            {amortizationTarget && (
                              <td className="px-3 py-3 text-center font-sans whitespace-nowrap">
                                {isPaid ? (
                                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <Check size={10} strokeWidth={3} /> Cobrada ({formatCurrency(r.montoCobrado || r.cuota)})
                                  </span>
                                ) : isLate ? (
                                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                    <AlertOctagon size={10} /> +{r.lateDays}d ({formatCurrency(r.lateInterest)})
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                    Pendiente
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-mono font-black text-slate-800 border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={2} className="px-3 py-3.5 text-center font-sans font-black text-xs uppercase tracking-wider text-slate-700">
                          Totales
                        </td>
                        <td className="px-4 py-3.5 text-right text-slate-400 font-normal">
                          ---
                        </td>
                        <td className="px-4 py-3.5 text-right text-blue-700 text-xs sm:text-sm">
                          {formatCurrencyWithDecimals(data.totales.cuotaPura)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-emerald-700 text-xs sm:text-sm">
                          {formatCurrencyWithDecimals(data.totales.capital)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-amber-700 text-xs sm:text-sm">
                          {formatCurrencyWithDecimals(data.totales.interesCompensatorio)}
                        </td>
                        <td className="px-4 py-3.5 text-right text-slate-900 text-xs sm:text-sm">
                          $ 0,00
                        </td>
                        {amortizationTarget && (
                          <td className="px-3 py-3.5 text-center font-sans text-[11px] text-slate-500 font-bold">
                            {data.totales.interesPunitorio > 0 ? `Punitorio: ${formatCurrency(data.totales.interesPunitorio)}` : 'Sin mora'}
                          </td>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Nota técnica explicativa */}
                <div className="mt-4 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl p-4 text-[11px] text-emerald-950 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <Calculator size={18} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Regla de Amortización Francesa y Punitorios (Arts. 770 y 903 CCCN):</strong> Las cuotas son periódicas y constantes. En cada vencimiento, el interés compensatorio se calcula sobre el saldo deudor remanente, amortizándose progresivamente una mayor porción de capital. Los intereses punitorios por mora se computan de forma separada exclusivamente sobre el saldo de capital vencido (<code className="font-bold text-emerald-900 bg-emerald-100 px-1 py-0.5 rounded">saldo_capital_cuota</code>) sin capitalización ni anatocismo (Art. 770 CCCN). Cualquier pago se imputa en orden legal: 1° Punitorios, 2° Compensatorios y 3° Capital puro (Art. 903 CCCN).
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 pt-2 border-t border-emerald-200/60">
                    <ShieldCheck size={18} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Base de Cálculo del Costo Financiero Total (CFT) y Fila 0:</strong> El Costo Financiero Total (CFT EA: <span className="font-bold text-emerald-900">{data.cftEa.toFixed(2)}%</span>) refleja la tasa de rendimiento real del crédito considerando que en la Fecha de Otorgamiento (<span className="font-semibold text-emerald-900">Fila 0</span>) se retiene el Impuesto de Sellos DGR Tucumán ({data.sellosRate}%: <span className="font-bold">-{formatCurrencyWithDecimals(data.sellosTax)}</span>), entregándose efectivamente al cliente un Neto de <span className="font-bold text-emerald-900">{formatCurrencyWithDecimals(data.capitalNetoDesembolsado)}</span> que amortiza el capital solicitado de <span className="font-semibold">{formatCurrencyWithDecimals(data.capital)}</span> a lo largo del cronograma de cuotas pactadas.
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex-shrink-0 flex justify-between items-center print:hidden">
                <span className="text-xs text-slate-400 font-medium">
                  Gramajo & Romero Consultores • Asesoría Financiera
                </span>
                <button 
                  onClick={() => setShowAmortizationModal(false)}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE IMPUTACIÓN DE PAGOS (ART. 903 CCCN) */}
      {paymentModalData && (() => {
        const { index, cuota } = paymentModalData;
        const sim = simularImputacionArt903(cuota, montoAbonoInput || 0);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[115] flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white p-5 sm:p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md">
                    <Receipt size={24} className="text-blue-200" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                      Imputar Pago (Art. 903 CCCN)
                    </h3>
                    <p className="text-xs text-blue-100/90 font-medium">
                      Cuota #{cuota.week} • Vencimiento: {cuota.fecha} {cuota.lateDays > 0 ? `(${cuota.lateDays}d mora)` : ''}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => { setPaymentModalData(null); setMontoAbonoInput(''); }}
                  className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 scrollbar-thin scrollbar-thumb-slate-200">
                {/* Desglose de saldos exigibles antes del pago */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <span>Composición Exigible de la Cuota</span>
                    <span className="text-blue-600 font-bold">Desglose Francés</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-xl border border-red-200 shadow-xs">
                      <span className="text-[10px] font-bold text-red-600 uppercase block">1° Punitorio</span>
                      <span className="text-xs sm:text-sm font-black text-red-700 mt-0.5 block">
                        {formatCurrency(sim.saldoPunitorioOriginal)}
                      </span>
                      <span className="text-[9px] text-slate-400">Sin anatocismo</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-amber-200 shadow-xs">
                      <span className="text-[10px] font-bold text-amber-700 uppercase block">2° Compensatorio</span>
                      <span className="text-xs sm:text-sm font-black text-amber-800 mt-0.5 block">
                        {formatCurrency(sim.saldoCompensatorioOriginal)}
                      </span>
                      <span className="text-[9px] text-slate-400">Interés pactado</span>
                    </div>

                    <div className="bg-white p-2.5 rounded-xl border border-emerald-200 shadow-xs">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase block">3° Saldo Capital</span>
                      <span className="text-xs sm:text-sm font-black text-emerald-800 mt-0.5 block">
                        {formatCurrency(sim.saldoCapitalOriginal)}
                      </span>
                      <span className="text-[9px] text-slate-400">Amortización pura</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/80 flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600">Total Exigible al Vencimiento:</span>
                    <span className="text-base font-black text-slate-900">
                      {formatCurrency(sim.saldoPunitorioOriginal + sim.saldoCompensatorioOriginal + sim.saldoCapitalOriginal)}
                    </span>
                  </div>
                </div>

                {/* Input de Monto a Abonar */}
                <div>
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 block">
                    Monto Abonado a Imputar (ARS)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
                    <input 
                      type="number" 
                      min="1"
                      step="any"
                      value={montoAbonoInput}
                      onChange={(e) => setMontoAbonoInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-3 pl-8 pr-4 text-base font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  {/* Botones de selección rápida */}
                  <div className="flex gap-2 mt-2">
                    <button 
                      type="button"
                      onClick={() => setMontoAbonoInput(cuota.totalToPay.toString())}
                      className="text-[11px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
                    >
                      Pagar Total ({formatCurrency(cuota.totalToPay)})
                    </button>
                    {(sim.saldoPunitorioOriginal + sim.saldoCompensatorioOriginal > 0) && (
                      <button 
                        type="button"
                        onClick={() => setMontoAbonoInput((sim.saldoPunitorioOriginal + sim.saldoCompensatorioOriginal).toString())}
                        className="text-[11px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors border border-amber-200"
                      >
                        Intereses ({formatCurrency(sim.saldoPunitorioOriginal + sim.saldoCompensatorioOriginal)})
                      </button>
                    )}
                  </div>
                </div>

                {/* Cascada de Imputación Legal en Tiempo Real */}
                {parseFloat(montoAbonoInput) > 0 && (
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wider">
                      <Scale size={14} className="text-indigo-600" /> Prelación de Imputación (Art. 903 CCCN)
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center bg-white/90 p-2 rounded-lg border border-indigo-100/60">
                        <span className="text-slate-600 font-medium">1° Cancelación Interés Punitorio:</span>
                        <div className="text-right">
                          <span className="font-bold text-red-600">-{formatCurrency(sim.pagoPunitorio)}</span>
                          <span className="text-[10px] text-slate-400 block">Queda: {formatCurrency(sim.nuevoPunitorio)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white/90 p-2 rounded-lg border border-indigo-100/60">
                        <span className="text-slate-600 font-medium">2° Cancelación Interés Compensatorio:</span>
                        <div className="text-right">
                          <span className="font-bold text-amber-700">-{formatCurrency(sim.pagoCompensatorio)}</span>
                          <span className="text-[10px] text-slate-400 block">Queda: {formatCurrency(sim.nuevoCompensatorio)}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center bg-white/90 p-2 rounded-lg border border-indigo-100/60">
                        <span className="text-slate-600 font-medium">3° Amortización de Saldo Capital:</span>
                        <div className="text-right">
                          <span className="font-bold text-emerald-700">-{formatCurrency(sim.pagoCapital)}</span>
                          <span className="text-[10px] font-bold text-emerald-900 block">Nuevo Capital: {formatCurrency(sim.nuevoCapital)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-indigo-200/60 flex justify-between items-center text-xs">
                      <span className="font-bold text-indigo-950">Total Exigible Remanente:</span>
                      <span className={`text-base font-black ${sim.totalExigibleRemanente === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                        {sim.totalExigibleRemanente === 0 ? 'CUOTA SALDADA ($0,00)' : formatCurrency(sim.totalExigibleRemanente)}
                      </span>
                    </div>

                    {sim.nuevoCapital > 0 && cuota.lateDays > 0 && (
                      <p className="text-[11px] text-indigo-800/90 italic bg-white/60 p-2.5 rounded-xl border border-indigo-100">
                        ⚖️ <strong>Regla sin Anatocismo:</strong> A partir de mañana el interés punitorio diario ({params.moraTna}% TNA / 365) se devengará únicamente sobre el nuevo saldo de capital de <strong>{formatCurrency(sim.nuevoCapital)}</strong>.
                      </p>
                    )}
                  </div>
                )}

                {/* Historial de pagos si existen */}
                {Array.isArray(cuota.pagos) && cuota.pagos.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Abonos Registrados en esta Cuota ({cuota.pagos.length})
                    </span>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                      {cuota.pagos.map((p, pIdx) => (
                        <div key={p.id || pIdx} className="bg-slate-50 border border-slate-200 p-2 rounded-xl text-[11px] flex justify-between items-center">
                          <div>
                            <span className="font-bold text-slate-700">{p.fecha}</span>: {formatCurrency(p.montoTotal)}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            Pun: {formatCurrency(p.imputacion?.punitorio || 0)} | Comp: {formatCurrency(p.imputacion?.compensatorio || 0)} | Cap: {formatCurrency(p.imputacion?.capital || 0)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
                <button 
                  type="button"
                  onClick={() => { setPaymentModalData(null); setMontoAbonoInput(''); }}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={confirmarImputacionPago}
                  disabled={!parseFloat(montoAbonoInput) || parseFloat(montoAbonoInput) <= 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 shadow-md shadow-emerald-200 transition-all cursor-pointer"
                >
                  <Check size={16} /> Confirmar Imputación
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Calculator className="text-blue-600 w-8 h-8" />
            Gestión de <span className="text-blue-600">Microcréditos</span>
          </h1>
          <p className="text-slate-500 font-medium flex items-center gap-2 flex-wrap mt-1">
            Análisis, Seguimiento y Cobranzas con IA ✨
            <span className={`text-[10px] uppercase font-bold flex items-center gap-1 px-2 py-0.5 rounded-full ${isSyncing ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                {isSyncing ? <Loader2 size={10} className="animate-spin" /> : <Cloud size={10} />}
                {isSyncing ? 'Sincronizando...' : 'Conectado a la Nube'}
            </span>
          </p>
        </div>
        {clienteId && (
          <button onClick={iniciarNuevaSimulacion} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
            <Plus size={18} /> Nueva Simulación
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* COLUMNA IZQUIERDA: PARÁMETROS Y RESÚMENES */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                    <TrendingUp size={20} className="text-blue-600" />
                    Parámetros
                </h2>
                {clienteNombre && (
                    <button 
                        onClick={analizarRiesgoIA}
                        disabled={aiLoading}
                        className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5 hover:bg-black disabled:opacity-50 transition-colors"
                    >
                        {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} className="text-amber-400" />}
                        Analizar Riesgo ✨
                    </button>
                )}
            </div>
            
            <div className="space-y-4">
              <div className="group">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Comercio / Cliente</label>
                <input 
                  type="text" 
                  value={clienteNombre} 
                  onChange={(e) => setClienteNombre(e.target.value)} 
                  disabled={!!clienteId}
                  placeholder="Ej. Diaz Alberto Carlos"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block flex items-center gap-1.5">
                  <Phone size={14} className="text-emerald-600" /> Celular / WhatsApp
                </label>
                <input 
                  type="tel" 
                  value={clienteTelefono} 
                  onChange={(e) => handleTelefonoChange(e.target.value)} 
                  placeholder="Ej: 381 555 1234 (con cód. área)"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-medium text-slate-700" 
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Capital (ARS)</label>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  name="capital" 
                  value={params.capital === '' ? '' : new Intl.NumberFormat('es-AR').format(params.capital)} 
                  onChange={handleParamChange} 
                  disabled={!!clienteId} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-60 font-mono text-lg font-bold text-slate-700" 
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Frecuencia</label>
                  <select name="frecuencia" value={params.frecuencia || 'semanal'} onChange={handleParamChange} disabled={!!clienteId} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none disabled:opacity-60 cursor-pointer text-sm font-medium">
                    <option value="semanal">Semanal</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">
                    Cant.
                  </label>
                  <input type="number" name="weeks" value={params.weeks === '' ? '' : params.weeks} onChange={handleParamChange} disabled={!!clienteId} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none disabled:opacity-60 font-bold" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">TNA %</label>
                  <input type="number" name="tna" value={params.tna === '' ? '' : params.tna} onChange={handleParamChange} disabled={!!clienteId} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none disabled:opacity-60 font-bold text-blue-600" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Mora TNA %</label>
                  <input type="number" name="moraTna" value={params.moraTna === '' ? '' : params.moraTna} onChange={handleParamChange} disabled={!!clienteId} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none disabled:opacity-60 font-bold text-red-600" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Calendar size={12} className="text-blue-600"/> Otorgamiento
                    </label>
                    <input 
                      type="date" 
                      name="fechaOtorgamiento" 
                      value={params.fechaOtorgamiento || getFechaOtorgamiento(params, clienteId ? cartera.find(c => c.id === clienteId) : null)} 
                      onChange={handleParamChange} 
                      disabled={!!clienteId} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none disabled:opacity-60 text-xs font-medium text-slate-700 cursor-pointer" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                      <Calendar size={12} className="text-emerald-600"/> 1ra Cuota
                    </label>
                    <input 
                      type="date" 
                      name="fechaInicio" 
                      value={params.fechaInicio || ''} 
                      onChange={handleParamChange} 
                      disabled={!!clienteId} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none disabled:opacity-60 text-xs font-medium text-slate-700 cursor-pointer" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                    <span className="font-semibold block text-slate-600">Primer Vto:</span>
                    <span className={`font-bold ${stats.tieneDesfasajeInicial ? 'text-amber-600' : 'text-slate-700'}`}>
                      {stats.diasPrimeraCuota} días {stats.tieneDesfasajeInicial ? `(${stats.diasPrimeraCuota > stats.diasPeriodoEstandar ? `+${stats.diasPrimeraCuota - stats.diasPeriodoEstandar}d gracia` : `${stats.diasPrimeraCuota - stats.diasPeriodoEstandar}d anticipo`})` : '(estándar)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Vto. Final</span>
                    <div className="w-full bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-blue-700 font-bold text-xs flex items-center">
                      {formatDateToLocal(calculateEndDate(params.fechaInicio, parseInt(params.weeks) || 0, params.frecuencia || 'semanal'))}
                    </div>
                  </div>
                </div>
              </div>

              {!clienteId && (
                <button 
                  onClick={guardarNuevoPrestamo}
                  disabled={isSyncing}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSyncing ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />} 
                  Guardar en Cartera
                </button>
              )}
            </div>
          </section>

          {/* TASAS */}
          <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-400" /> Tasas Proyectadas
              </span>
              {stats.tieneDesfasajeInicial && (
                <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                  1er Vto: {stats.diasPrimeraCuota}d
                </span>
              )}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  {/* TNA - SIEMPRE VISIBLE */}
                  <div className="flex flex-col bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Tasa Nominal Anual</span>
                    <span className="text-lg font-bold text-white mt-0.5">
                      {stats.tna.toFixed(2)}% <span className="text-xs font-normal text-slate-400">TNA</span>
                    </span>
                  </div>

                  {/* TASA PROPORCIONAL SEGÚN PLAZO (SEMANAL / QUINCENAL / MENSUAL) */}
                  <div className="flex flex-col bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{stats.freqLabel}</span>
                    <span className="text-lg font-bold text-emerald-400 mt-0.5">
                      {stats.tasaPeriodicaRegular.toFixed(2)}% <span className="text-xs font-normal text-slate-400">{stats.freqCode}</span>
                    </span>
                    {stats.tieneDesfasajeInicial && (
                      <span className="text-[10px] text-amber-300/90 mt-1">
                        1ra Cuota: <strong className="font-bold">{stats.tasaPrimeraCuota.toFixed(2)}%</strong> ({stats.diasPrimeraCuota}d)
                      </span>
                    )}
                  </div>

                  {/* TEA - SIEMPRE VISIBLE */}
                  <div className="flex flex-col bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Tasa Efectiva Anual</span>
                    <span className="text-lg font-bold text-indigo-400 mt-0.5">
                      {stats.tea.toFixed(2)}% <span className="text-xs font-normal text-slate-400">TEA</span>
                    </span>
                    {stats.tieneDesfasajeInicial && (
                      <span className="text-[9px] text-slate-400">Ajustada al 1er vto</span>
                    )}
                  </div>

                  {/* CFT - SIEMPRE VISIBLE */}
                  <div className="flex flex-col bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/30 shadow-inner">
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Costo Finan. Total</span>
                    <span className="text-xl font-black text-blue-300 mt-0.5">
                      {stats.cftEa.toFixed(2)}% <span className="text-xs font-bold opacity-80 text-blue-400">EA</span>
                    </span>
                    <span className="text-[9px] text-blue-300/70">Inc. sellos y fechas</span>
                  </div>
              </div>
            </div>
          </section>

          {/* RESUMEN OPERATIVO */}
          <section className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-lg shadow-blue-100">
            <h2 className="text-lg font-bold mb-4 border-b border-white/20 pb-2">Resumen Operativo</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="opacity-80">Capital Solicitado:</span>
                <span className="font-bold">{formatCurrency(parseFloat(params.capital) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm text-blue-200">
                <span className="opacity-80">Sellado DGR (1%):</span>
                <span className="font-bold">-{formatCurrency(stats.sellosTax)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-white/20">
                <span className="opacity-90 font-bold">A Entregar:</span>
                <span className="font-bold text-green-300 text-lg">{formatCurrency((parseFloat(params.capital) || 0) - stats.sellosTax)}</span>
              </div>
              <div className="pt-2 border-t border-white/20 flex justify-between items-center">
                <span className="font-bold text-lg">Monto Pagaré:</span>
                <span className="text-2xl font-black">{formatCurrency(stats.totalPagar)}</span>
              </div>
              {(clienteId || stats.recaudado > 0) && (
                <div className="pt-2 border-t border-white/20 flex justify-between items-center bg-emerald-500/20 border border-emerald-300/30 p-3 rounded-xl mt-2 shadow-inner">
                  <span className="font-bold text-base text-emerald-200 flex items-center gap-1.5">
                    <Coins size={16} /> Total Cobrado:
                  </span>
                  <span className="text-2xl font-black text-emerald-300">{formatCurrency(stats.recaudado)}</span>
                </div>
              )}
              {clienteId && (
                <div className="pt-2 border-t border-white/20 flex justify-between items-center bg-white/10 p-3 rounded-xl mt-2 shadow-inner">
                  <span className="font-bold text-lg text-amber-200">Saldo Restante:</span>
                  <span className="text-2xl font-black text-amber-300">{formatCurrency(stats.saldoRestante)}</span>
                </div>
              )}
              <button 
                onClick={abrirModalAmortizacionActual}
                className="w-full mt-3 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-colors border border-white/20 shadow-sm"
              >
                <FileSpreadsheet size={15} /> Ver Cuadro de Amortización Francés
              </button>
            </div>
          </section>
        </div>

        {/* COLUMNA DERECHA: CRONOGRAMA, ACCIONES DE COBRANZA Y CARTERA */}
        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Clock className="text-blue-600" />
                    Cronograma de Pagos
                  </h2>
                  {clienteId && (
                    <span className="text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                      {clienteNombre}
                    </span>
                  )}
                </div>
                {clienteTelefono && (
                  <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                    <Phone size={12} className="text-emerald-600" /> WhatsApp: <span className="font-semibold text-slate-700">{clienteTelefono}</span>
                  </p>
                )}
              </div>

              {/* Botones de acción: Cuadro Francés, Cobranza Mora y Recordatorio */}
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <button 
                  onClick={abrirModalAmortizacionActual}
                  className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                  title="Ver Cuadro de Amortización Francés detallado"
                >
                  <FileSpreadsheet size={15} />
                  Cuadro Francés
                </button>
                {estadoDeuda.tieneMora && (
                  <button 
                    onClick={generarMensajeCobranzaConsolidado}
                    disabled={aiLoading}
                    className="flex-1 sm:flex-none bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-red-200 transition-all"
                    title="Generar mensaje de cobranza consolidado con todas las cuotas vencidas e intereses"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    Cobranza Mora ({estadoDeuda.cuotasVencidas.length}) ✨
                  </button>
                )}
                {estadoDeuda.proximaCuota && (
                  <button 
                    onClick={generarMensajeRecordatorioPreventivo}
                    disabled={aiLoading}
                    className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-blue-200 transition-all"
                    title="Generar recordatorio preventivo 1 día antes del próximo vencimiento"
                  >
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />}
                    Recordatorio Próx. Cuota ✨
                  </button>
                )}
              </div>
            </div>

            {/* BANNER DE MORA CONSOLIDADA (Si hay cuotas vencidas) */}
            {estadoDeuda.tieneMora && (
              <div className="bg-red-50/80 border-b border-red-100 p-4 px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-100 text-red-600 rounded-2xl shadow-xs">
                    <AlertOctagon size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black uppercase text-red-700 tracking-wider">
                        {estadoDeuda.cuotasVencidas.length} {estadoDeuda.cuotasVencidas.length === 1 ? 'Cuota Vencida' : 'Cuotas Vencidas'} Impagas
                      </span>
                      <span className="text-[10px] bg-red-200/80 text-red-800 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Scale size={11} /> Arts. 770 y 903 CCCN
                      </span>
                    </div>
                    <span className="text-xs text-red-600 font-medium block mt-0.5">
                      Capital: <strong className="font-bold text-slate-800">{formatCurrency(estadoDeuda.totalCapitalVencido)}</strong> • Int. Compensatorio: <strong className="font-bold text-slate-800">{formatCurrency(estadoDeuda.totalCompensatorioVencido)}</strong> • Mora Punitoria Diaria: <strong className="font-bold text-red-700">{formatCurrency(estadoDeuda.totalInteresMora)}</strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-red-500 block">Total Exigible</span>
                    <span className="text-lg font-black text-red-700">{formatCurrency(estadoDeuda.totalDeudaVencida)}</span>
                  </div>
                  <button 
                    onClick={generarMensajeCobranzaConsolidado}
                    className="bg-red-600 text-white p-2.5 rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                    title="Crear mensaje WhatsApp con desglose de mora"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* BANNER DE REGISTRO DE COBROS ACUMULADOS (Si hay pagos registrados) */}
            {stats.recaudado > 0 && (
              <div className="bg-emerald-50/80 border-b border-emerald-100 p-3.5 px-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shadow-xs">
                    <Coins size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-black uppercase text-emerald-800 tracking-wider">
                        Registro de Cobros Efectuados
                      </span>
                      <span className="text-[10px] bg-emerald-200/80 text-emerald-900 font-bold px-2 py-0.5 rounded-md">
                        {stats.cuotasCobradasCount} de {schedule.length} cuotas canceladas
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-medium block mt-0.5">
                      Cada cuota abonada exhibe debajo su <strong className="font-bold">Valor Cobrado</strong> real (incluyendo mora si correspondiere).
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-emerald-600 block">Total Cobrado Acumulado</span>
                  <span className="text-lg font-black text-emerald-800">{formatCurrency(stats.recaudado)}</span>
                </div>
              </div>
            )}

            {/* TABLA DE CRONOGRAMA (PC / Tablet Horizontal >= 1024px) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-widest border-b">
                  <tr>
                    <th className="px-4 py-3.5 text-left">Cuota</th>
                    <th className="px-3 py-3.5 text-left">Desglose Cuota</th>
                    <th className="px-2 py-3.5 text-center">Días Mora</th>
                    <th className="px-3 py-3.5 text-right">Mora Punitoria</th>
                    <th className="px-3 py-3.5 text-right">Total Exigible</th>
                    <th className="px-4 py-3.5 text-center">Gestión de Pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedule.length > 0 ? schedule.map((row, idx) => {
                    const saldoCap = row.saldo_capital_cuota !== undefined ? row.saldo_capital_cuota : row.principal;
                    const saldoComp = row.saldo_interes_compensatorio !== undefined ? row.saldo_interes_compensatorio : row.interest;
                    const punitorio = row.interes_punitorio_acumulado !== undefined ? row.interes_punitorio_acumulado : (row.lateInterest || 0);
                    const tieneAbonos = Array.isArray(row.pagos) && row.pagos.length > 0;
                    const detalleCobro = getDetalleCobroCuota(row, params);
                    
                    return (
                      <tr key={idx} className={`group hover:bg-slate-50/80 transition-all ${row.status === 'paid' ? 'bg-emerald-50/30' : row.status === 'late' ? 'bg-red-50/20' : ''}`}>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="font-bold text-slate-800 block"># {row.week}</span>
                          <span className="text-[11px] font-bold text-blue-600 block mb-0.5">{row.fecha}</span>
                          {tieneAbonos && (
                            <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-full inline-block">
                              {row.pagos.length} {row.pagos.length === 1 ? 'abono' : 'abonos'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="text-left font-sans">
                            <span className="font-bold text-slate-800 text-xs block">{formatCurrency(row.cuotaPura)}</span>
                            <div className="flex flex-col 2xl:flex-row 2xl:items-center gap-0.5 2xl:gap-1.5 text-[10px] text-slate-500 mt-0.5 font-mono">
                              <span className="text-emerald-700 font-semibold whitespace-nowrap" title="Saldo de amortización de capital puro">
                                Cap: {formatCurrency(saldoCap)}
                              </span>
                              <span className="text-slate-300 hidden 2xl:inline">•</span>
                              <span className="text-amber-700 font-semibold whitespace-nowrap" title="Saldo de interés compensatorio pactado">
                                Int: {formatCurrency(saldoComp)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3.5 text-center">
                          <input 
                            type="number" 
                            min="0"
                            disabled={row.status === 'paid'}
                            value={row.lateDays || 0}
                            onChange={(e) => updateLateDays(idx, parseInt(e.target.value) || 0)}
                            className="w-14 mx-auto bg-slate-100 border-none rounded-lg p-1.5 text-center text-xs focus:ring-2 focus:ring-red-300 outline-none disabled:opacity-30 font-bold"
                          />
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          {punitorio > 0 ? (
                            <>
                              <span className="font-bold text-red-600 whitespace-nowrap">
                                +{formatCurrency(punitorio)}
                              </span>
                              <span className="text-[9px] text-red-500/90 block font-medium">s/capital puro</span>
                            </>
                          ) : detalleCobro.punitorioCobrado > 0 ? (
                            <div title="Mora punitoria efectivamente cobrada en esta cuota">
                              <span className="font-bold text-emerald-700 whitespace-nowrap block text-xs">
                                +{formatCurrency(detalleCobro.punitorioCobrado)}
                              </span>
                              <span className="text-[9px] text-emerald-600 font-semibold block">mora cobrada</span>
                            </div>
                          ) : (
                            <span className="font-bold text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <span className="font-black text-slate-900 block text-sm whitespace-nowrap">
                            {formatCurrency(row.totalToPay)}
                          </span>
                          {row.status === 'paid' ? (
                            <div className="flex flex-col items-end gap-1 mt-0.5">
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full inline-block">
                                Cancelada
                              </span>
                              <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-0.5 text-right shadow-xs whitespace-nowrap">
                                <span className="text-[8px] font-extrabold uppercase tracking-wider text-emerald-600 flex items-center justify-end gap-1">
                                  <Coins size={9} /> Cobrado
                                </span>
                                <span className="text-[11px] font-black text-emerald-800 font-mono block">
                                  {formatCurrency(detalleCobro.montoCobrado)}
                                </span>
                              </div>
                            </div>
                          ) : (saldoCap < (row.capitalOriginal || row.principal) || tieneAbonos) ? (
                            <div className="flex flex-col items-end gap-1 mt-0.5">
                              <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full inline-block">
                                Abono Parcial
                              </span>
                              {detalleCobro.montoCobrado > 0 && (
                                <div className="bg-amber-50 border border-amber-300 rounded-lg px-2 py-0.5 text-right shadow-xs whitespace-nowrap">
                                  <span className="text-[8px] font-extrabold uppercase tracking-wider text-amber-700 flex items-center justify-end gap-1">
                                    <Coins size={9} /> Abonado
                                  </span>
                                  <span className="text-[11px] font-black text-amber-900 font-mono block">
                                    {formatCurrency(detalleCobro.montoCobrado)}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : row.status === 'late' ? (
                            <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap">
                              En Mora (+{row.lateDays}d)
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full inline-block whitespace-nowrap">
                              Al día
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Botón Imputar Abono Art. 903 */}
                            <button 
                              onClick={() => abrirModalImputacion(idx, row)}
                              disabled={row.status === 'paid'}
                              className="px-2.5 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 rounded-xl transition-all border border-blue-200 shadow-xs flex items-center gap-1 text-xs font-bold cursor-pointer flex-shrink-0"
                              title="Imputar pago o abono conforme Art. 903 CCCN"
                            >
                              <Receipt size={14} className="text-blue-600" />
                              <span className="text-[11px]">Abonar</span>
                            </button>

                            {/* Botón Mensaje Cobranza IA */}
                            {row.status === 'late' && (
                              <button 
                                onClick={generarMensajeCobranzaConsolidado} 
                                className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-colors border border-red-200 flex-shrink-0" 
                                title="Generar mensaje de cobranza consolidado con IA ✨"
                              >
                                <MessageSquare size={16} />
                              </button>
                            )}

                            {/* Botón Cobro Rápido Total */}
                            <button 
                              onClick={() => togglePaymentStatus(idx)}
                              className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center transition-all border-2 cursor-pointer
                                ${row.status === 'paid' 
                                  ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' 
                                  : row.status === 'late' 
                                    ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' 
                                    : 'bg-white border-slate-200 text-slate-300 hover:border-slate-400'}
                              `}
                              title={row.status === 'paid' ? 'Revertir cobro' : 'Marcar como cobrada al 100% (Art. 903)'}
                            >
                              <Check size={18} strokeWidth={row.status === 'paid' ? 3 : 2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan="6" className="py-12 text-center text-slate-400 italic font-medium">
                        Configura los parámetros para ver el cronograma.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* VISTA TARJETAS CRONOGRAMA (Celular y Tablet Vertical < 1024px) */}
            <div className="lg:hidden divide-y divide-slate-100">
              {schedule.length > 0 ? schedule.map((row, idx) => {
                const saldoCap = row.saldo_capital_cuota !== undefined ? row.saldo_capital_cuota : row.principal;
                const saldoComp = row.saldo_interes_compensatorio !== undefined ? row.saldo_interes_compensatorio : row.interest;
                const punitorio = row.interes_punitorio_acumulado !== undefined ? row.interes_punitorio_acumulado : (row.lateInterest || 0);
                const tieneAbonos = Array.isArray(row.pagos) && row.pagos.length > 0;
                const detalleCobro = getDetalleCobroCuota(row, params);

                return (
                  <div key={idx} className={`p-4 space-y-3 ${row.status === 'paid' ? 'bg-emerald-50/35' : row.status === 'late' ? 'bg-red-50/25' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 text-sm">Cuota #{row.week}</span>
                          <span className="text-xs font-bold text-blue-600">{row.fecha}</span>
                          {tieneAbonos && (
                            <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-full">
                              {row.pagos.length} {row.pagos.length === 1 ? 'abono' : 'abonos'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 font-mono flex flex-wrap items-center gap-x-2">
                          <span className="font-bold text-slate-700">Cuota: {formatCurrency(row.cuotaPura)}</span>
                          <span className="text-emerald-700 font-semibold">Cap: {formatCurrency(saldoCap)}</span>
                          <span className="text-amber-700 font-semibold">Int: {formatCurrency(saldoComp)}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[9px] font-bold text-slate-400 uppercase block">Total Exigible</span>
                        <span className="font-black text-slate-900 text-base block">{formatCurrency(row.totalToPay)}</span>
                        {row.status === 'paid' ? (
                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            Cancelada
                          </span>
                        ) : row.status === 'late' ? (
                          <span className="text-[9px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            En Mora (+{row.lateDays}d)
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full inline-block mt-0.5">
                            Al día
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fila de Mora / Valor Cobrado y Controles de Pago */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Días Mora:</label>
                        <input
                          type="number"
                          min="0"
                          disabled={row.status === 'paid'}
                          value={row.lateDays || 0}
                          onChange={(e) => updateLateDays(idx, parseInt(e.target.value) || 0)}
                          className="w-14 bg-slate-100 border-none rounded-lg p-1 text-center text-xs font-bold outline-none disabled:opacity-40"
                        />
                        {punitorio > 0 && (
                          <span className="text-xs font-bold text-red-600">+{formatCurrency(punitorio)}</span>
                        )}
                        {row.status === 'paid' && (
                          <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-2 py-0.5 text-left">
                            <span className="text-[8px] font-extrabold uppercase text-emerald-600 flex items-center gap-1">
                              <Coins size={9} /> Cobrado: <strong className="font-mono text-emerald-800">{formatCurrency(detalleCobro.montoCobrado)}</strong>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          onClick={() => abrirModalImputacion(idx, row)}
                          disabled={row.status === 'paid'}
                          className="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 rounded-xl border border-blue-200 flex items-center gap-1 text-xs font-bold cursor-pointer"
                        >
                          <Receipt size={14} className="text-blue-600" /> Abonar
                        </button>
                        {row.status === 'late' && (
                          <button
                            onClick={generarMensajeCobranzaConsolidado}
                            className="p-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200"
                            title="Generar mensaje de cobranza con IA"
                          >
                            <MessageSquare size={15} />
                          </button>
                        )}
                        <button
                          onClick={() => togglePaymentStatus(idx)}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border-2 cursor-pointer ${
                            row.status === 'paid'
                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                              : row.status === 'late'
                                ? 'bg-red-50 border-red-200 text-red-500'
                                : 'bg-white border-slate-200 text-slate-400'
                          }`}
                        >
                          <Check size={18} strokeWidth={row.status === 'paid' ? 3 : 2} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="py-10 text-center text-slate-400 italic text-sm">
                  Configura los parámetros para ver el cronograma.
                </div>
              )}
            </div>
          </section>

          {/* CARTERA ACTIVA */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-blue-600" />
                Cartera Activa
              </h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full">{cartera.length} Clientes</span>
            </div>
            <div className="p-0">
              {cartera.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic">No hay registros guardados.</div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b">
                        <tr>
                          <th className="px-6 py-4">Cliente</th>
                          <th className="px-4 py-4">Teléfono</th>
                          <th className="px-4 py-4">Capital</th>
                          <th className="px-4 py-4 text-center">Estado / Progreso</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cartera.map((c) => {
                          const lateCount = c.schedule?.filter(s => s.status !== 'paid' && (s.status === 'late' || s.lateDays > 0)).length || 0;
                          const paidCount = c.schedule?.filter(s => s.status === 'paid').length || 0;
                          const totalQuotes = c.schedule?.length || c.params?.weeks || 1;
                          const isFinished = paidCount === totalQuotes && totalQuotes > 0;
                          
                          return (
                            <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${clienteId === c.id ? 'bg-blue-50/50' : ''}`}>
                              <td className="px-6 py-4">
                                <span className="font-bold text-slate-800 block">{c.nombre}</span>
                                <span className="text-[10px] text-slate-400 uppercase font-bold">{c.params?.frecuencia || 'semanal'}</span>
                              </td>
                              <td className="px-4 py-4 text-slate-600 text-xs font-mono">
                                {c.telefono ? (
                                  <span className="flex items-center gap-1 text-slate-700 font-medium">
                                    <Phone size={12} className="text-emerald-600" /> {c.telefono}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 italic">Sin registrar</span>
                                )}
                              </td>
                              <td className="px-4 py-4 font-mono font-bold text-slate-600">{formatCurrency(c.params?.capital)}</td>
                              <td className="px-4 py-4">
                                <div className="flex flex-col gap-1.5 items-center">
                                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500" style={{ width: `${(paidCount / totalQuotes) * 100}%` }} />
                                  </div>
                                  {isFinished ? (
                                    <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                                      Finalizado
                                    </span>
                                  ) : lateCount > 0 ? (
                                    <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                                      {lateCount} {lateCount === 1 ? 'cuota en mora' : 'cuotas en mora'}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">
                                      Al día
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right space-x-2">
                                <button onClick={() => abrirModalAmortizacionCliente(c)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Ver Cuadro de Amortización Francés"><FileSpreadsheet size={18} /></button>
                                <button onClick={() => gestionarCliente(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver y gestionar"><Eye size={18} /></button>
                                <button onClick={() => eliminarPrestamo(c.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar"><Trash2 size={18} /></button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Vista Tarjetas Cartera Activa (Celular) */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {cartera.map((c) => {
                      const lateCount = c.schedule?.filter(s => s.status !== 'paid' && (s.status === 'late' || s.lateDays > 0)).length || 0;
                      const paidCount = c.schedule?.filter(s => s.status === 'paid').length || 0;
                      const totalQuotes = c.schedule?.length || c.params?.weeks || 1;
                      const isFinished = paidCount === totalQuotes && totalQuotes > 0;

                      return (
                        <div key={c.id} className={`p-4 space-y-2.5 ${clienteId === c.id ? 'bg-blue-50/50' : ''}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-slate-800 block text-sm">{c.nombre}</span>
                              <span className="text-[10px] text-slate-400 uppercase font-bold">{c.params?.frecuencia || 'semanal'} • {paidCount}/{totalQuotes} cuotas</span>
                            </div>
                            <span className="font-mono font-black text-slate-800 text-sm">{formatCurrency(c.params?.capital)}</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${(paidCount / totalQuotes) * 100}%` }} />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div>
                              {isFinished ? (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">Finalizado</span>
                              ) : lateCount > 0 ? (
                                <span className="text-[10px] bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">{lateCount} en mora</span>
                              ) : (
                                <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-2 py-0.5 rounded-full">Al día</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => abrirModalAmortizacionCliente(c)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg"><FileSpreadsheet size={16} /></button>
                              <button onClick={() => gestionarCliente(c)} className="px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 rounded-lg flex items-center gap-1"><Eye size={14} /> Gestionar</button>
                              <button onClick={() => eliminarPrestamo(c.id)} className="p-2 text-red-500 bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* SCORING Y LEGAJO */}
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-800">
              <CheckSquare size={20} className="text-blue-600" />
              Scoring y Legajo
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {checklist.map(item => (
                <label key={item.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 cursor-pointer transition-all border border-transparent hover:border-slate-100">
                  <div className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center
                    ${item.checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-transparent'}`}>
                    <Check size={14} strokeWidth={4} />
                  </div>
                  <input type="checkbox" className="hidden" checked={item.checked} onChange={() => toggleChecklist(item.id)} />
                  <span className={`text-xs font-bold ${item.checked ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
