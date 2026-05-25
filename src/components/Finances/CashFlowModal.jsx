import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const CashFlowModal = ({ item, onClose }) => {
    const { user } = useAuth();
    const [type, setType] = useState('ingreso');
    const [category, setCategory] = useState('Ventas');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [periodicity, setPeriodicity] = useState('once');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (item) {
            setType(item.type || 'ingreso');
            setCategory(item.category || 'Ventas');
            setDescription(item.description || '');
            setAmount(item.amount || '');
            setDate(item.date || new Date().toISOString().split('T')[0]);
            setPeriodicity(item.periodicity || 'once');
        }
    }, [item]);

    // Cambiar la categoría por defecto cuando cambia el tipo
    useEffect(() => {
        if (!item) {
            if (type === 'ingreso') {
                setCategory('Ventas');
            } else {
                setCategory('Proveedores');
            }
        }
    }, [type, item]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user) return;
        setError('');

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            setError('Por favor, ingresa un monto válido mayor a 0.');
            return;
        }

        if (!description.trim()) {
            setError('Por favor, ingresa una descripción.');
            return;
        }

        setLoading(true);
        try {
            const dataPayload = {
                type,
                category,
                description: description.trim(),
                amount: numericAmount,
                date,
                periodicity,
                updatedAt: serverTimestamp()
            };

            if (item && item.id) {
                // Editar item existente
                const itemRef = doc(db, 'users', user.uid, 'cashflow_items', item.id);
                await updateDoc(itemRef, dataPayload);
            } else {
                // Crear nuevo item
                dataPayload.createdAt = serverTimestamp();
                const colRef = collection(db, 'users', user.uid, 'cashflow_items');
                await addDoc(colRef, dataPayload);
            }
            onClose();
        } catch (err) {
            console.error("Error saving cashflow item:", err);
            setError('Error al guardar el movimiento. Por favor, intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="backdrop-blur-2xl bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-2xl p-6 w-full max-w-md mx-4 text-white relative animate-fade-in">
                {/* Botón cerrar */}
                <button 
                    onClick={onClose} 
                    className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                >
                    <Icon name="X" size={16} />
                </button>

                <div className="mb-6">
                    <h3 className="text-xl font-black flex items-center gap-2">
                        <Icon name="FilePlus" className="text-blue-400" />
                        {item ? 'Editar Flujo Previsto' : 'Nuevo Flujo Previsto'}
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">Carga estimaciones de ingresos o egresos a futuro.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Selector de Tipo (Ingreso / Egreso) */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Tipo de Flujo</label>
                        <div className="grid grid-cols-2 gap-3 p-1 bg-slate-950/60 border border-slate-800 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setType('ingreso')}
                                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${type === 'ingreso' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Ingreso Previsto
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('egreso')}
                                className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${type === 'egreso' ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Egreso Previsto
                            </button>
                        </div>
                    </div>

                    {/* Categoría y Periodicidad */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Categoría</label>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full p-3 bg-slate-950/40 border border-slate-800 text-white rounded-xl focus:bg-slate-950/60 focus:border-blue-500 transition-all outline-none text-xs"
                            >
                                {type === 'ingreso' ? (
                                    <>
                                        <option value="Ventas" className="bg-slate-900">Ventas Proyectadas</option>
                                        <option value="Cobros" className="bg-slate-900">Cobros a Clientes</option>
                                        <option value="Otros Ingresos" className="bg-slate-900">Otros Ingresos</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="Proveedores" className="bg-slate-900">Proveedores</option>
                                        <option value="Salarios" className="bg-slate-900">Salarios y Cargas</option>
                                        <option value="Alquiler" className="bg-slate-900">Alquileres y Servicios</option>
                                        <option value="Impuestos" className="bg-slate-900">Impuestos (IVA/Otros)</option>
                                        <option value="Otros Egresos" className="bg-slate-900">Otros Egresos</option>
                                    </>
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Frecuencia</label>
                            <select
                                value={periodicity}
                                onChange={(e) => setPeriodicity(e.target.value)}
                                className="w-full p-3 bg-slate-950/40 border border-slate-800 text-white rounded-xl focus:bg-slate-950/60 focus:border-blue-500 transition-all outline-none text-xs"
                            >
                                <option value="once" className="bg-slate-900">Una vez (Único)</option>
                                <option value="weekly" className="bg-slate-900">Semanal</option>
                                <option value="monthly" className="bg-slate-900">Mensual</option>
                                <option value="quarterly" className="bg-slate-900">Trimestral</option>
                            </select>
                        </div>
                    </div>

                    {/* Descripción */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Descripción</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Ej: Pago de alquiler del local"
                            required
                            className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800 text-white placeholder-slate-600 focus:bg-slate-950/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none text-xs"
                        />
                    </div>

                    {/* Monto y Fecha */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Monto (ARS)</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-bold text-xs">$</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    required
                                    className="w-full pl-7 p-3 bg-slate-950/40 border border-slate-800 text-white placeholder-slate-600 focus:bg-slate-950/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none text-xs"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">Fecha Límite</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                                className="w-full p-3 bg-slate-950/40 border border-slate-800 text-white focus:bg-slate-950/60 focus:border-blue-500 transition-all outline-none text-xs rounded-xl"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs font-semibold text-center">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                        <button
                            type="button"
                            onClick={onClose}
                            className="py-2.5 px-4 bg-white/5 border border-white/10 text-slate-300 rounded-xl hover:bg-white/10 font-bold transition-all text-xs cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all text-xs cursor-pointer"
                        >
                            {loading ? 'Guardando...' : 'Guardar Movimiento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CashFlowModal;
