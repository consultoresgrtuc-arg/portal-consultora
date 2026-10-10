import React, { useState, useEffect } from 'react';
import { db, functions } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';

const ProfilePage = () => {
    const { user, userData, logoutNow } = useAuth();
    const [profile, setProfile] = useState({ 
        nombre: '', 
        cuit: '', 
        actividad: '', 
        categoriaTributaria: 'Monotributo', 
        telefono: '' 
    });
    const [message, setMessage] = useState(null);
    const [saving, setSaving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
    
    const handleSelfDeleteAccount = async () => {
        if (!user?.uid || isDeletingAccount) return;
        setIsDeletingAccount(true);
        try {
            const deleteFn = httpsCallable(functions, 'deleteUserAndData');
            await deleteFn({ uid: user.uid });
            alert("Tu cuenta, tus comprobantes y todos tus datos fueron eliminados de forma permanente. Si deseas volver a utilizar la plataforma en el futuro, podrás darte de alta nuevamente como un usuario nuevo.");
            logoutNow();
        } catch (err) {
            console.error("Error al procesar la baja de cuenta:", err);
            alert("No se pudo procesar la baja de la cuenta: " + (err.message || "Error desconocido"));
            setIsDeletingAccount(false);
            setShowDeleteModal(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto animate-fade-in space-y-8">
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
                                <option value="Sociedad">Sociedad</option>
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

            {/* Zona de Peligro: Darse de baja de la aplicación (solo para clientes, no admin principal) */}
            {!userData?.isAdmin && (
                <div className="bg-red-50/50 border border-red-200/60 rounded-3xl p-6 sm:p-8 space-y-4">
                    <div className="flex items-center gap-3 text-red-700">
                        <Icon name="AlertTriangle" size={20} className="shrink-0" />
                        <h3 className="text-base font-extrabold uppercase tracking-wider">Zona de Peligro</h3>
                    </div>
                    <p className="text-xs text-red-900/80 leading-relaxed font-medium">
                        Si ya no deseas utilizar la plataforma, puedes dar de baja tu cuenta en cualquier momento. Al hacerlo, se eliminarán permanentemente todos tus datos contables, comprobantes y archivos adjuntos del sistema sin dejar registros residuales.
                    </p>
                    <div className="pt-2">
                        <button 
                            type="button"
                            onClick={() => setShowDeleteModal(true)}
                            className="px-6 py-3.5 bg-white border border-red-300 text-red-600 hover:bg-red-600 hover:text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xs active:scale-95 flex items-center gap-2 cursor-pointer"
                        >
                            <Icon name="Trash2" size={14} /> Darme de baja de la aplicación
                        </button>
                    </div>
                </div>
            )}

            {showDeleteModal && (
                <ConfirmModal 
                    message="¿Estás seguro de que deseas darte de baja de la aplicación? Esta acción es definitiva e irreversible: perderás todos tus archivos, comprobantes y registros contables cargados en el sistema sin dejar datos residuales. Si en el futuro deseas volver a utilizar nuestros servicios, podrás darte de alta nuevamente como un usuario nuevo con este u otro correo."
                    onConfirm={handleSelfDeleteAccount}
                    onCancel={() => {
                        if (!isDeletingAccount) setShowDeleteModal(false);
                    }}
                    confirmText={isDeletingAccount ? "Eliminando todo..." : "Sí, darme de baja y borrar mis datos"}
                    isDestructive={true}
                />
            )}
        </div>
    );
};

export default ProfilePage;
