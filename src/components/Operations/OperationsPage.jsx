import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  deleteDoc 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useCollection } from '../../hooks/useCollections';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import DateFilter from '../Common/DateFilter';
import OperationModal from './OperationModal';

const OperationsPage = () => {
    const { user } = useAuth();
    const [filterDate, setFilterDate] = useState(new Date());
    const { data: operations, loading } = useCollection('operations', {
        year: filterDate.getFullYear(),
        month: filterDate.getMonth() + 1
    });
    const [recentOperations, setRecentOperations] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingOp, setEditingOp] = useState(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [operationToDelete, setOperationToDelete] = useState(null);

    useEffect(() => {
        if (!user) return;
        const q = query(collection(db, 'users', user.uid, 'operations'), orderBy("fechaEmision", "desc"), limit(5));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRecentOperations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => console.error("Error en recentOperations:", error));
        return () => unsubscribe();
    }, [user]);

    const handleDelete = async () => {
        if (!operationToDelete || !user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'operations', operationToDelete));
            setShowConfirmDelete(false);
            setOperationToDelete(null);
        } catch (error) {
            console.error("Error al eliminar:", error);
        }
    };

    const promptDelete = (id) => {
        setOperationToDelete(id);
        setShowConfirmDelete(true);
    };
    
    const handleEdit = (op) => {
        setEditingOp(op);
        setShowModal(true);
    };
    
    const handleNewOperation = () => {
        setEditingOp(null);
        setShowModal(true);
    };

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            {showModal && <OperationModal op={editingOp} onClose={() => setShowModal(false)} />}
            {showConfirmDelete && (
                <ConfirmModal
                    message="¿Estás seguro de que quieres eliminar esta operación? Esta acción no se puede deshacer."
                    onConfirm={handleDelete}
                    onCancel={() => setShowConfirmDelete(false)}
                />
            )}

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Libro de Operaciones</h2>
                    <p className="text-gray-500 font-medium italic">Registro detallado de ingresos y egresos.</p>
                </div>
                <button 
                    onClick={handleNewOperation} 
                    className="bg-blue-600 text-white px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all transform active:scale-95 flex items-center"
                >
                    <Icon name="PlusCircle" className="w-5 h-5 mr-2"/> Nueva Operación
                </button>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Columna Izquierda: Filtro y Recientes */}
                <div className="xl:col-span-1 space-y-8">
                    <DateFilter date={filterDate} setDate={setFilterDate} />

                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 text-blue-50/50 group-hover:scale-110 transition-transform">
                            <Icon name="History" size={100} />
                        </div>
                        <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                            <Icon name="Clock" size={16} className="text-blue-500"/> Registros Recientes
                        </h3>
                        {recentOperations.length > 0 ? (
                            <ul className="space-y-4">
                                {recentOperations.map(op => (
                                    <li key={op.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
                                        <div className="overflow-hidden">
                                            <p className="font-bold text-gray-800 truncate capitalize">{op.description}</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                {op.fechaEmision?.toDate ? op.fechaEmision.toDate().toLocaleDateString('es-AR') : 'S/D'} • {op.type}
                                            </p>
                                        </div>
                                        <div className={`text-right font-black ${['venta','ingreso'].includes(op.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {formatCurrency(op.amount)}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="py-10 text-center">
                                <p className="text-gray-400 font-bold italic">No hay registros recientes.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Columna Derecha: Tabla de Operaciones */}
                <div className="xl:col-span-2">
                    <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                            <h3 className="text-lg font-black text-gray-800 tracking-tight">Detalle del Período</h3>
                            <span className="px-4 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                                {operations.length} Registros
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-50">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                        <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo / Descripción</th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto</th>
                                        <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {loading ? (
                                        <tr><td colSpan="4" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando operaciones...</td></tr>
                                    ) : operations.length > 0 ? operations.map(op => (
                                        <tr key={op.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-8 py-6 text-sm font-bold text-gray-600">
                                                {op.fechaEmision?.toDate ? op.fechaEmision.toDate().toLocaleDateString('es-AR') : '-'}
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${['venta','ingreso'].includes(op.type) ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                                                        <Icon name={['venta','ingreso'].includes(op.type) ? 'TrendingUp' : 'TrendingDown'} size={14}/>
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-black text-gray-900 capitalize">{op.type}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">{op.description}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`px-8 py-6 text-right font-black text-lg tracking-tight ${['venta','ingreso'].includes(op.type) ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {formatCurrency(op.amount)}
                                            </td>
                                            <td className="px-8 py-6 text-center">
                                                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEdit(op)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all" title="Editar">
                                                        <Icon name="Edit" size={18}/>
                                                    </button>
                                                    <button onClick={() => promptDelete(op.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-all" title="Eliminar">
                                                        <Icon name="Trash2" size={18}/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan="4" className="text-center py-24 text-gray-400 font-bold italic">
                                                No hay registros para este período.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OperationsPage;
