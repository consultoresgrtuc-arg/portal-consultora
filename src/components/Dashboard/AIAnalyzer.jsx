import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';

const AIAnalyzer = () => {
    const [operations, setOperations] = useState([]);
    const { user } = useAuth();
    const { targetUserId, activeEntity, isViewingClient } = useClientSelection();
    const currentUid = targetUserId || user?.uid;
    
    useEffect(() => {
        if (!currentUid) return;
        const q = query(collection(db, 'users', currentUid, 'operations'), orderBy("fechaEmision", "desc"), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOperations(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribe();
    }, [currentUid]);

    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleAnalysis = async () => {
        if (!prompt.trim()) {
            setError('Por favor, escribe una pregunta.');
            return;
        }
         if (operations.length === 0) {
            setError(`No hay operaciones registradas para analizar en ${activeEntity?.displayName || 'esta cuenta'}.`);
            return;
        }

        setLoading(true);
        setResult('');
        setError('');

        const apiUrl = 'https://us-central1-gyrconsultores-82422.cloudfunctions.net/secureGeminiCall';

        const operationsContext = operations.map(op => 
            `- ${op.fechaEmision?.toDate ? op.fechaEmision.toDate().toLocaleDateString('es-AR') : 'N/A'}: ${op.type} de ${op.amount.toFixed(2)} ARS (${op.description})`
        ).join('\n');

        const entityLabel = isViewingClient ? `el cliente "${activeEntity?.displayName}" (CUIT: ${activeEntity?.cuit || 'S/D'})` : 'el Estudio Contable "GyR Consultores"';
        const systemPrompt = `Actúa como un asistente financiero experto y conciso. Estás analizando los datos contables de ${entityLabel}. Analiza los datos de operaciones proporcionados y responde la pregunta del usuario en español. Basa tu respuesta únicamente en los datos. Si la pregunta no se puede responder con los datos, indícalo. Formatea tu respuesta de forma clara y amigable.`;
        const fullPrompt = `Basado en las siguientes operaciones financieras registradas para ${entityLabel}:\n\n${operationsContext}\n\nPor favor, responde a la siguiente pregunta: "${prompt}"`;

        const payload = {
            contents: [{ parts: [{ text: fullPrompt }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                 const errorBody = await response.json();
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
        { label: '📊 Resumen ejecutivo', text: 'Realiza un resumen ejecutivo de los ingresos, egresos y saldo neto registrado.' },
        { label: '🔍 Mayores gastos', text: 'Identifica cuáles fueron los mayores gastos y compras registrados y su impacto.' },
        { label: '💡 Liquidez y ahorro', text: 'Dame 3 recomendaciones concretas para optimizar el flujo de caja y reducir costos.' },
        { label: '📈 Margen y rentabilidad', text: 'Evalúa la relación entre ingresos y egresos y diagnostica la rentabilidad actual.' }
    ];

    return (
        <div className="w-full bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-blue-100/70 flex flex-col justify-between">
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight flex items-center">
                        <Icon name="Sparkles" className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 text-blue-600" />
                        Análisis Financiero con IA
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            {operations.length} ops. en contexto
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
                    Selecciona una consulta rápida o escribe tu pregunta personalizada sobre las operaciones registradas:
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
                        ? `Ej: ¿Cuáles son las mayores compras de ${activeEntity?.name || activeEntity?.displayName}? o ¿Qué resumen de ventas tiene este mes?`
                        : "Ej: ¿Cuál fue el mayor egreso operativo del estudio este mes? o Resume la rentabilidad actual."
                    }
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-100 outline-none text-sm font-medium text-gray-800 transition-all resize-none"
                    rows="3"
                />
                <button
                    onClick={handleAnalysis}
                    disabled={loading}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-700 to-sky-700 text-white rounded-2xl hover:from-blue-800 hover:to-sky-800 disabled:opacity-50 transition-all shadow-md shadow-blue-500/20 font-black text-xs uppercase tracking-widest cursor-pointer"
                >
                    {loading ? 'Analizando operaciones...' : `Analizar Finanzas de ${isViewingClient ? (activeEntity?.name || activeEntity?.displayName) : 'Mi Estudio'}`}
                </button>
                {error && <p className="text-sm text-red-600 text-center font-medium">{error}</p>}
                {loading && (
                    <div className="text-center text-gray-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                        <p className="text-xs font-semibold">El asistente está procesando las operaciones...</p>
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
