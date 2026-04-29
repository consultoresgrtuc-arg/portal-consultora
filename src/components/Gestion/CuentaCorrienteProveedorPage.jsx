import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import FacturaCompraModal from './Modals/FacturaCompraModal';
import PagoRealizadoModal from './Modals/PagoRealizadoModal';

const CuentaCorrienteProveedorPage = ({ navigate, terceroId }) => {
    const { user } = useAuth();
    const [terceroData, setTerceroData] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [loadingTercero, setLoadingTercero] = useState(true);
    const [loadingMov, setLoadingMov] = useState(true);
    const [error, setError] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [movimientoAEditar, setMovimientoAEditar] = useState(null); 

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'Fecha inválida';
        return timestamp.toDate().toLocaleDateString('es-AR');
    };

    useEffect(() => {
        if (!user || !terceroId) return;
        setLoadingTercero(true);
        const docRef = doc(db, 'users', user.uid, 'terceros', terceroId);
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setTerceroData({ id: docSnap.id, ...docSnap.data() });
            } else {
                setError(`No se encontró el proveedor con ID: ${terceroId}`);
            }
            setLoadingTercero(false);
        }, (err) => {
            console.error(err);
            setError('Error al cargar datos del proveedor.');
            setLoadingTercero(false);
        });
        return () => unsubscribe();
    }, [user, terceroId]);

    useEffect(() => {
        if (!user || !terceroId) return;
        setLoadingMov(true);

        const qFacturas = query(
            collection(db, 'users', user.uid, 'facturasCompra'),
            where("terceroId", "==", terceroId),
            orderBy("fechaEmision", "asc")
        );
        const qPagos = query(
            collection(db, 'users', user.uid, 'pagosRealizados'),
            where("terceroId", "==", terceroId),
            orderBy("fechaPago", "asc")
        );

        const unsubFacturas = onSnapshot(qFacturas, (facturasSnap) => {
            const facturas = facturasSnap.docs.map(d => ({ ...d.data(), id: d.id, tipoMovimiento: 'factura', fecha: d.data().fechaEmision }));
            
            const unsubPagos = onSnapshot(qPagos, (pagosSnap) => {
                const pagos = pagosSnap.docs.map(d => ({ ...d.data(), id: d.id, tipoMovimiento: 'pago', fecha: d.data().fechaPago }));
                
                const movsCombinados = [...facturas, ...pagos].sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis());
                
                let saldoAcumulado = 0;
                const movsConSaldo = movsCombinados.map(mov => {
                    if (mov.tipoMovimiento === 'factura') {
                        saldoAcumulado += mov.montoTotal; // Aumenta deuda
                    } else if (mov.tipoMovimiento === 'pago') {
                        saldoAcumulado -= mov.montoPagado; // Disminuye deuda
                    }
                    return { ...mov, saldoAcumulado };
                });

                setMovimientos(movsConSaldo);
                setLoadingMov(false);
            }, (err) => {
                console.error(err);
                setLoadingMov(false);
            });
            
            return () => unsubPagos();
        }, (err) => {
            console.error(err);
            setLoadingMov(false);
        });

        return () => unsubFacturas();
    }, [user, terceroId]);

    const handleDeleteMovimiento = async (mov) => {
        if (isDeleting) return;
        if (!window.confirm(`¿Seguro que deseas eliminar este registro?`)) return;

        setIsDeleting(true);
        try {
            const collectionName = mov.tipoMovimiento === 'factura' ? 'facturasCompra' : 'pagosRealizados';
            await deleteDoc(doc(db, 'users', user.uid, collectionName, mov.id));
        } catch (err) {
            console.error(err);
            setError("Error al eliminar.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleEditMovimiento = (mov) => {
        setMovimientoAEditar(mov);
    };

    const handleShowNuevoMovimiento = (tipo) => {
        if (tipo === 'factura') {
            setMovimientoAEditar({
                tipoMovimiento: 'factura',
                numeroComprobante: '',
                fechaEmision: new Date().toISOString().split('T')[0],
                fechaVencimiento: '',
                montoTotal: 0,
            });
        } else if (tipo === 'pago') {
            setMovimientoAEditar({
                tipoMovimiento: 'pago',
                fechaPago: new Date().toISOString().split('T')[0],
                montoPagado: 0,
                medioDePago: 'Transferencia',
                referencia: '',
            });
        }
    };

    const handleCloseModals = () => {
        setMovimientoAEditar(null);
    };

    const saldoFinal = movimientos.length > 0 ? movimientos[movimientos.length - 1].saldoAcumulado : 0;
    const loading = loadingTercero || loadingMov;

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('gestion/proveedores')} 
                        className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-gray-900 transition-all hover:shadow-md"
                    >
                        <Icon name="ArrowLeft" size={20}/>
                    </button>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Cta. Cte. Proveedor</h2>
                        <p className="text-gray-500 font-medium italic">{terceroData?.nombre || 'Cargando...'}</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => handleShowNuevoMovimiento('factura')}
                        className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-orange-700 shadow-xl shadow-orange-100 transition-all transform active:scale-95 flex items-center"
                    >
                        <Icon name="FilePlus" className="w-5 h-5 mr-2"/> Cargar Compra
                    </button>
                    <button 
                        onClick={() => handleShowNuevoMovimiento('pago')}
                        className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 shadow-xl shadow-emerald-100 transition-all transform active:scale-95 flex items-center"
                    >
                        <Icon name="DollarSign" className="w-5 h-5 mr-2"/> Registrar Pago
                    </button>
                </div>
            </header>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden">
                <div className="absolute right-0 top-0 w-64 h-64 bg-orange-50 opacity-20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Deuda Pendiente</p>
                    <h3 className={`text-4xl font-black tracking-tight ${saldoFinal > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(saldoFinal)}
                    </h3>
                </div>
                
                <div className="flex gap-8 text-center md:text-right">
                    <div className="px-6 border-r border-gray-100 last:border-0">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Compras Totales</p>
                        <p className="text-xl font-bold text-gray-800">
                            {formatCurrency(movimientos.filter(m => m.tipoMovimiento === 'factura').reduce((s, m) => s + m.montoTotal, 0))}
                        </p>
                    </div>
                    <div className="px-6 border-r border-gray-100 last:border-0">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 italic">Pagos Totales</p>
                        <p className="text-xl font-bold text-gray-800">
                            {formatCurrency(movimientos.filter(m => m.tipoMovimiento === 'pago').reduce((s, m) => s + m.montoPagado, 0))}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Factura (Deuda)</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Pago (Abono)</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Acum.</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando movimientos de compra...</td></tr>
                            ) : movimientos.length > 0 ? movimientos.map(mov => (
                                <tr key={mov.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6 text-sm font-bold text-gray-600">{formatDate(mov.fecha)}</td>
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-black text-gray-900">
                                            {mov.tipoMovimiento === 'factura' ? `Compra N° ${mov.numeroComprobante || 'S/N'}` : `Pago Realizado`}
                                        </div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                                            {mov.tipoMovimiento === 'factura' ? 'Factura de Proveedor' : `Medio: ${mov.medioDePago || 'Transferencia'}`}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right font-bold text-red-500">
                                        {mov.tipoMovimiento === 'factura' ? formatCurrency(mov.montoTotal) : ''}
                                    </td>
                                    <td className="px-8 py-6 text-right font-bold text-emerald-500">
                                        {mov.tipoMovimiento === 'pago' ? formatCurrency(mov.montoPagado) : ''}
                                    </td>
                                    <td className="px-8 py-6 text-right font-black text-gray-800">
                                        {formatCurrency(mov.saldoAcumulado)}
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => handleEditMovimiento(mov)} 
                                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                title="Editar"
                                            >
                                                <Icon name="Edit" size={18}/>
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteMovimiento(mov)} 
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
                                    <td colSpan="6" className="text-center py-24 text-gray-400 font-bold italic">
                                        Sin movimientos de compra registrados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <FacturaCompraModal
                isOpen={movimientoAEditar?.tipoMovimiento === 'factura'}
                onClose={handleCloseModals}
                proveedorId={terceroId}
                proveedorNombre={terceroData?.nombre}
                movimiento={movimientoAEditar} 
            />

            <PagoRealizadoModal
                isOpen={movimientoAEditar?.tipoMovimiento === 'pago'}
                onClose={handleCloseModals}
                proveedorId={terceroId}
                proveedorNombre={terceroData?.nombre}
                movimiento={movimientoAEditar}
            />
        </div>
    );
};

export default CuentaCorrienteProveedorPage;
