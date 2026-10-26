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
  ShieldCheck
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
        const lateInterest = item.lateInterest || 0;
        const status = item.status || 'pending';

        totalAmort += principal;
        totalInteresCompensatorio += interest;
        totalCuotaPura += cuota;
        totalInteresPunitorio += lateInterest;

        rows.push({
          cuotaNum: item.week || (i + 1),
          fecha: item.fecha,
          saldoInicial,
          cuota,
          amortizacion: principal,
          interesCompensatorio: interest,
          saldoFinal,
          status,
          lateDays,
          lateInterest,
          totalExigible: cuota + lateInterest
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

  // --- MOTOR DE CÁLCULO DE DEUDA Y MORA CONSOLIDADA ---
  const parseLocalDate = (dateStr) => {
    if (!dateStr || dateStr === '---') return null;
    const [day, month, year] = dateStr.split('/');
    return new Date(year, month - 1, day);
  };

  const checkAutoLateDays = (currentSchedule, currentParams) => {
    let changed = false;
    const now = new Date();
    now.setHours(0,0,0,0);
    const moraDailyRate = (currentParams.moraTna / 100) / 365;

    const newSchedule = currentSchedule.map(item => {
      if (item.status === 'paid') return item;
      
      const limitDate = parseLocalDate(item.fecha);
      if (!limitDate) return item;
      
      const diffTime = now - limitDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) {
        if (diffDays !== item.lateDays || item.status !== 'late') {
          changed = true;
          const newLateDays = diffDays;
          const lateInterest = Math.ceil(item.cuotaPura * moraDailyRate * newLateDays);
          return {
            ...item,
            lateDays: newLateDays,
            lateInterest: lateInterest,
            totalToPay: item.cuotaPura + lateInterest,
            status: 'late'
          };
        }
      }
      return item;
    });

    return { newSchedule, changed };
  };

  // Cálculo consolidado para evitar cualquier duplicación
  const calcularEstadoDeuda = (currentSchedule = schedule) => {
    const now = new Date();
    now.setHours(0,0,0,0);

    const cuotasVencidas = [];
    let totalCuotasVencidasPuras = 0;
    let totalInteresMora = 0;
    let totalDeudaVencida = 0;
    let proximaCuota = null;

    for (const item of currentSchedule) {
      if (item.status === 'paid') continue;

      if (item.status === 'late' || item.lateDays > 0) {
        cuotasVencidas.push({
          week: item.week,
          fecha: item.fecha,
          cuotaPura: item.cuotaPura,
          lateDays: item.lateDays,
          lateInterest: item.lateInterest,
          totalToPay: item.totalToPay
        });
        totalCuotasVencidasPuras += item.cuotaPura;
        totalInteresMora += item.lateInterest;
        totalDeudaVencida += item.totalToPay;
      } else if (!proximaCuota && item.status === 'pending') {
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
          diasParaVencer: diasParaVencer
        };
      }
    }

    return {
      tieneMora: cuotasVencidas.length > 0,
      cuotasVencidas,
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
      `• Cuota #${c.week} (Vto: ${c.fecha} | ${c.lateDays} días atraso): ${formatCurrency(c.cuotaPura)} + Int. mora: ${formatCurrency(c.lateInterest)} = Subtotal: ${formatCurrency(c.totalToPay)}`
    ).join('\n');

    const proximaCuotaTexto = estado.proximaCuota
      ? `Próxima cuota (no vencida): Cuota #${estado.proximaCuota.week} con vencimiento el ${estado.proximaCuota.fecha} por ${formatCurrency(estado.proximaCuota.cuotaPura)}.`
      : 'No registra cuotas pendientes posteriores.';

    const prompt = `Genera un mensaje de cobranza por WhatsApp para el cliente ${clienteNombre || 'Estimado Cliente'} emitido por Gramajo & Romero Consultores.

    DATOS EXACTOS CALCULADOS POR EL SISTEMA (Utiliza exactamente estos números, no los alteres ni dupliques):
    
    DESGLOSE DE CUOTAS VENCIDAS:
    ${desgloseCuotas}

    RESUMEN CONSOLIDADO:
    - Capital de cuotas vencidas: ${formatCurrency(estado.totalCuotasVencidasPuras)}
    - Intereses por mora acumulados: ${formatCurrency(estado.totalInteresMora)}
    - TOTAL EXIGIBLE A LA FECHA: ${formatCurrency(estado.totalDeudaVencida)}

    INFORMACIÓN DE PRÓXIMO VENCIMIENTO:
    ${proximaCuotaTexto}

    REGLAS DE REDACCIÓN:
    1. Saludo formal y profesional en español de Argentina.
    2. Detallar de forma ordenada y limpia cada una de las cuotas vencidas con su fecha de vencimiento original, días de mora, interés y subtotal.
    3. Resaltar en negrita el TOTAL GENERAL EXIGIBLE a regularizar.
    4. Mencionar la fecha y monto de la próxima cuota a vencer para su debida planificación.
    5. Solicitar coordinar el pago o enviar el comprobante de transferencia bancaria.`;

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
      
      newSchedule.push({
        week: i,
        fecha: formatDateToLocal(calculateEndDate(params.fechaInicio, i, freq)),
        cuotaPura: cuotaFija,
        principal: principal,
        interest: interest,
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
    const item = newSchedule[index];
    item.lateDays = days;
    
    const moraDailyRate = (params.moraTna / 100) / 365;
    item.lateInterest = Math.ceil(item.cuotaPura * moraDailyRate * days); 
    item.totalToPay = item.cuotaPura + item.lateInterest;
    
    if (days > 0 && item.status !== 'paid') {
      item.status = 'late';
    } else if (days === 0 && item.status === 'late') {
      item.status = 'pending';
    }
    
    setSchedule(newSchedule);
    autoSaveCartera(newSchedule, checklist, clienteTelefono);
  };

  const togglePaymentStatus = (index) => {
    const newSchedule = [...schedule];
    const currentStatus = newSchedule[index].status;
    newSchedule[index].status = currentStatus === 'paid' 
      ? (newSchedule[index].lateDays > 0 ? 'late' : 'pending') 
      : 'paid';
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
    const recaudado = schedule.filter(r => r.status === 'paid').reduce((acc, row) => acc + row.totalToPay, 0);
    const saldoRestante = schedule.filter(r => r.status !== 'paid').reduce((acc, row) => acc + row.totalToPay, 0);

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
                                    <Check size={10} strokeWidth={3} /> Cobrada
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
                      <strong className="font-bold">Regla de Amortización Francesa:</strong> Las cuotas son periódicas y constantes. En cada vencimiento, el interés compensatorio se calcula sobre el saldo deudor remanente, amortizándose progresivamente una mayor porción de capital hasta saldar el préstamo. Los eventuales intereses punitorios por mora se computan de forma separada sobre los días de atraso de cada vencimiento impago sin alterar el interés compensatorio pactado.
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
                  <div className="p-2 bg-red-100 text-red-600 rounded-xl">
                    <AlertOctagon size={20} />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase text-red-700 tracking-wider block">
                      {estadoDeuda.cuotasVencidas.length} {estadoDeuda.cuotasVencidas.length === 1 ? 'Cuota Vencida' : 'Cuotas Vencidas'} Impagas
                    </span>
                    <span className="text-xs text-red-600 font-medium">
                      Capital: {formatCurrency(estadoDeuda.totalCuotasVencidasPuras)} + Intereses Mora: {formatCurrency(estadoDeuda.totalInteresMora)}
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
                    title="Crear mensaje WhatsApp"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* TABLA DE CRONOGRAMA */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-bold tracking-widest border-b">
                  <tr>
                    <th className="px-6 py-4 text-left">Cuota</th>
                    <th className="px-4 py-4 text-right">Monto Fijo</th>
                    <th className="px-4 py-4 text-center">Días Atraso</th>
                    <th className="px-4 py-4 text-right">Mora</th>
                    <th className="px-4 py-4 text-right">Total</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedule.length > 0 ? schedule.map((row, idx) => (
                    <tr key={idx} className={`group hover:bg-slate-50/80 transition-all ${row.status === 'paid' ? 'bg-emerald-50/30' : row.status === 'late' ? 'bg-red-50/20' : ''}`}>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-700 block"># {row.week}</span>
                        <span className="text-[11px] font-bold text-blue-600 block mb-1">{row.fecha}</span>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-600">
                        {formatCurrency(row.cuotaPura)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="number" 
                          min="0"
                          disabled={row.status === 'paid'}
                          value={row.lateDays}
                          onChange={(e) => updateLateDays(idx, parseInt(e.target.value) || 0)}
                          className="w-16 mx-auto bg-slate-100 border-none rounded-lg p-1.5 text-center text-xs focus:ring-2 focus:ring-red-300 outline-none disabled:opacity-30 font-bold"
                        />
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-red-500">
                        {row.lateInterest > 0 ? `+${formatCurrency(row.lateInterest)}` : '-'}
                      </td>
                      <td className="px-4 py-4 text-right font-black text-slate-900">
                        {formatCurrency(row.totalToPay)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                           {row.status === 'late' && (
                                <button 
                                  onClick={generarMensajeCobranzaConsolidado} 
                                  className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors" 
                                  title="Generar mensaje de cobranza consolidado con IA ✨"
                                >
                                    <MessageSquare size={18} />
                                </button>
                           )}
                           <button 
                            onClick={() => togglePaymentStatus(idx)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2
                                ${row.status === 'paid' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : row.status === 'late' ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' : 'bg-white border-slate-200 text-slate-300 hover:border-slate-400'}
                            `}
                            title={row.status === 'paid' ? 'Marcar como pendiente' : 'Marcar como cobrada'}
                            >
                            <Check size={20} />
                            </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                        <td colSpan="6" className="py-12 text-center text-slate-400 italic font-medium">
                            Configura los parámetros para ver el cronograma.
                        </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                <div className="overflow-x-auto">
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
