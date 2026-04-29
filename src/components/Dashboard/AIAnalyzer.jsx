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
import Icon from '../Common/Icon';

const AIAnalyzer = () => {
    const [operations, setOperations] = useState([]);
    const { user } = useAuth();
    
    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'users', user.uid, 'operations'), orderBy("fechaEmision", "desc"), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setOperations(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribe();
    }, [user]);

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
            setError('No tienes operaciones registradas para analizar.');
            return;
        }

        setLoading(true);
        setResult('');
        setError('');

        const apiUrl = 'https://us-central1-gyrconsultores-82422.cloudfunctions.net/secureGeminiCall';

        const operationsContext = operations.map(op => 
            `- ${op.fechaEmision.toDate ? op.fechaEmision.toDate().toLocaleDateString('es-AR') : 'N/A'}: ${op.type} de ${op.amount.toFixed(2)} ARS (${op.description})`
        ).join('\n');

        const systemPrompt = "Actúa como un asistente financiero experto y conciso. Analiza los datos de operaciones proporcionados y responde la pregunta del usuario en español. Basa tu respuesta únicamente en los datos. Si la pregunta no se puede responder con los datos, indícalo. Formatea tu respuesta de forma clara y amigable.";
        const fullPrompt = `Basado en las siguientes operaciones financieras:\n\n${operationsContext}\n\nPor favor, responde a la siguiente pregunta: "${prompt}"`;

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

    return (
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 flex items-center">
                <Icon name="Sparkles" className="w-6 h-6 mr-2 text-yellow-500" />
                Análisis con IA
            </h3>
            <div className="space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ej: ¿Cuál fue mi mayor gasto este mes? o Dame consejos para reducir mis compras."
                    className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    rows="3"
                />
                <button
                    onClick={handleAnalysis}
                    disabled={loading}
                    className="w-full py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors shadow-sm font-bold"
                >
                    {loading ? 'Analizando...' : 'Analizar mis Finanzas'}
                </button>
                {error && <p className="text-sm text-red-600 text-center font-medium">{error}</p>}
                {loading && (
                    <div className="text-center text-gray-500">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                        <p>El asistente está pensando...</p>
                    </div>
                )}
                {result && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 shadow-inner">
                        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{result}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAnalyzer;
