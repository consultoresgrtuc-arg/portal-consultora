import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const TerceroModal = ({ tercero, onClose }) => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        nombre: tercero?.nombre || '',
        cuit: tercero?.cuit || '',
        email: tercero?.email || '',
        telefono: tercero?.telefono || '',
        tipo: tercero?.tipo || 'Cliente'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    
    const handleChange = e => setFormData({...formData, [e.target.name]: e.target.value});

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || isSubmitting) return;

        setIsSubmitting(true);
        setError('');
        
        const dataToSave = {
            ...formData,
            nombre: formData.nombre.trim(),
            cuit: formData.cuit.trim(),
        };

        try {
            if (tercero) { // Editando
                await updateDoc(doc(db, 'users', user.uid, 'terceros', tercero.id), dataToSave);
            } else { // Creando
                await addDoc(collection(db, 'users', user.uid, 'terceros'), dataToSave);
            }
            onClose();
        } catch (error) {
            setError('Error al guardar los cambios. Inténtelo de nuevo.');
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
                            {tercero ? 'Editar Tercero' : 'Nuevo Tercero'}
                        </h3>
                        <p className="text-gray-500 text-sm font-medium mt-1">Registra un nuevo vínculo comercial.</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all">
                        <Icon name="X" size={24}/>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Nombre / Razón Social</label>
                        <input 
                            type="text" 
                            name="nombre" 
                            value={formData.nombre} 
                            onChange={handleChange} 
                            required 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            placeholder="Nombre completo"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">CUIT (sin guiones)</label>
                            <input 
                                type="text" 
                                name="cuit" 
                                value={formData.cuit} 
                                onChange={handleChange} 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                                placeholder="30123456789"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Tipo de Tercero</label>
                            <select 
                                name="tipo" 
                                value={formData.tipo} 
                                onChange={handleChange} 
                                className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800 cursor-pointer appearance-none"
                            >
                                <option value="Cliente">Cliente</option>
                                <option value="Proveedor">Proveedor</option>
                                <option value="Ambos">Ambos (Cliente/Prov)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Email de Contacto</label>
                        <input 
                            type="email" 
                            name="email" 
                            value={formData.email} 
                            onChange={handleChange} 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            placeholder="ejemplo@correo.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Teléfono / WhatsApp</label>
                        <input 
                            type="tel" 
                            name="telefono" 
                            value={formData.telefono} 
                            onChange={handleChange} 
                            className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"
                            placeholder="549..."
                        />
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
                            {isSubmitting ? 'Guardando...' : 'Guardar Tercero'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TerceroModal;
