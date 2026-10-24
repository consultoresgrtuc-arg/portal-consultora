import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  doc, 
  updateDoc, 
  collection, 
  getDocs, 
  addDoc, 
  Timestamp,
  query 
} from 'firebase/firestore';
import Icon from '../Common/Icon';

const LinkClientModal = ({ targetUser, tercerosList = [], adminUid, onClose, onSuccess }) => {
    const [localTerceros, setLocalTerceros] = useState([]);
    const [loadingLocal, setLoadingLocal] = useState(false);

    // Fallback: si tercerosList viene vacío desde el padre, cargar directamente desde Firestore
    useEffect(() => {
        if ((!tercerosList || tercerosList.length === 0) && adminUid) {
            setLoadingLocal(true);
            const q = query(collection(db, 'users', adminUid, 'terceros'));
            getDocs(q).then((snap) => {
                setLocalTerceros(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }).catch(err => {
                console.error("Error al cargar terceros en modal:", err);
            }).finally(() => {
                setLoadingLocal(false);
            });
        }
    }, [tercerosList, adminUid]);

    const effectiveTerceros = useMemo(() => {
        if (tercerosList && tercerosList.length > 0) return tercerosList;
        return localTerceros;
    }, [tercerosList, localTerceros]);

    const normUserCuit = useMemo(() => (targetUser?.cuit || '').replace(/\D/g, ''), [targetUser]);
    const userEmail = useMemo(() => (targetUser?.email || '').toLowerCase().trim(), [targetUser]);

    // Buscar sugerencia automática por CUIT o correo
    const suggestedTercero = useMemo(() => {
        if (!effectiveTerceros || effectiveTerceros.length === 0) return null;
        return effectiveTerceros.find(t => {
            const normTCuit = (t.cuit || '').replace(/\D/g, '');
            const tEmail = (t.email || '').toLowerCase().trim();
            const matchCuit = normUserCuit && normUserCuit.length >= 10 && normTCuit === normUserCuit;
            const matchEmail = userEmail && tEmail && tEmail === userEmail;
            return matchCuit || matchEmail;
        });
    }, [effectiveTerceros, normUserCuit, userEmail]);

    const [selectedTerceroId, setSelectedTerceroId] = useState(
        targetUser?.terceroId || (suggestedTercero ? suggestedTercero.id : '')
    );

    // Actualizar selectedTerceroId si la sugerencia se calcula luego de la carga
    useEffect(() => {
        if (!selectedTerceroId && suggestedTercero) {
            setSelectedTerceroId(suggestedTercero.id);
        }
    }, [suggestedTercero, selectedTerceroId]);

    const [syncHistory, setSyncHistory] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');

    const currentLinkedTercero = useMemo(() => {
        if (!targetUser?.terceroId) return null;
        return effectiveTerceros.find(t => t.id === targetUser.terceroId);
    }, [targetUser, effectiveTerceros]);

    const handleConfirmLink = async (e) => {
        e.preventDefault();
        if (!selectedTerceroId || !adminUid || !targetUser) return;

        const selectedTercero = effectiveTerceros.find(t => t.id === selectedTerceroId);
        if (!selectedTercero) return;

        setIsSubmitting(true);
        setStatusMessage('Vinculando cuenta con la ficha del cliente...');

        try {
            // 1. Actualizar la ficha de Tercero en la libreta del estudio
            await updateDoc(doc(db, 'users', adminUid, 'terceros', selectedTerceroId), {
                userId: targetUser.id,
                userEmail: targetUser.email || '',
                linkedAt: Timestamp.now()
            });

            // 2. Actualizar el perfil del usuario autenticado
            const userUpdatePayload = {
                terceroId: selectedTerceroId,
                clienteNombre: selectedTercero.nombre,
                cuit: selectedTercero.cuit || targetUser.cuit || '',
                telefono: selectedTercero.telefono || targetUser.telefono || '',
                isLinkedToStudio: true
            };
            await updateDoc(doc(db, 'users', targetUser.id), userUpdatePayload);

            // 3. Sincronizar historial si está activado
            if (syncHistory) {
                setStatusMessage('Sincronizando operaciones contables históricas...');
                // A. Copiar operaciones previas guardadas bajo el terceroId hacia el UID del usuario
                try {
                    const opsSnap = await getDocs(collection(db, 'users', selectedTerceroId, 'operations'));
                    if (!opsSnap.empty) {
                        for (const opDoc of opsSnap.docs) {
                            const opData = opDoc.data();
                            await addDoc(collection(db, 'users', targetUser.id, 'operations'), {
                                ...opData,
                                syncedFromTercero: true
                            });
                        }
                    }
                } catch (opsErr) {
                    console.warn("Aviso al migrar operaciones desde tercero:", opsErr);
                }

                // B. Reasignar comprobantes de facturación previos que correspondan al CUIT del cliente
                setStatusMessage('Asignando comprobantes de facturación...');
                try {
                    const normCuit = (selectedTercero.cuit || '').replace(/\D/g, '');
                    if (normCuit && normCuit.length >= 10) {
                        const bSnap = await getDocs(collection(db, 'billing_requests'));
                        for (const bDoc of bSnap.docs) {
                            const bData = bDoc.data();
                            const bEmisor = (bData.aiData?.cuit_emisor || bData.manualData?.cuitEmisor || '').replace(/\D/g, '');
                            const bReceptor = (bData.aiData?.cuit_receptor || bData.manualData?.cuitReceptor || bData.manualData?.cuitCliente || '').replace(/\D/g, '');
                            
                            const match = bEmisor === normCuit || bReceptor === normCuit;
                            if (match && (!bData.userId || bData.userId === adminUid || bData.userId === 'unassigned' || bData.userId === selectedTerceroId)) {
                                await updateDoc(bDoc.ref, {
                                    userId: targetUser.id,
                                    userName: selectedTercero.nombre || targetUser.nombre || targetUser.email,
                                    userCuit: selectedTercero.cuit || ''
                                });
                            }
                        }
                    }
                } catch (bErr) {
                    console.warn("Aviso al actualizar billing_requests:", bErr);
                }
            }

            setStatusMessage('✅ ¡Vinculación completada con éxito!');
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1200);
        } catch (err) {
            console.error("Error al vincular cliente:", err);
            setStatusMessage(`❌ Error: ${err.message || 'Error desconocido'}`);
            setIsSubmitting(false);
        }
    };

    const handleUnlink = async () => {
        if (!confirm(`¿Deseas desvincular a ${targetUser.nombre || targetUser.email} de la ficha ${currentLinkedTercero?.nombre || 'de cartera'}? Sus datos no serán borrados.`)) {
            return;
        }

        setIsSubmitting(true);
        setStatusMessage('Desvinculando cuenta...');

        try {
            if (targetUser.terceroId && adminUid) {
                await updateDoc(doc(db, 'users', adminUid, 'terceros', targetUser.terceroId), {
                    userId: null,
                    userEmail: '',
                    unlinkedAt: Timestamp.now()
                });
            }

            await updateDoc(doc(db, 'users', targetUser.id), {
                terceroId: null,
                isLinkedToStudio: false
            });

            setStatusMessage('✅ Desvinculado correctamente.');
            setTimeout(() => {
                onSuccess?.();
                onClose();
            }, 1200);
        } catch (err) {
            console.error("Error al desvincular:", err);
            setStatusMessage(`❌ Error: ${err.message}`);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[36px] shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                            <Icon name="Link" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">
                                Vincular Cuenta de Usuario
                            </h3>
                            <p className="text-xs text-gray-500 font-medium">Asocia este usuario con una ficha de tu cartera de clientes.</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        disabled={isSubmitting}
                        className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all cursor-pointer"
                    >
                        <Icon name="X" size={20} />
                    </button>
                </div>

                {/* Tarjeta del Usuario Registrado */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Usuario Autenticado</span>
                        <p className="font-black text-slate-800 text-sm">{targetUser.nombre || 'Sin nombre cargado'}</p>
                        <p className="text-xs font-mono text-slate-500">{targetUser.email}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">CUIT en Perfil</span>
                        <p className="text-xs font-bold text-slate-700 font-mono">{targetUser.cuit || 'S/D'}</p>
                    </div>
                </div>

                {/* Estado Actual */}
                {currentLinkedTercero && (
                    <div className="mb-6 p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 block">Actualmente Vinculado a:</span>
                            <p className="font-black text-blue-950 text-sm">{currentLinkedTercero.nombre}</p>
                            <p className="text-xs font-mono text-blue-800/80">CUIT: {currentLinkedTercero.cuit || 'S/D'}</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleUnlink}
                            disabled={isSubmitting}
                            className="px-3 py-1.5 text-xs font-black text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 transition-all cursor-pointer"
                        >
                            Desvincular
                        </button>
                    </div>
                )}

                {/* Sugerencia Inteligente si no está vinculado aún */}
                {!currentLinkedTercero && suggestedTercero && (
                    <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3">
                        <Icon name="Sparkles" size={20} className="text-emerald-600 shrink-0" />
                        <div className="text-xs">
                            <p className="font-black text-emerald-900">Coincidencia detectada en Cartera</p>
                            <p className="text-emerald-800">
                                Coincide con <strong>{suggestedTercero.nombre}</strong> (CUIT: {suggestedTercero.cuit}).
                            </p>
                        </div>
                    </div>
                )}

                <form onSubmit={handleConfirmLink} className="space-y-5">
                    <div>
                        <div className="flex items-center justify-between mb-2 px-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">
                                Seleccionar Cliente de Cartera (Estudio)
                            </label>
                            {loadingLocal && (
                                <span className="text-[10px] text-blue-500 font-bold animate-pulse">
                                    Cargando cartera...
                                </span>
                            )}
                        </div>
                        {(() => {
                            const clientesDisponibles = effectiveTerceros.filter(
                                t => (t.tipo || 'Cliente').toLowerCase() !== 'proveedor'
                            );
                            return (
                                <>
                                    <select
                                        value={selectedTerceroId}
                                        onChange={(e) => setSelectedTerceroId(e.target.value)}
                                        disabled={isSubmitting || loadingLocal}
                                        className="w-full px-4 py-3 bg-white border-2 border-gray-200 focus:border-blue-500 rounded-2xl text-xs font-bold text-gray-800 outline-none transition-all cursor-pointer"
                                    >
                                        <option value="">
                                            {clientesDisponibles.length > 0
                                                ? `-- Elige una Ficha de Cliente (${clientesDisponibles.length} disponibles) --`
                                                : '-- No hay fichas de cliente en la cartera --'}
                                        </option>
                                        {clientesDisponibles.map(t => {
                                            const isSuggested = suggestedTercero?.id === t.id;
                                            const alreadyLinkedOther = t.userId && t.userId !== targetUser.id;
                                            return (
                                                <option key={t.id} value={t.id}>
                                                    {isSuggested ? '✨ ' : ''}{t.nombre} (CUIT: {t.cuit || 'S/D'}) {alreadyLinkedOther ? '⚠️ Ya vinculado a otra cuenta' : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    {clientesDisponibles.length === 0 && !loadingLocal && (
                                        <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] font-medium flex items-center gap-2">
                                            <Icon name="AlertCircle" className="w-4 h-4 text-amber-600 shrink-0" />
                                            <span>
                                                No tienes fichas de clientes registradas en la libreta del estudio. Puedes darlas de alta desde <strong>Gestión → Terceros</strong>.
                                            </span>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Sincronización Automática */}
                    <div 
                        onClick={() => !isSubmitting && setSyncHistory(!syncHistory)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between ${
                            syncHistory ? 'bg-indigo-50 border-indigo-200 text-indigo-950' : 'bg-gray-50 border-gray-200 text-gray-600'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <Icon name="RotateCcw" size={16} className={syncHistory ? 'text-indigo-600' : 'text-gray-400'} />
                            <div>
                                <p className="text-xs font-black uppercase tracking-wider">Traspasar Historial Previo</p>
                                <p className="text-[11px] opacity-80 font-medium">Asigna comprobantes y operaciones previas a su nuevo UID.</p>
                            </div>
                        </div>
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            syncHistory ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 bg-white'
                        }`}>
                            {syncHistory && <Icon name="Check" size={12} />}
                        </div>
                    </div>

                    {statusMessage && (
                        <div className="p-3 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold text-center">
                            {statusMessage}
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="flex-1 py-3 text-xs font-black uppercase tracking-wider text-gray-500 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !selectedTerceroId}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-200 transition-all cursor-pointer"
                        >
                            {isSubmitting ? 'Procesando...' : (currentLinkedTercero ? 'Actualizar Vínculo' : 'Vincular y Compartir')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LinkClientModal;
