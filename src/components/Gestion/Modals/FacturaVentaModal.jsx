import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { addDoc, collection, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import Icon from '../../Common/Icon';

const FacturaVentaModal = ({ isOpen, onClose, clienteId, clienteNombre, movimiento }) => {
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const isEditMode = movimiento && movimiento.id;

    const [formData, setFormData] = useState({
        numeroComprobante: '',
        fechaEmision: new Date().toISOString().split('T')[0],
        fechaVencimiento: '',
        montoTotal: '',
    });

    useEffect(() => {
        if (isOpen && movimiento) {
            setFormData({
                numeroComprobante: movimiento.numeroComprobante || '',
                fechaEmision: movimiento.fechaEmision?.toDate ? movimiento.fechaEmision.toDate().toISOString().split('T')[0] : (movimiento.fechaEmision || new Date().toISOString().split('T')[0]),
                fechaVencimiento: movimiento.fechaVencimiento?.toDate ? movimiento.fechaVencimiento.toDate().toISOString().split('T')[0] : (movimiento.fechaVencimiento || ''),
                montoTotal: movimiento.montoTotal || 0,
            });
            setIsSubmitting(false);
            setMessage('');
        }
    }, [isOpen, movimiento]);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? '' : parseFloat(value) || 0) : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.montoTotal <= 0) {
            setMessage('Error: El monto total debe ser mayor a cero.');
            return;
        }
        if (!formData.fechaVencimiento) {
            setMessage('Error: Por favor, ingrese una fecha de vencimiento.');
            return;
        }
        
        setIsSubmitting(true);
        setMessage('');

        const dataToSave = {
            terceroId: clienteId,
            numeroComprobante: formData.numeroComprobante,
            fechaEmision: Timestamp.fromDate(new Date(formData.fechaEmision + 'T00:00:00-03:00')),
            fechaVencimiento: Timestamp.fromDate(new Date(formData.fechaVencimiento + 'T00:00:00-03:00')),
            montoTotal: formData.montoTotal,
            saldoPendiente: formData.montoTotal, 
            estado: 'Pendiente'
        };

        try {
            if (isEditMode) {
                await updateDoc(doc(db, 'users', user.uid, 'facturasVenta', movimiento.id), dataToSave);
            } else {
                await addDoc(collection(db, 'users', user.uid, 'facturasVenta'), dataToSave);
            }
            onClose();
        } catch (err) {
            console.error(err);
            setMessage('Error al guardar la factura.');
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-10 animate-in fade-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                            {isEditMode ? 'Modificar Venta' : 'Nueva Factura de Venta'}
                        </h3>
                        <p className="text-gray-500 text-sm font-medium mt-1 italic">Cliente: {clienteNombre}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all">
                        <Icon name="X" size={24}/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">N° Comprobante</label>
                        <input 
                            type="text" 
                            name="numeroComprobante" 
                            value={formData.numeroComprobante} 
                            onChange={handleChange} 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            placeholder="0001-0000..."
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Fecha Emisión</label>
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
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Vencimiento</label>
                            <input 
                                type="date" 
                                name="fechaVencimiento" 
                                value={formData.fechaVencimiento} 
                                onChange={handleChange} 
                                required 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Monto Total</label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-5 flex items-center text-gray-400 font-bold">$</span>
                            <input 
                                type="number" 
                                name="montoTotal" 
                                value={formData.montoTotal} 
                                onChange={handleChange} 
                                onFocus={(e) => e.target.select()}
                                required 
                                className="w-full px-12 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-black text-2xl text-gray-800"
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>
                    </div>

                    {message && <p className="text-red-500 text-xs font-bold text-center italic">{message}</p>}

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
                            {isSubmitting ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Registrar Venta')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default FacturaVentaModal;
