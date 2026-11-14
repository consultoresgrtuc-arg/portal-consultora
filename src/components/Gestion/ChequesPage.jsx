import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  deleteDoc,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import CargaChequesModal from './Modals/CargaChequesModal';
import {
    exportEcheqPlantillaExcel,
    isoToDdMmYyyy,
    formatMontoConComa,
    sanitizeNroDocumento
} from '../../utils/echeqExcel';

const ChequesPage = ({ navigate }) => {
    const { user } = useAuth();
    const { targetUserId } = useClientSelection();
    const currentUid = targetUserId || user?.uid;

    const [cheques, setCheques] = useState([]);
    const [terceros, setTerceros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('activos'); // 'activos' | 'emitidos' | 'historial'
    const [searchTerm, setSearchTerm] = useState('');
    const [showCargaModal, setShowCargaModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [toastMsg, setToastMsg] = useState(null);
    const [autoConciliarOperaciones, setAutoConciliarOperaciones] = useState(true);
    const [isSendingAlert, setIsSendingAlert] = useState(false);

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmParams, setConfirmParams] = useState({ 
        message: '', 
        action: () => {}, 
        confirmText: 'Confirmar', 
        isDestructive: false 
    });

    const triggerToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3500);
    };

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value || 0);
    const formatDate = (timestamp, fallbackStr) => {
        if (timestamp && timestamp.toDate) {
            return timestamp.toDate().toLocaleDateString('es-AR');
        }
        if (fallbackStr) return fallbackStr;
        return '-';
    };

    useEffect(() => {
        if (!currentUid) return;
        setLoading(true);
        const q = query(collection(db, 'users', currentUid, 'cheques'), orderBy("fechaVencimiento", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
            setCheques(items);
            setLoading(false);
        }, (err) => {
            console.error("Error cargando cheques:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentUid]);

    useEffect(() => {
        if (!currentUid) return;
        const qTerceros = query(collection(db, 'users', currentUid, 'terceros'), orderBy("nombre", "asc"));
        const unsub = onSnapshot(qTerceros, (snap) => {
            setTerceros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => setTerceros([]));
        return () => unsub();
    }, [currentUid]);

    const handleUpdateEstado = async (chequeId, nuevoEstado) => {
        if (!currentUid) return;
        try {
            const cheque = cheques.find(c => c.id === chequeId);
            const debeConciliar =
                autoConciliarOperaciones &&
                (nuevoEstado === 'Cobrado' || nuevoEstado === 'Pagado') &&
                !cheque?.conciliadoOperationId;

            if (debeConciliar && cheque) {
                const now = new Date();
                const isCobro = nuevoEstado === 'Cobrado';
                const opRef = await addDoc(collection(db, 'users', currentUid, 'operations'), {
                    type: isCobro ? 'venta' : 'compra',
                    amount: Number(cheque.monto) || 0,
                    description: `${isCobro ? 'Acreditación' : 'Pago'} cheque ${cheque.banco || 'eCheq'} N° ${cheque.numero || 's/n'} - ${cheque.terceroNombre || 'Sin beneficiario'}`,
                    fechaEmision: Timestamp.fromDate(now),
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                    day: now.getDate(),
                    chequeId: cheque.id
                });

                await updateDoc(doc(db, 'users', currentUid, 'cheques', chequeId), {
                    estado: nuevoEstado,
                    conciliadoOperationId: opRef.id,
                    fechaConciliacion: Timestamp.fromDate(now)
                });
                triggerToast(`Estado actualizado a "${nuevoEstado}" e imputado en Operaciones`);
            } else {
                await updateDoc(doc(db, 'users', currentUid, 'cheques', chequeId), { estado: nuevoEstado });
                triggerToast(`Estado actualizado a "${nuevoEstado}"`);
            }
        } catch (err) {
            console.error(err);
            triggerToast('No se pudo actualizar el estado del cheque');
        }
    };

    const handleDeleteCheque = async (chequeId) => {
        if (!currentUid) return;
        try {
            await deleteDoc(doc(db, 'users', currentUid, 'cheques', chequeId));
            setSelectedIds(prev => prev.filter(id => id !== chequeId));
            triggerToast('Registro de cheque eliminado');
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
    const chequesFiltrados = useMemo(() => {
        return cheques.filter(c => {
            const esActivo = estadosActivos.includes(c.estado);
            if (activeTab === 'activos' && !esActivo) return false;
            if (activeTab === 'emitidos' && c.estado !== 'Emitido') return false;
            if (activeTab === 'historial' && esActivo) return false;

            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                (c.terceroNombre && c.terceroNombre.toLowerCase().includes(term)) ||
                (c.banco && c.banco.toLowerCase().includes(term)) ||
                (c.numero && c.numero.toString().toLowerCase().includes(term)) ||
                (c.nroDocumento && c.nroDocumento.toString().includes(term)) ||
                (c.motivoPago && c.motivoPago.toLowerCase().includes(term)) ||
                (c.referenciaPago && c.referenciaPago.toLowerCase().includes(term))
            );
        });
    }, [cheques, activeTab, searchTerm]);

    const metricas = useMemo(() => {
        const enCartera = cheques.filter(c => c.estado === 'En Cartera').reduce((sum, c) => sum + (Number(c.monto) || 0), 0);
        const aDepositar = cheques.filter(c => c.estado === 'Depositado').reduce((sum, c) => sum + (Number(c.monto) || 0), 0);
        const aCubrir = cheques.filter(c => c.estado === 'Emitido').reduce((sum, c) => sum + (Number(c.monto) || 0), 0);
        const emitidosCount = cheques.filter(c => c.estado === 'Emitido').length;
        return { enCartera, aDepositar, aCubrir, emitidosCount };
    }, [cheques]);

    const parseChequeDueDate = (cheque) => {
        if (cheque?.fechaVencimiento?.toDate) {
            return cheque.fechaVencimiento.toDate();
        }
        if (cheque?.fechaVencimiento instanceof Date) {
            return cheque.fechaVencimiento;
        }
        if (typeof cheque?.fechaPagoStr === 'string' && cheque.fechaPagoStr.includes('/')) {
            const parts = cheque.fechaPagoStr.split('/');
            if (parts.length === 3) {
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10);
                const year = parseInt(parts[2], 10);
                if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
                    return new Date(year, month - 1, day);
                }
            }
        }
        return null;
    };

    const alertasVencimiento = useMemo(() => {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msPerDay = 1000 * 60 * 60 * 24;

        return cheques
            .filter(c => estadosActivos.includes(c.estado))
            .map(c => {
                const dueDate = parseChequeDueDate(c);
                if (!dueDate || Number.isNaN(dueDate.getTime())) return null;
                const startOfDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
                const diffDays = Math.round((startOfDue.getTime() - startOfToday.getTime()) / msPerDay);
                if (diffDays <= 3) {
                    return { ...c, diffDays, dueDate };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => a.diffDays - b.diffDays);
    }, [cheques]);

    const montoTotalAlertas = useMemo(
        () => alertasVencimiento.reduce((sum, c) => sum + (Number(c.monto) || 0), 0),
        [alertasVencimiento]
    );

    const handleEnviarAlertaVencimientos = async () => {
        if (!currentUid || alertasVencimiento.length === 0 || isSendingAlert) return;
        setIsSendingAlert(true);
        try {
            const vencidosCount = alertasVencimiento.filter(c => c.diffDays < 0).length;
            const resumenNumeros = alertasVencimiento
                .slice(0, 3)
                .map(c => `N° ${c.numero || 'eCheq'} (${c.terceroNombre || 'Sin nombre'})`)
                .join(', ');

            await addDoc(collection(db, 'users', currentUid, 'notifications'), {
                title: `Alerta de Cheques: ${alertasVencimiento.length} vencimiento(s) próximo(s)`,
                body: `${alertasVencimiento.length} cheque(s) activo(s) por ${formatCurrency(montoTotalAlertas)} vencen en <=72h o están vencidos (${vencidosCount} vencido(s)). Detalle: ${resumenNumeros}.`,
                type: 'warning',
                targetRoute: 'gestion/cheques',
                timestamp: Timestamp.now()
            });
            triggerToast('Alerta enviada al panel de notificaciones');
        } catch (err) {
            console.error('Error enviando alerta de vencimientos:', err);
            triggerToast('No se pudo enviar la alerta al panel');
        } finally {
            setIsSendingAlert(false);
        }
    };

    const toggleSelectCheque = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const mapChequeDocToPlantillaRow = (c) => {
        let fechaPagoStr = c.fechaPagoStr || '';
        if (!fechaPagoStr && c.fechaVencimiento?.toDate) {
            const iso = c.fechaVencimiento.toDate().toISOString().split('T')[0];
            fechaPagoStr = isoToDdMmYyyy(iso);
        }
        return {
            tipoDocumento: c.tipoDocumento || 'CUIT',
            nroDocumento: sanitizeNroDocumento(c.nroDocumento || ''),
            monto: c.montoTextoComa || formatMontoConComa(c.monto || 0),
            fechaPago: fechaPagoStr,
            motivoPago: c.motivoPago || 'Varios',
            referenciaPago: c.referenciaPago || '',
            valorReferenciaPago: c.valorReferenciaPago || '',
            mail: c.mail || '',
            clausula: c.clausula || 'A la orden'
        };
    };

    const handleExportExcelPlantilla = async () => {
        const targetCheques = selectedIds.length > 0
            ? cheques.filter(c => selectedIds.includes(c.id))
            : cheques.filter(c => c.estado === 'Emitido');

        const rows = targetCheques.map(mapChequeDocToPlantillaRow);
        await exportEcheqPlantillaExcel(rows);
        triggerToast(
            rows.length > 0
                ? `Plantilla Excel descargada con ${rows.length} cheque(s)`
                : 'Plantilla Excel en blanco con instrucciones descargada'
        );
    };

    return (
        <div className="p-4 sm:p-6 space-y-8 animate-fade-in">
            {toastMsg && (
                <div className="fixed top-20 right-5 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl z-[130] flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-bounce">
                    <Icon name="CheckCircle" size={18} />
                    {toastMsg}
                </div>
            )}

            {showConfirmModal && (
                <ConfirmModal 
                    message={confirmParams.message} 
                    onConfirm={confirmParams.action} 
                    onCancel={() => setShowConfirmModal(false)}
                    confirmText={confirmParams.confirmText}
                    isDestructive={confirmParams.isDestructive}
                />
            )}

            <CargaChequesModal
                isOpen={showCargaModal}
                onClose={() => setShowCargaModal(false)}
                targetUid={currentUid}
                terceros={terceros}
                onSuccess={(msg) => triggerToast(msg)}
            />

            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 sm:p-6 rounded-3xl shadow-xs border border-gray-100">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('gestion')} 
                        className="p-3 rounded-2xl bg-gray-50 border border-gray-200/70 text-gray-500 hover:text-gray-900 transition-all hover:shadow-xs cursor-pointer"
                    >
                        <Icon name="ArrowLeft" size={20}/>
                    </button>
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-800 tracking-tight">Gestión de Valores y Cheques</h2>
                        <p className="text-gray-500 text-xs sm:text-sm font-medium mt-0.5">
                            Control de Cheques de Terceros, Emisión Electrónica (eCheq) y Plantilla de Carga
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <button
                        type="button"
                        onClick={handleExportExcelPlantilla}
                        className="flex-1 sm:flex-none px-4 py-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
                        title="Descargar archivo Excel (.xlsx) con las pestañas 'Ayuda' y 'Plantilla para emisión'"
                    >
                        <Icon name="Download" size={16} />
                        {selectedIds.length > 0
                            ? `Exportar Seleccionados (${selectedIds.length})`
                            : 'Exportar Plantilla Excel (.xlsx)'}
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowCargaModal(true)}
                        className="flex-1 sm:flex-none px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                    >
                        <Icon name="PlusCircle" size={18} />
                        Cargar / Emitir Cheques
                    </button>
                </div>
            </header>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-xs border border-gray-100 border-l-8 border-l-blue-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">En Cartera (Mano)</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.enCartera)}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-xs border border-gray-100 border-l-8 border-l-yellow-500">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Depositados (Clearing)</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.aDepositar)}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-xs border border-gray-100 border-l-8 border-l-red-500 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">A Cubrir (Emitidos)</p>
                        <p className="text-2xl font-black text-gray-800 tracking-tight">{formatCurrency(metricas.aCubrir)}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-red-50 text-red-600 border border-red-100 text-[10px] font-black uppercase">
                        {metricas.emitidosCount} {metricas.emitidosCount === 1 ? 'activo' : 'activos'}
                    </span>
                </div>
            </div>

            {alertasVencimiento.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                            <Icon name="AlertTriangle" size={20} />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-black text-amber-900">
                                    Radar de Vencimientos (≤ 72 hs)
                                </h3>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-200 text-amber-900">
                                    {alertasVencimiento.length} cheque{alertasVencimiento.length === 1 ? '' : 's'} • {formatCurrency(montoTotalAlertas)}
                                </span>
                            </div>
                            <p className="text-xs font-medium text-amber-800 mt-1">
                                {alertasVencimiento.slice(0, 3).map(c => (
                                    `${c.terceroNombre || 'Sin beneficiario'} (N° ${c.numero || 'eCheq'}, ${c.diffDays < 0 ? `vencido hace ${Math.abs(c.diffDays)}d` : c.diffDays === 0 ? 'vence hoy' : `en ${c.diffDays}d`})`
                                )).join(' • ')}
                                {alertasVencimiento.length > 3 ? ` y ${alertasVencimiento.length - 3} más` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleEnviarAlertaVencimientos}
                        disabled={isSendingAlert}
                        className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                        <Icon name={isSendingAlert ? 'RefreshCw' : 'Clock'} size={15} className={isSendingAlert ? 'animate-spin' : ''} />
                        {isSendingAlert ? 'Enviando...' : 'Enviar Alerta al Panel de Notificaciones'}
                    </button>
                </div>
            )}

            <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
                <div className="flex gap-1.5 p-1 bg-gray-100 rounded-2xl overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('activos')} 
                        className={`flex-1 sm:flex-none px-5 sm:px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === 'activos' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Cartera Activa
                    </button>
                    <button 
                        onClick={() => setActiveTab('emitidos')} 
                        className={`flex-1 sm:flex-none px-5 sm:px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === 'emitidos' ? 'bg-white text-indigo-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Emitidos / Plantilla ({metricas.emitidosCount})
                    </button>
                    <button 
                        onClick={() => setActiveTab('historial')} 
                        className={`flex-1 sm:flex-none px-5 sm:px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${activeTab === 'historial' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Historial
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <label className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white border border-gray-100 rounded-2xl shadow-xs cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={autoConciliarOperaciones}
                            onChange={(e) => setAutoConciliarOperaciones(e.target.checked)}
                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-700">
                            Impactar cobros/pagos de cheques en Operaciones
                        </span>
                    </label>

                    <div className="relative w-full md:w-80">
                        <Icon name="Search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <input 
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por Beneficiario, CUIT, Motivo o N°..."
                            className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none shadow-xs"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl sm:rounded-[40px] shadow-xs border border-gray-100 overflow-hidden">
                <div className="p-5 sm:p-8 border-b border-gray-50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Icon name="Landmark" size={24} className="text-indigo-500"/>
                        <div>
                            <h3 className="text-base sm:text-lg font-black text-gray-800 tracking-tight">Listado de Valores</h3>
                            <p className="text-xs text-gray-400 font-medium">
                                Selecciona cheques de la lista si deseas exportarlos individualmente a la plantilla de emisión.
                            </p>
                        </div>
                    </div>

                    {selectedIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 px-3 py-1.5 rounded-xl cursor-pointer"
                        >
                            Limpiar selección ({selectedIds.length})
                        </button>
                    )}
                </div>

                <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="pl-6 pr-2 py-4 text-center w-10">
                                    <span className="sr-only">Seleccionar</span>
                                </th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Beneficiario / Documento</th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Origen / Motivo / Ref.</th>
                                <th className="px-4 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha de Pago</th>
                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Cláusula</th>
                                <th className="px-4 py-4 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto</th>
                                <th className="px-4 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                                <th className="px-6 py-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="8" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando caja de valores...</td></tr>
                            ) : chequesFiltrados.length > 0 ? chequesFiltrados.map(c => {
                                const isSelected = selectedIds.includes(c.id);
                                return (
                                    <tr key={c.id} className={`hover:bg-gray-50/50 transition-colors group ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="pl-6 pr-2 py-5 text-center">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleSelectCheque(c.id)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                title="Seleccionar para exportar a Plantilla Excel"
                                            />
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-gray-900">{c.terceroNombre || 'Sin nombre'}</span>
                                                {c.terceroId && (
                                                    <button 
                                                        onClick={() => navigate(c.tipo === 'recibido' ? `gestion/deudores/${c.terceroId}` : `gestion/proveedores/${c.terceroId}`)}
                                                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity p-1 text-blue-500 hover:text-blue-700 cursor-pointer"
                                                        title="Ver Cuenta Corriente"
                                                    >
                                                        <Icon name="ExternalLink" size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                            {c.nroDocumento && (
                                                <div className="text-[11px] font-mono font-bold text-slate-500 mt-0.5">
                                                    {c.tipoDocumento || 'CUIT'}: {c.nroDocumento}
                                                </div>
                                            )}
                                            {c.mail && (
                                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                                    {c.mail}
                                                </div>
                                            )}
                                            <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${c.tipo === 'recibido' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {c.tipo === 'recibido' ? 'Entrante (Cliente)' : 'Saliente (Emisión)'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="text-sm font-bold text-gray-700">{c.banco || 'Emisión Electrónica'}</div>
                                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">N° {c.numero || 'eCheq'}</div>
                                            {c.motivoPago && (
                                                <div className="text-[11px] font-semibold text-indigo-600 mt-1">
                                                    Motivo: {c.motivoPago}
                                                </div>
                                            )}
                                            {c.referenciaPago && (
                                                <div className="text-[10px] text-slate-500">
                                                    {c.referenciaPago}: <span className="font-mono font-bold">{c.valorReferenciaPago}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-5">
                                            <div className="text-sm font-bold text-gray-700 font-mono">
                                                {formatDate(c.fechaVencimiento, c.fechaPagoStr)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-5 text-center">
                                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                {c.clausula || 'A la orden'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-5 text-right">
                                            <div className="text-lg font-black text-gray-900 tracking-tight">{formatCurrency(c.monto)}</div>
                                            {c.montoTextoComa && (
                                                <div className="text-[10px] font-mono text-gray-400">
                                                    Plantilla: {c.montoTextoComa}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-5 text-center">
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
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex items-center justify-center gap-2">
                                                {c.estado === 'En Cartera' && (
                                                    <button 
                                                        onClick={() => promptAction(`¿Depositar cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Depositado'), 'Depositar', false)}
                                                        className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xs cursor-pointer"
                                                    >
                                                        Depositar
                                                    </button>
                                                )}
                                                {c.estado === 'Depositado' && (
                                                    <button 
                                                        onClick={() => promptAction(`¿Confirmar acreditación del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Cobrado'), 'Confirmar Cobro', false)}
                                                        className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-xs cursor-pointer"
                                                    >
                                                        Cobrado
                                                    </button>
                                                )}
                                                {c.estado === 'Emitido' && (
                                                    <button 
                                                        onClick={() => promptAction(`¿Confirmar débito del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Pagado'), 'Confirmar Pago', false)}
                                                        className="px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all shadow-xs cursor-pointer"
                                                    >
                                                        Pagado
                                                    </button>
                                                )}
                                                
                                                <button 
                                                    onClick={() => promptAction(`¿Eliminar o anular el registro de este cheque N° ${c.numero || ''}?`, () => handleDeleteCheque(c.id), 'Eliminar', true)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                                                    title="Eliminar / Anular Cheque"
                                                >
                                                    <Icon name="Trash2" size={16}/>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="8" className="text-center py-20">
                                        <div className="max-w-sm mx-auto space-y-3">
                                            <p className="text-gray-400 font-bold italic">No se encontraron cheques con los filtros aplicados.</p>
                                            <button
                                                type="button"
                                                onClick={() => setShowCargaModal(true)}
                                                className="px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-black uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-2"
                                            >
                                                <Icon name="PlusCircle" size={15} />
                                                Cargar o Emitir Nuevo Cheque
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Vista Tarjetas (Celular) */}
                <div className="md:hidden divide-y divide-gray-100">
                    {loading ? (
                        <div className="text-center py-14 text-gray-400 font-bold animate-pulse text-sm">Sincronizando caja de valores...</div>
                    ) : chequesFiltrados.length > 0 ? chequesFiltrados.map(c => (
                        <div key={c.id} className="p-4 space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <span className="text-sm font-black text-gray-900 block">{c.terceroNombre}</span>
                                    {c.nroDocumento && (
                                        <span className="text-[11px] font-mono font-bold text-slate-500 block">
                                            {c.tipoDocumento || 'CUIT'}: {c.nroDocumento}
                                        </span>
                                    )}
                                    <span className="text-xs font-bold text-gray-500">
                                        {c.banco || 'Emisión Electrónica'} • N° {c.numero || 'eCheq'}
                                    </span>
                                </div>
                                <span className="text-base font-black text-gray-900">{formatCurrency(c.monto)}</span>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <span className="text-xs font-bold text-gray-500">
                                    Fecha pago: {formatDate(c.fechaVencimiento, c.fechaPagoStr)}
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {c.clausula && (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
                                            {c.clausula}
                                        </span>
                                    )}
                                    {c.conciliadoOperationId && (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                                            Conciliado en Operaciones
                                        </span>
                                    )}
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                        c.estado === 'En Cartera' ? 'bg-blue-50 text-blue-600 border-blue-100' : 
                                        c.estado === 'Depositado' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' : 
                                        c.estado === 'Emitido' ? 'bg-red-50 text-red-600 border-red-100' : 
                                        c.estado === 'Pagado' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                                        'bg-emerald-50 text-emerald-600 border-emerald-100'
                                    }`}>
                                        {c.estado}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-50">
                                {c.estado === 'En Cartera' && (
                                    <button 
                                        type="button"
                                        onClick={() => promptAction(`¿Depositar cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Depositado'), 'Depositar', false)}
                                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all cursor-pointer"
                                    >
                                        Depositar
                                    </button>
                                )}
                                {c.estado === 'Depositado' && (
                                    <button 
                                        type="button"
                                        onClick={() => promptAction(`¿Confirmar acreditación del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Cobrado'), 'Confirmar Cobro', false)}
                                        className="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 hover:text-white transition-all cursor-pointer"
                                    >
                                        Cobrado
                                    </button>
                                )}
                                {c.estado === 'Emitido' && (
                                    <button 
                                        type="button"
                                        onClick={() => promptAction(`¿Confirmar débito del cheque N° ${c.numero}?`, () => handleUpdateEstado(c.id, 'Pagado'), 'Confirmar Pago', false)}
                                        className="px-3 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-orange-600 hover:text-white transition-all cursor-pointer"
                                    >
                                        Pagado
                                    </button>
                                )}
                                <button 
                                    type="button"
                                    onClick={() => promptAction(`¿Eliminar o anular el registro de este cheque N° ${c.numero || ''}?`, () => handleDeleteCheque(c.id), 'Eliminar', true)}
                                    className="px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-red-600 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                                    title="Eliminar / Anular Cheque"
                                >
                                    <Icon name="Trash2" size={12} />
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-14 text-gray-400 font-bold italic text-sm">No se encontraron cheques con los filtros aplicados.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ChequesPage;
