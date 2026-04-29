import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const ProfilePage = () => {
    const { user, userData } = useAuth();
    const [profile, setProfile] = useState({ 
        nombre: '', 
        cuit: '', 
        actividad: '', 
        categoriaTributaria: 'Monotributo', 
        telefono: '' 
    });
    const [message, setMessage] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => { 
        if (userData) {
            setProfile(prev => ({
                ...prev, 
                nombre: userData.nombre || '',
                cuit: userData.cuit || '',
                actividad: userData.actividad || '',
                categoriaTributaria: userData.categoriaTributaria || 'Monotributo',
                telefono: userData.telefono || ''
            })); 
        }
    }, [userData]);
    
    const handleChange = (e) => setProfile(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!user || saving) return;
        setSaving(true);
        setMessage(null);
        try {
            await updateDoc(doc(db, 'users', user.uid), profile);
            setMessage({ type: 'success', text: 'Perfil actualizado con éxito.' });
        } catch (error) {
            console.error("Perfil update error:", error);
            setMessage({ type: 'error', text: 'Error al actualizar el perfil.' });
        } finally {
            setSaving(false);
            setTimeout(() => setMessage(null), 3000);
        }
    };
    
    return (
        <div className="p-6 max-w-4xl mx-auto animate-fade-in">
            <header className="mb-8">
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Mi Perfil</h2>
                <p className="text-gray-500 mt-1">Administra tu información personal y tributaria.</p>
            </header>

            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Icon name="User" size={120} />
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 block">Nombre Completo</label>
                            <input 
                                name="nombre" 
                                value={profile.nombre} 
                                onChange={handleChange} 
                                className="w-full p-3 bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700 shadow-sm"
                                placeholder="Tu nombre"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 block">CUIT/CUIL</label>
                            <input 
                                name="cuit" 
                                value={profile.cuit} 
                                onChange={handleChange} 
                                className="w-full p-3 bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700 shadow-sm"
                                placeholder="00-00000000-0"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 block">Actividad Principal</label>
                            <input 
                                name="actividad" 
                                value={profile.actividad} 
                                onChange={handleChange} 
                                className="w-full p-3 bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700 shadow-sm"
                                placeholder="Ej: Servicios de Software"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 block">Categoría Tributaria</label>
                            <select 
                                name="categoriaTributaria" 
                                value={profile.categoriaTributaria} 
                                onChange={handleChange} 
                                className="w-full p-3 bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700 shadow-sm"
                            >
                                <option value="Monotributo">Monotributo</option>
                                <option value="Responsable Inscripto">Responsable Inscripto</option>
                                <option value="Exento">Exento</option>
                            </select>
                        </div>
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1 block">Teléfono de Contacto</label>
                            <input 
                                name="telefono" 
                                value={profile.telefono} 
                                onChange={handleChange} 
                                className="w-full p-3 bg-gray-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 rounded-xl transition-all outline-none font-medium text-gray-700 shadow-sm"
                                placeholder="+54 9 11 ..."
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button 
                            type="submit" 
                            disabled={saving} 
                            className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg transform active:scale-[0.98] ${saving ? 'bg-gray-300 shadow-none' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
                        >
                            {saving ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Guardando...
                                </div>
                            ) : 'Guardar Cambios'}
                        </button>
                    </div>
                    
                    {message && (
                        <div className={`text-center p-4 rounded-2xl font-bold animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                            {message.text}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default ProfilePage;
