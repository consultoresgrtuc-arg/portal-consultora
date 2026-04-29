import React, { useState } from 'react';
import { db } from '../../firebase';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const OperationModal = ({ op, onClose }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        type: op?.type || 'venta',
        amount: op?.amount || '',
        description: op?.description || '',
        fechaEmision: op?.fechaEmision ? op.fechaEmision.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    const handleChange = e => setFormData({...formData, [e.target.name]: e.target.value});

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || isSubmitting) return;

        if (formData.amount <= 0) {
            setError('El monto debe ser mayor a cero.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        
        const localDate = new Date(formData.fechaEmision + 'T00:00:00-03:00'); // UTC-3 for AR
        
        const dataToSave = {
            type: formData.type,
            amount: parseFloat(formData.amount),
            description: formData.description.trim(),
            fechaEmision: Timestamp.fromDate(localDate),
            year: localDate.getFullYear(),
            month: localDate.getMonth() + 1,
            day: localDate.getDate()
        };

        try {
            if (op) { // Editing
                await updateDoc(doc(db, 'users', user.uid, 'operations', op.id), dataToSave);
            } else { // Creating
                await addDoc(collection(db, 'users', user.uid, 'operations'), dataToSave);
            }
            onClose();
        } catch (error) {
            setError('Error al guardar la operación.');
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-10 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                            {op ? 'Editar Registro' : 'Nueva Operación'}
                        </h3>
                        <p className="text-gray-500 text-sm font-medium mt-1">Ingresa los detalles financieros.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all">
                        <Icon name="X" size={24}/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Fecha</label>
                            <input 
                                type="date" 
                                name="fechaEmision" 
                                value={formData.fechaEmision} 
                                onChange={handleChange} 
                                required 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Tipo de Operación</label>
                            <select 
                                name="type" 
                                value={formData.type} 
                                onChange={handleChange} 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800 cursor-pointer appearance-none"
                            >
                                <option value="venta">Venta (Ingreso)</option>
                                <option value="ingreso">Otro Ingreso</option>
                                <option value="compra">Compra (Egreso)</option>
                                <option value="gasto">Gasto / Otros</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Monto de la Operación</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-5 flex items-center text-gray-400 font-bold">$</span>
                            <input 
                                type="number" 
                                step="0.01" 
                                name="amount" 
                                value={formData.amount} 
                                onChange={handleChange} 
                                onFocus={(e) => e.target.select()}
                                required 
                                className="w-full px-12 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-black text-2xl text-gray-800"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Descripción / Concepto</label>
                        <textarea 
                            name="description" 
                            value={formData.description} 
                            onChange={handleChange} 
                            required 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800 min-h-[100px] resize-none"
                            placeholder="Ej: Cobro factura de servicios..."
                        ></textarea>
                    </div>

                    {error && <p className="text-red-500 text-xs font-bold text-center italic">{error}</p>}

                    <div className="flex gap-4 pt-4">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-2xl transition-all"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting} 
                            className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Guardando...' : 'Guardar Registro'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OperationModal;
