import React from 'react';
import Icon from '../../Common/Icon';
import { formatCurrency } from '../../../utils/billingUtils';

/** Modal de asignación en 1 clic para vincular comprobantes recibidos sin cliente identificado. */
const AssignClientModal = ({
    assigningRequest,
    selectedAssignUserId,
    setSelectedAssignUserId,
    systemUsers,
    isAdminPhone,
    onClose,
    onAssign
}) => {
    if (!assigningRequest) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-md w-full p-8 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-800 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
                            <Icon name="AlertCircle" size={12}/> Comprobante Sin Asignar
                        </div>
                        <h3 className="text-xl font-black text-gray-900">Vincular a un Cliente</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Selecciona el cliente del estudio al que corresponde este comprobante.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl">
                        <Icon name="X" size={20}/>
                    </button>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-6 space-y-2 text-xs">
                    <div className="flex justify-between text-gray-600">
                        <span className="font-bold">Remitente WhatsApp:</span>
                        <span className="font-mono">{assigningRequest.senderPhone || (!isAdminPhone(assigningRequest.userPhone) ? assigningRequest.userPhone : 'S/D')}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span className="font-bold">Monto:</span>
                        <span className="font-bold text-gray-900">{formatCurrency(assigningRequest.aiData?.monto_total || 0)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span className="font-bold">Emisor Detectado:</span>
                        <span>{assigningRequest.aiData?.nombre_emisor || 'Desconocido'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                        <span className="font-bold">Receptor Detectado:</span>
                        <span>{assigningRequest.aiData?.nombre_receptor || 'Desconocido'}</span>
                    </div>
                </div>

                <div className="space-y-4 mb-6">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block px-1">
                        Seleccionar Cliente del Estudio
                    </label>
                    <select 
                        value={selectedAssignUserId} 
                        onChange={(e) => setSelectedAssignUserId(e.target.value)}
                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl font-bold text-gray-800 outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm"
                    >
                        <option value="">-- Elige un cliente registrado --</option>
                        {systemUsers.map(u => (
                            <option key={u.id} value={u.id}>
                                {u.nombre || u.email} {u.cuit ? `(CUIT: ${u.cuit})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={onAssign}
                        disabled={!selectedAssignUserId}
                        className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all disabled:opacity-50"
                    >
                        Asignar Ahora
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignClientModal;
