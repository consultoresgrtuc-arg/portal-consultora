import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import TerceroModal from './TerceroModal';

const TercerosPage = ({ navigate }) => {
    const { user } = useAuth();
    const [terceros, setTerceros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingTercero, setEditingTercero] = useState(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [terceroToDelete, setTerceroToDelete] = useState(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const q = query(collection(db, 'users', user.uid, 'terceros'), orderBy("nombre", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTerceros(items);
            setLoading(false);
        }, (error) => {
            console.error("Error al leer 'terceros':", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const handleNewTercero = () => {
        setEditingTercero(null);
        setShowModal(true);
    };

    const handleEdit = (tercero) => {
        setEditingTercero(tercero);
        setShowModal(true);
    };

    const promptDelete = (id) => {
        setTerceroToDelete(id);
        setShowConfirmDelete(true);
    };

    const handleDelete = async () => {
        if (!terceroToDelete) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'terceros', terceroToDelete));
        } catch (error) {
            console.error("Error deleting tercero:", error);
        } finally {
            setShowConfirmDelete(false);
            setTerceroToDelete(null);
        }
    };

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            {showModal && <TerceroModal tercero={editingTercero} onClose={() => setShowModal(false)} />}
            {showConfirmDelete && (
                <ConfirmModal
                    message="¿Estás seguro de que quieres eliminar este tercero? Esto no borrará sus facturas asociadas."
                    onConfirm={handleDelete}
                    onCancel={() => setShowConfirmDelete(false)}
                />
            )}
            
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('gestion')} 
                        className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-gray-900 transition-all hover:shadow-md"
                    >
                        <Icon name="ArrowLeft" size={20}/>
                    </button>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Gestión de Terceros</h2>
                        <p className="text-gray-500 font-medium italic">Clientes y Proveedores</p>
                    </div>
                </div>
                <button 
                    onClick={handleNewTercero} 
                    className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all transform active:scale-95 flex items-center"
                >
                    <Icon name="PlusCircle" className="w-5 h-5 mr-2"/> Nuevo Registro
                </button>
            </header>

            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Nombre / Razón Social</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Identificación</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoría</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Contacto</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="5" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando base de datos...</td></tr>
                            ) : terceros.length > 0 ? terceros.map(t => (
                                <tr key={t.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-black text-gray-900">{t.nombre}</div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">{t.email || 'Sin email'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-xs font-mono font-bold text-gray-600">{t.cuit || 'S/D'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                            t.tipo === 'Cliente' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                            t.tipo === 'Proveedor' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                            'bg-purple-50 text-purple-600 border-purple-100'
                                        }`}>
                                            {t.tipo}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-bold text-gray-700">{t.telefono || '-'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleEdit(t)} 
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                title="Editar"
                                            >
                                                <Icon name="Edit" size={18}/>
                                            </button>
                                            <button 
                                                onClick={() => promptDelete(t.id)} 
                                                className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                title="Eliminar"
                                            >
                                                <Icon name="Trash2" size={18}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="5" className="text-center py-24 text-gray-400 font-bold italic">
                                        No hay registros creados aún.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TercerosPage;
