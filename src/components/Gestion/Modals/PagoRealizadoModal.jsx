import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { addDoc, collection, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../../../context/AuthContext';
import Icon from '../../Common/Icon';

const PagoRealizadoModal = ({ isOpen, onClose, proveedorId, proveedorNombre, movimiento }) => {
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState('');
    const isEditMode = movimiento && movimiento.id;

    const [formData, setFormData] = useState({
        fechaPago: new Date().toISOString().split('T')[0],
        montoPagado: '',
        medioDePago: 'Transferencia',
        referencia: '',
        chequeNumero: '',
        chequeBanco: '',
        chequeFechaVencimiento: '',
        impactarOperaciones: true,
    });

    useEffect(() => {
        if (isOpen && movimiento) {
            setFormData({
                fechaPago: movimiento.fechaPago?.toDate ? movimiento.fechaPago.toDate().toISOString().split('T')[0] : (movimiento.fechaPago || new Date().toISOString().split('T')[0]),
                montoPagado: movimiento.montoPagado || 0,
                medioDePago: movimiento.medioDePago || 'Transferencia',
                referencia: movimiento.referencia || '',
                chequeNumero: '',
                chequeBanco: '',
                chequeFechaVencimiento: '',
                impactarOperaciones: movimiento.operationId ? true : !isEditMode,
            });
            setIsSubmitting(false);
            setMessage('');
        }
    }, [isOpen, movimiento]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? '' : parseFloat(value) || 0) : value)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.montoPagado <= 0) {
            setMessage('Error: El monto pagado debe ser mayor a cero.');
            return;
        }
        
        if (formData.medioDePago === 'Cheque' && !isEditMode) {
            if (!formData.chequeNumero || !formData.chequeBanco || !formData.chequeFechaVencimiento) {
                setMessage('Error: Complete todos los campos del cheque emitido.');
                return;
            }
        }
        
        setIsSubmitting(true);
        setMessage('');

        const localDate = new Date(formData.fechaPago + 'T00:00:00-03:00');
        const fechaTimestamp = Timestamp.fromDate(localDate);

        const dataToSave = {
            terceroId: proveedorId,
            fechaPago: fechaTimestamp,
            montoPagado: formData.montoPagado,
            medioDePago: formData.medioDePago,
            referencia: formData.referencia || '',
        };

        try {
            let operationId = movimiento?.operationId || null;

            // Sincronizar con colección operations (Caja / Dashboard)
            if (formData.impactarOperaciones) {
                const opData = {
                    type: 'compra',
                    amount: parseFloat(formData.montoPagado),
                    description: `Pago Cta. Cte. Proveedor - ${proveedorNombre}${formData.referencia ? ` (${formData.referencia})` : ''}`,
                    fechaEmision: fechaTimestamp,
                    year: localDate.getFullYear(),
                    month: localDate.getMonth() + 1,
                    day: localDate.getDate(),
                    origen: 'gestion_pago',
                    terceroId: proveedorId
                };

                if (operationId) {
                    await updateDoc(doc(db, 'users', user.uid, 'operations', operationId), opData);
                } else {
                    const opRef = await addDoc(collection(db, 'users', user.uid, 'operations'), opData);
                    operationId = opRef.id;
                }
            } else if (operationId) {
                // Si desmarcó el switch en modo edición, eliminar la operación previa
                try {
                    await deleteDoc(doc(db, 'users', user.uid, 'operations', operationId));
                } catch (delOpErr) {
                    console.warn("No se pudo eliminar la operación desvinculada:", delOpErr);
                }
                operationId = null;
            }

            dataToSave.operationId = operationId;

            if (isEditMode) {
                await updateDoc(doc(db, 'users', user.uid, 'pagosRealizados', movimiento.id), dataToSave);
            } else {
                const docRef = await addDoc(collection(db, 'users', user.uid, 'pagosRealizados'), dataToSave); 

                if (formData.medioDePago === 'Cheque') {
                    const chequeData = {
                        terceroId: proveedorId,
                        terceroNombre: proveedorNombre,
                        tipo: 'emitido', 
                        estado: 'Emitido',
                        numero: formData.chequeNumero,
                        banco: formData.chequeBanco,
                        fechaVencimiento: Timestamp.fromDate(new Date(formData.chequeFechaVencimiento + 'T00:00:00-03:00')),
                        fechaEmision: fechaTimestamp,
                        monto: formData.montoPagado,
                        pagoId: docRef.id 
                    };
                    await addDoc(collection(db, 'users', user.uid, 'cheques'), chequeData);
                }
            }
            onClose();
        } catch (err) {
            console.error(err);
            setMessage('Error al guardar el pago.');
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-10 animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                            {isEditMode ? 'Modificar Pago' : 'Registrar Pago Realizado'}
                        </h3>
                        <p className="text-gray-500 text-sm font-medium mt-1 italic">Proveedor: {proveedorNombre}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all">
                        <Icon name="X" size={24}/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Fecha de Pago</label>
                            <input 
                                type="date" 
                                name="fechaPago" 
                                value={formData.fechaPago} 
                                onChange={handleChange} 
                                required 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-emerald-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Monto Pagado</label>
                            <input 
                                type="number" 
                                name="montoPagado" 
                                value={formData.montoPagado} 
                                onChange={handleChange} 
                                onFocus={(e) => e.target.select()}
                                required 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-emerald-100 rounded-2xl transition-all outline-none font-black text-xl text-emerald-600"
                                placeholder="0.00"
                                step="0.01"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Medio de Pago</label>
                        <select 
                            name="medioDePago" 
                            value={formData.medioDePago} 
                            onChange={handleChange} 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-emerald-100 rounded-2xl transition-all outline-none font-bold text-gray-800 cursor-pointer disabled:opacity-50"
                            disabled={isEditMode}
                        >
                            <option>Transferencia</option>
                            <option>Efectivo</option>
                            <option>Cheque</option>
                            <option>Otro</option>
                        </select>
                        {isEditMode && formData.medioDePago === 'Cheque' && <p className="text-[10px] text-gray-400 italic">Los pagos con cheque deben gestionarse desde el módulo de Cheques.</p>}
                    </div>

                    {formData.medioDePago === 'Cheque' && !isEditMode && (
                        <div className="p-6 bg-emerald-50 rounded-[32px] space-y-4 border border-emerald-100 animate-in slide-in-from-top-4 duration-300">
                            <h4 className="text-xs font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                                <Icon name="Landmark" size={14}/> Datos del Cheque Propio (Emitido)
                            </h4>
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1">N° de Cheque</label>
                                    <input type="text" name="chequeNumero" value={formData.chequeNumero} onChange={handleChange} className="w-full px-4 py-3 bg-white border-transparent focus:ring-2 focus:ring-emerald-200 rounded-xl outline-none font-bold text-gray-800" placeholder="00001234"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1">Tu Banco</label>
                                    <input type="text" name="chequeBanco" value={formData.chequeBanco} onChange={handleChange} className="w-full px-4 py-3 bg-white border-transparent focus:ring-2 focus:ring-emerald-200 rounded-xl outline-none font-bold text-gray-800" placeholder="Ej: Banco Macro"/>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-1">Vencimiento del Cheque</label>
                                    <input type="date" name="chequeFechaVencimiento" value={formData.chequeFechaVencimiento} onChange={handleChange} className="w-full px-4 py-3 bg-white border-transparent focus:ring-2 focus:ring-emerald-200 rounded-xl outline-none font-bold text-gray-800"/>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Referencia (Opcional)</label>
                        <input 
                            type="text" 
                            name="referencia" 
                            value={formData.referencia} 
                            onChange={handleChange} 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-emerald-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            placeholder="Ej: Transferencia Banco X..."
                        />
                    </div>

                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div>
                            <span className="text-xs font-black text-gray-800 block">Registrar en Flujo de Caja (Operaciones)</span>
                            <span className="text-[10px] text-gray-400 font-medium">Sincroniza este pago como egreso en Dashboard y Reportes</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                name="impactarOperaciones" 
                                checked={formData.impactarOperaciones} 
                                onChange={handleChange} 
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
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
                            className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all transform active:scale-95 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Guardando...' : (isEditMode ? 'Guardar Cambios' : 'Registrar Pago')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default PagoRealizadoModal;
