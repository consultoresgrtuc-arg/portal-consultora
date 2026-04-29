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
  Calendar
} from 'lucide-react';
import { db, auth } from '../../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// --- CONFIGURACIÓN DE GEMINI API ---
const GEMINI_MODEL = "gemini-3-flash-preview"; // Actualizado a Gemini 3 (Flash Preview)

export default function MicrocreditsPanel({ userData }) {
  // --- CONFIGURACIÓN Y ESTADOS ---
  const defaultParams = {
    capital: 1000000,
    weeks: 12,
    frecuencia: 'semanal',
    fechaInicio: new Date().toISOString().split('T')[0],
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
  const [showNotification, setShowNotification] = useState(null);
  
  // Estados para la IA
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiCollectionMsg, setAiCollectionMsg] = useState(null);

  // Estados para la Nube
  const user = auth.currentUser;
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Cambiado a una colección dedicada 'microcredits' para mejor organización
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

  // --- UTILIDADES DE FECHAS ---
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

  const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);

  // --- LÓGICA DE API GEMINI ---
  // Nota: En producción, esto debería pasar por una Cloud Function para ocultar la API Key.
  // Pero para mantener tu lógica actual funcionando de inmediato:
  const callGemini = async (prompt, systemPrompt) => {
    setAiLoading(true);
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; // Recomendado usar .env
    
    let delay = 1000;
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
          })
        });
        
        if (!response.ok) throw new Error('API Error');
        
        const data = await response.json();
        setAiLoading(false);
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === 2) {
          setAiLoading(false);
          triggerNotification("Error conectando con la IA. Verifica tu API Key.");
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

  const generarMensajeCobranza = async (cuota) => {
    const prompt = `Genera un mensaje corto de WhatsApp para el cliente ${clienteNombre} que tiene un atraso de ${cuota.lateDays} días en su pago ${params.frecuencia || 'semanal'} de ${formatCurrency(cuota.totalToPay)}. La mora actual es de ${formatCurrency(cuota.lateInterest)}. Usa un tono ${cuota.lateDays > 7 ? 'firme pero profesional' : 'amable y recordatorio'}.`;
    
    const systemPrompt = "Eres el asistente de cobranzas de Gramajo & Romero Consultores. El mensaje debe ser profesional, incluir los montos y ser apto para WhatsApp en Argentina. No uses lenguaje de otros países.";
    
    const result = await callGemini(prompt, systemPrompt);
    if (result) setAiCollectionMsg(result);
  };

  // --- LÓGICA DE CÁLCULO ---
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
  }, [params.capital, params.weeks, params.tna, params.frecuencia, params.fechaInicio, clienteId]);

  // --- MANEJO DE EVENTOS ---
  const handleParamChange = (e) => {
    if (clienteId) return; 
    let { name, value } = e.target;
    
    if (name === 'frecuencia' || name === 'fechaInicio') {
      setParams(prev => ({ ...prev, [name]: value }));
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
    autoSaveCartera(newSchedule, checklist);
  };

  const togglePaymentStatus = (index) => {
    const newSchedule = [...schedule];
    const currentStatus = newSchedule[index].status;
    newSchedule[index].status = currentStatus === 'paid' 
      ? (newSchedule[index].lateDays > 0 ? 'late' : 'pending') 
      : 'paid';
    setSchedule(newSchedule);
    autoSaveCartera(newSchedule, checklist);
  };

  const toggleChecklist = (id) => {
    const newChecklist = checklist.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    setChecklist(newChecklist);
    autoSaveCartera(schedule, newChecklist);
  };

  const autoSaveCartera = async (updatedSchedule, updatedChecklist) => {
    if (clienteId && user) {
      setIsSyncing(true);
      try {
        const currentClient = cartera.find(c => c.id === clienteId);
        const fechaOriginal = currentClient?.fechaCreacion || new Date().toLocaleDateString('es-AR');
        const docRef = doc(db, 'users', user.uid, 'microcredits', clienteId);
        await setDoc(docRef, {
          nombre: clienteNombre,
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

  const gestionarCliente = (cliente) => {
    setClienteId(cliente.id);
    setClienteNombre(cliente.nombre);
    setParams(cliente.params);
    setSchedule(cliente.schedule);
    setChecklist(cliente.checklist);
    setAiAnalysis(null);
    setAiCollectionMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const iniciarNuevaSimulacion = () => {
    setClienteId(null);
    setClienteNombre('');
    setParams(defaultParams);
    setChecklist(defaultChecklist);
    setAiAnalysis(null);
    setAiCollectionMsg(null);
  };

  const triggerNotification = (msg) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3000);
  };

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
    
    const tnm = tna / 12;
    const r_weekly = (tna / 100) * (7 / 365);
    const tem = (Math.pow(1 + r_weekly, 30 / 7) - 1) * 100;
    const tea = (Math.pow(1 + r_weekly, 365 / 7) - 1) * 100;
    
    const tasaDirectaTotal = capital > 0 ? (totalInterest / capital) * 100 : 0;
    const mesesPlazo = ((periods * daysPerPeriod) / 30).toFixed(1);
    const recaudado = schedule.filter(r => r.status === 'paid').reduce((acc, row) => acc + row.totalToPay, 0);

    let cftEa = 0;
    if (schedule.length > 0 && capital > 0) {
        const cuotaFija = schedule[0].cuotaPura;
        const netCapital = capital - sellosTax; 
        let low = 0.0;
        let high = 1.0;
        let rate = 0.05;
        for (let i = 0; i < 40; i++) {
            let pv = cuotaFija * (1 - Math.pow(1 + rate, -periods)) / rate;
            if (pv > netCapital) low = rate;
            else high = rate;
            rate = (low + high) / 2;
        }
        cftEa = (Math.pow(1 + rate, 365 / daysPerPeriod) - 1) * 100;
    }

    return { totalInterest, totalPagar, tnm, tem, tea, cftEa, tasaDirectaTotal, mesesPlazo, recaudado, sellosTax };
  }, [schedule, params]);

  return (
    <div className="fade-in">
      {showNotification && (
        <div className="fixed top-20 right-5 bg-green-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[60] flex items-center gap-2 animate-bounce">
          <Check size={20} /> {showNotification}
        </div>
      )}

      {aiAnalysis && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative animate-in zoom-in duration-300">
            <button onClick={() => setAiAnalysis(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <Plus className="rotate-45" size={24} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-100 p-3 rounded-full text-indigo-600">
                <BrainCircuit size={28} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800">✨ Análisis de Riesgo IA</h3>
            </div>
            <div className="prose prose-slate max-w-none mb-8 whitespace-pre-wrap text-slate-700 leading-relaxed">
              {aiAnalysis}
            </div>
            <button onClick={() => setAiAnalysis(null)} className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors">
              Cerrar Informe
            </button>
          </div>
        </div>
      )}

      {aiCollectionMsg && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 relative animate-in slide-in-from-bottom duration-300">
            <button onClick={() => setAiCollectionMsg(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <Plus className="rotate-45" size={24} />
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-green-100 p-3 rounded-full text-green-600">
                <MessageSquare size={28} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800">✨ Mensaje de Cobranza</h3>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-6 font-medium text-slate-700">
              {aiCollectionMsg}
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                   const text = encodeURIComponent(aiCollectionMsg);
                   window.open(`https://wa.me/?text=${text}`, '_blank');
                }} 
                className="flex-1 bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                Enviar por WhatsApp
              </button>
              <button onClick={() => setAiCollectionMsg(null)} className="flex-1 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Calculator className="text-blue-600 w-8 h-8" />
            Gestión de <span className="text-blue-600">Microcréditos</span>
          </h1>
          <p className="text-slate-500 font-medium flex items-center gap-2 flex-wrap mt-1">
            Análisis y Seguimiento Financiero con IA ✨
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
                  placeholder="Ej. Almacén Tucumán"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-60"
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

              <div className="grid grid-cols-3 gap-3">
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
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1"><Calendar size={12}/> 1ra Cuota</label>
                  <input type="date" name="fechaInicio" value={params.fechaInicio || ''} onChange={handleParamChange} disabled={!!clienteId} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none disabled:opacity-60 text-sm font-medium text-slate-700 cursor-pointer" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Vencimiento</label>
                  <div className="w-full bg-blue-50 border border-blue-100 rounded-xl p-3 text-blue-700 font-bold opacity-90 text-sm flex items-center h-[46px]">
                    {formatDateToLocal(calculateEndDate(params.fechaInicio, parseInt(params.weeks) || 0, params.frecuencia || 'semanal'))}
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

          <section className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-800 pb-2 flex items-center gap-2">
              <TrendingUp size={16} /> Tasas Proyectadas
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Nominal Mensual</span>
                    <span className="text-lg font-bold">{stats.tnm.toFixed(2)}% <span className="text-xs font-normal text-slate-500">TNM</span></span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Efectiva Mensual</span>
                    <span className="text-lg font-bold text-blue-400">{stats.tem.toFixed(2)}% <span className="text-xs font-normal text-slate-500">TEM</span></span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] text-slate-400 uppercase tracking-wider">Efectiva Anual</span>
                    <span className="text-lg font-bold text-indigo-400">{stats.tea.toFixed(2)}% <span className="text-xs font-normal text-slate-500">TEA</span></span>
                  </div>
                  <div className="flex flex-col bg-blue-500/10 p-2 -m-2 rounded-lg border border-blue-500/20">
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Costo Finan. Total</span>
                    <span className="text-xl font-black text-blue-400">{stats.cftEa.toFixed(2)}% <span className="text-xs font-bold opacity-80">EA</span></span>
                  </div>
              </div>
            </div>
          </section>

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
            </div>
          </section>
        </div>

        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Clock className="text-blue-600" />
                Cronograma de Pagos
                {clienteId && <span className="ml-2 text-blue-600 bg-blue-50 px-3 py-1 rounded-full text-xs uppercase tracking-widest">{clienteNombre}</span>}
              </h2>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-400 block uppercase">Cobrado</span>
                <span className="text-xl font-black text-green-600">{formatCurrency(stats.recaudado)}</span>
              </div>
            </div>

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
                    <tr key={idx} className={`group hover:bg-slate-50/80 transition-all ${row.status === 'paid' ? 'bg-emerald-50/30' : ''}`}>
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
                                <button onClick={() => generarMensajeCobranza(row)} className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors" title="Mensaje IA ✨">
                                    <MessageSquare size={18} />
                                </button>
                           )}
                           <button 
                            onClick={() => togglePaymentStatus(idx)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border-2
                                ${row.status === 'paid' ? 'bg-emerald-500 border-emerald-500 text-white' : row.status === 'late' ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white border-slate-200 text-slate-300'}
                            `}
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
                        <th className="px-4 py-4">Capital</th>
                        <th className="px-4 py-4 text-center">Progreso</th>
                        <th className="px-6 py-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cartera.map((c) => (
                        <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${clienteId === c.id ? 'bg-blue-50/50' : ''}`}>
                          <td className="px-6 py-4">
                            <span className="font-bold text-slate-800 block">{c.nombre}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-bold">{c.params?.frecuencia || 'semanal'}</span>
                          </td>
                          <td className="px-4 py-4 font-mono font-bold text-slate-600">{formatCurrency(c.params.capital)}</td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${(c.schedule?.filter(s => s.status === 'paid').length / (c.params?.weeks || 1)) * 100}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button onClick={() => gestionarCliente(c)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye size={18} /></button>
                            <button onClick={() => eliminarPrestamo(c.id)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

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
