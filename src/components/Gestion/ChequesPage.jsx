import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';

const ChequesPage = ({ navigate }) => {
    const { user } = useAuth();
    const [cheques, setCheques] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activos'); 
    const [searchTerm, setSearchTerm] = useState('');
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmParams, setConfirmParams] = useState({ 
        message: '', 
        action: () => {}, 
        confirmText: 'Confirmar', 
        isDestructive: false 
    });

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return '-';
        return timestamp.toDate().toLocaleDateString('es-AR');
    };

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const q = query(collection(db, 'users', user.uid, 'cheques'), orderBy("fechaVencimiento", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCheques(items);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const handleUpdateEstado = async (chequeId, nuevoEstado) => {
        try {
            await updateDoc(doc(db, 'users', user.uid, 'cheques', chequeId), { estado: nuevoEstado });
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteCheque = async (chequeId) => {
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'cheques', chequeId));
        } catch (err) {
            console.error(err);
        }
    };

    const promptAction = (message, action, buttonText = 'Confirmar', isDestructive = false) => {
        setConfirmParams({ 
            message, 
            action: () => { action(); setShowConfirmModal(false); },
            confirmText: buttonText,
            isDestructive: isDestructive
        });
        setShowConfirmModal(true);
    };

    const estadosActivos = ['En Cartera', 'Depositado', 'Emitido'];
    const chequesFiltrados = cheques.filter(c => {
        const esActivo = estadosActivos.includes(c.estado);
        const coincidePestaña = activeTab === 'activos' ? esActivo : !esActivo;
        
        if (!coincidePestaña) return false;
        
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
            (c.terceroNombre && c.terceroNombre.toLowerCase().includes(term)) ||
            (c.banco && c.banco.toLowerCase().includes(term)) ||
            (c.numero && c.numero.toString().includes(term))
        );
    });

    const metricas = useMemo(() => {
        const enCartera = cheques.filter(c => c.estado === 'En Cartera').reduce((sum, c) => sum + (c.monto || 0), 0);
        const aDepositar = cheques.filter(c => c.estado === 'Depositado').reduce((sum, c) => sum + (c.monto || 0), 0);
        const aCubrir = cheques.filter(c => c.estado === 'Emitido').reduce((sum, c) => sum + (c.monto || 0), 0);
        return { enCartera, aDepositar, aCubrir };
    }, [cheques]);

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            {showConfirmModal && (
                <ConfirmModal 
                    message={confirmParams.message} 
                    onConfirm={confirmParams.action} 
                    onCancel={() => setShowConfirmModal(false)}
                    confirmText={confirmParams.confirmText}
                    isDestructive={confirmParams.isDestructive}
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
                        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Gestión de Valores</h2>
                        <p className="text-gray-500 font-medium italic">Control de Cheques de Terceros y Propios</p>
                    </div>
                </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-l-8 border-l-blue-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">En Cartera (Mano)</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.enCartera)}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-l-8 border-l-yellow-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Depositados (Clearing)</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.aDepositar)}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-l-8 border-l-red-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">A Cubrir (Emitidos)</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.aCubrir)}</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
                    <button 
                        onClick={() => setActiveTab('activos')} 
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'activos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Cartera Activa
                    </button>
                    <button 
                        onClick={() => setActiveTab('historial')} 
                        className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'historial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Historial
                    </button>
                </div>

                <div className="relative min-w-[280px]">
                    <Icon name="Search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por Tercero, Banco o N°..."
                        className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none shadow-sm"
                    />
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex items-center gap-3">
                    <Icon name="Landmark" size={24} className="text-indigo-500"/>
                    <h3 className="text-lg font-black text-gray-800 tracking-tight">Listado de Valores</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tercero</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Banco / N°</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando caja de valores...</td></tr>
                            ) : chequesFiltrados.length > 0 ? chequesFiltrados.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-gray-900">{c.terceroNombre}</span>
                                            {c.terceroId && (
                                                <button 
                                                    onClick={() => navigate(c.tipo === 'recibido' ? `gestion/deudores/${c.terceroId}` : `gestion/proveedores/${c.terceroId}`)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-blue-500 hover:text-blue-700"
                                                    title="Ver Cuenta Corriente"
                                                >
                                                    <Icon name="ExternalLink" size={14}/>
                                                </button>
                                            )}
                                        </div>
                                        <div className={`text-[10px] font-bold uppercase tracking-widest ${c.tipo === 'recibido' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {c.tipo === 'recibido' ? 'Entrante (Cliente)' : 'Saliente (Proveedor)'}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-bold text-gray-700">{c.banco}</div>
                                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">N° {c.numero}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-bold text-gray-600">{formatDate(c.fechaVencimiento)}</div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="text-lg font-black text-gray-900 tracking-tight">{formatCurrency(c.monto)}</div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                                            c.estado === 'En Cartera' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                            c.estado === 'Depositado' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' : 
                                            c.estado === 'Emitido' ? 'bg-red-50 text-red-600 border-red-100' : 
                                            c.estado === 'Cobrado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                            c.estado === 'Pagado' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                                            'bg-gray-50 text-gray-600 border-gray-100'
                                        }`}>
                                            {c.estado}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {c.estado === 'En Cartera' && (
                                                <button 
                                                    onClick={() => promptAction(`¿Depositar cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Depositado'), 'Depositar', false)}
                                                    className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                                >
                                                    Depositar
                                                </button>
                                            )}
                                            {c.estado === 'Depositado' && (
                                                <button 
                                                    onClick={() => promptAction(`¿Confirmar acreditación del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Cobrado'), 'Confirmar Cobro', false)}
                                                    className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                                                >
                                                    Cobrado
                                                </button>
                                            )}
                                            {c.estado === 'Emitido' && (
                                                <button 
                                                    onClick={() => promptAction(`¿Confirmar débito del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Pagado'), 'Confirmar Pago', false)}
                                                    className="px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all shadow-sm"
                                                >
                                                    Pagado
                                                </button>
                                            )}
                                            
                                            {/* Botón para anular/eliminar */}
                                            <button 
                                                onClick={() => promptAction(`¿Eliminar o anular el registro de este cheque N° ${c.numero}?`, () => handleDeleteCheque(c.id), 'Eliminar', true)}
                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                                title="Eliminar / Anular Cheque"
                                            >
                                                <Icon name="Trash2" size={16}/>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="6" className="text-center py-24 text-gray-400 font-bold italic">No se encontraron cheques con los filtros aplicados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ChequesPage;
