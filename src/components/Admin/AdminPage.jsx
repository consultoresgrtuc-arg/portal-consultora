import React, { useState, useEffect } from 'react';
import { db, auth, functions } from '../../firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';

const AdminPage = ({ navigate }) => {
    const { userData } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [claimMessage, setClaimMessage] = useState('');
    const [isClaiming, setIsClaiming] = useState(false);
    
    const [isDeleting, setIsDeleting] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null); 
    const [deleteMessage, setDeleteMessage] = useState('');

    useEffect(() => {
        if (!userData?.isAdmin) return;
        setLoading(true);
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Error fetching users:", err);
            setError("No se pudieron cargar los clientes.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userData]);

    const handleMakeAdmin = async () => {
        setIsClaiming(true); 
        setClaimMessage('Procesando...');
        try {
            const makeMeAdmin = httpsCallable(functions, 'makeMeAdmin');
            await makeMeAdmin();
            if (auth.currentUser) await auth.currentUser.getIdTokenResult(true);
            setClaimMessage('¡Éxito! Por favor, CIERRA SESIÓN y vuelve a entrar.');
        } catch (err) {
            console.error(err);
            setClaimMessage(`Error: ${err.message}`);
        } finally {
            setIsClaiming(false);
        }
    };

    const toggleBillingService = async (targetUser) => {
        const newState = !targetUser.servicioFacturacion;
        try {
            await updateDoc(doc(db, "users", targetUser.id), {
                servicioFacturacion: newState,
                modoFacturacion: newState ? (targetUser.modoFacturacion || 'estudio') : targetUser.modoFacturacion
            });
        } catch (err) {
            console.error("Error updating service:", err);
            alert("Error al cambiar el estado del servicio.");
        }
    };

    const changeBillingMode = async (targetUser, newMode) => {
        try {
            await updateDoc(doc(db, "users", targetUser.id), {
                modoFacturacion: newMode
            });
        } catch (err) {
            console.error(err);
            alert("Error al cambiar el modo.");
        }
    };

    if (!userData?.isAdmin) {
        return (
            <div className="p-12 text-center animate-fade-in">
                <Icon name="ShieldAlert" className="w-20 h-20 text-red-100 mx-auto mb-6" />
                <h2 className="text-3xl font-black text-gray-800">Acceso Denegado</h2>
                <p className="text-gray-500 mt-2">Esta sección es exclusiva para administradores del sistema.</p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Panel de Control Admin</h2>
                    <p className="text-gray-500 mt-1">Gestión global de usuarios y configuraciones del sistema.</p>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-2xl flex items-center gap-4 shadow-sm">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-yellow-800 uppercase tracking-widest">Estado Admin</span>
                        <span className="text-xs font-bold text-yellow-600">{claimMessage || 'Token Activo'}</span>
                    </div>
                    <button onClick={handleMakeAdmin} disabled={isClaiming} className="bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-yellow-200">
                        {isClaiming ? 'Sincronizando...' : 'Refrescar Permisos'}
                    </button>
                </div>
            </header>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-2xl font-bold text-sm text-center animate-pulse">{error}</div>}

            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                    <h3 className="text-xl font-bold text-gray-800 flex items-center">
                        <Icon name="Users" className="w-6 h-6 mr-3 text-blue-500"/> 
                        Directorio de Usuarios
                    </h3>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-gray-100">{users.length} Registrados</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-100">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Usuario</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Identificación</th>
                                <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Servicio Facturación</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-widest">Gestión</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-20">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                </td></tr>
                            ) : users.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs uppercase">
                                                {(u.nombre || u.email || '?')[0]}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{u.nombre || 'Sin Nombre'}</div>
                                                <div className="text-[10px] text-gray-400 font-medium">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-xs font-bold text-gray-500 font-mono tracking-tighter">
                                            CUIT: {u.cuit || 'No registrado'}
                                        </div>
                                        <div className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                                            {u.isAdmin ? 'Administrador' : 'Cliente'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => toggleBillingService(u)}
                                                    className={`relative inline-flex items-center h-6 rounded-full w-12 transition-all duration-300 focus:outline-none ${u.servicioFacturacion ? 'bg-green-500' : 'bg-gray-200'}`}
                                                >
                                                    <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ${u.servicioFacturacion ? 'translate-x-7' : 'translate-x-1'}`}/>
                                                </button>
                                                <span className={`text-[10px] font-black uppercase tracking-widest w-8 ${u.servicioFacturacion ? 'text-green-600' : 'text-gray-400'}`}>
                                                    {u.servicioFacturacion ? 'ON' : 'OFF'}
                                                </span>
                                            </div>

                                            {u.servicioFacturacion && (
                                                <select 
                                                    value={u.modoFacturacion || 'estudio'}
                                                    onChange={(e) => changeBillingMode(u, e.target.value)}
                                                    className={`text-[10px] font-black px-3 py-1.5 rounded-xl border-2 transition-all outline-none uppercase tracking-widest cursor-pointer
                                                        ${(u.modoFacturacion || 'estudio') === 'estudio' ? 'bg-blue-50 text-blue-700 border-blue-100 hover:border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-100 hover:border-purple-200'}`}
                                                >
                                                    <option value="estudio">Gestiono YO</option>
                                                    <option value="cliente">Autogestión</option>
                                                </select>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <button 
                                            onClick={() => navigate(`/admin/manage/${u.id}`)} 
                                            className="bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-gray-200 transform active:scale-95"
                                        >
                                            Gestionar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
