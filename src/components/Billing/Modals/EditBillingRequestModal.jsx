import React from 'react';
import Icon from '../../Common/Icon';
import { checkSuspiciousDate } from '../../../utils/billingUtils';

/** Modal de edición completa para corregir datos detectados por IA en una solicitud. */
const EditBillingRequestModal = ({
    editingRequest,
    editFormData,
    setEditFormData,
    onClose,
    onSubmit
}) => {
    if (!editingRequest) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-[48px] shadow-2xl max-w-3xl w-full p-12 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">Corregir Datos Detectados</h3>
                        <p className="text-gray-500 text-sm font-medium mt-1 uppercase tracking-widest">Ajusta la información extraída por la IA para asegurar precisión.</p>
                    </div>
                    <button onClick={onClose} className="p-3 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-2xl transition-all">
                        <Icon name="X" size={28}/>
                    </button>
                </div>
                
                <form onSubmit={onSubmit} className="space-y-10">
                    {/* Operation Details Section */}
                    <section>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-1.5 h-6 bg-yellow-400 rounded-full"></div>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Información General</h4>
                        </div>
                        <div className="space-y-6 bg-yellow-50/50 p-8 rounded-[32px] border border-yellow-100">
                            {/* Selector de Clasificación Contable */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-yellow-800 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                    <Icon name="Tag" size={13}/> Clasificación Contable
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setEditFormData({ ...editFormData, clasificacion_contable: 'venta' })}
                                        className={`p-3.5 rounded-2xl border-2 text-left sm:text-center transition-all flex flex-col justify-center items-start sm:items-center gap-1 ${
                                            (editFormData.clasificacion_contable || 'venta') === 'venta'
                                                ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm font-black'
                                                : 'bg-white border-transparent text-gray-600 hover:bg-gray-50 font-bold'
                                        }`}
                                    >
                                        <span className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span> Venta / Cobro
                                        </span>
                                        <span className="text-[10px] text-emerald-700 font-medium opacity-80">Ingreso comercial a facturar</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditFormData({ ...editFormData, clasificacion_contable: 'compra' })}
                                        className={`p-3.5 rounded-2xl border-2 text-left sm:text-center transition-all flex flex-col justify-center items-start sm:items-center gap-1 ${
                                            editFormData.clasificacion_contable === 'compra'
                                                ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm font-black'
                                                : 'bg-white border-transparent text-gray-600 hover:bg-gray-50 font-bold'
                                        }`}
                                    >
                                        <span className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Compra
                                        </span>
                                        <span className="text-[10px] text-blue-700 font-medium opacity-80">Factura de proveedor tercero</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditFormData({ ...editFormData, clasificacion_contable: 'gasto' })}
                                        className={`p-3.5 rounded-2xl border-2 text-left sm:text-center transition-all flex flex-col justify-center items-start sm:items-center gap-1 ${
                                            editFormData.clasificacion_contable === 'gasto'
                                                ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-sm font-black'
                                                : 'bg-white border-transparent text-gray-600 hover:bg-gray-50 font-bold'
                                        }`}
                                    >
                                        <span className="text-xs uppercase tracking-wider flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> Gasto
                                        </span>
                                        <span className="text-[10px] text-purple-700 font-medium opacity-80">Servicio, impuesto o comercio</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Fecha</label>
                                    <input type="date" value={editFormData.fecha_pago} onChange={e => setEditFormData({...editFormData, fecha_pago: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
                                    {(() => {
                                        const susp = checkSuspiciousDate(editFormData.fecha_pago);
                                        if (!susp) return null;
                                        return (
                                            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs mt-1 animate-in fade-in">
                                                <p className="font-bold flex items-center gap-1.5 text-amber-900">
                                                    <Icon name="AlertTriangle" size={13} className="text-amber-600 shrink-0" />
                                                    Año {susp.detectedYear} (Año actual: {susp.currentYear})
                                                </p>
                                                <p className="text-[10px] text-amber-800 mt-0.5 leading-snug">
                                                    {susp.reason}
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditFormData({ ...editFormData, fecha_pago: susp.suggestedCorrectedDate })}
                                                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
                                                    >
                                                        Cambiar a {susp.suggestedCorrectedDisplay}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditFormData({ ...editFormData, fecha_pago: susp.todayDate })}
                                                        className="px-2.5 py-1 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-[10px] rounded-lg transition-all active:scale-95 cursor-pointer"
                                                    >
                                                        Usar Hoy ({susp.todayDisplay})
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Hora</label>
                                    <input type="time" value={editFormData.hora_pago} onChange={e => setEditFormData({...editFormData, hora_pago: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Monto Total</label>
                                    <input type="number" step="0.01" value={editFormData.monto_total} onChange={e => setEditFormData({...editFormData, monto_total: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-black text-lg text-gray-900 shadow-sm"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Tipo de Comprobante</label>
                                    <input type="text" value={editFormData.tipo_comprobante} onChange={e => setEditFormData({...editFormData, tipo_comprobante: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="Ej: Transferencia"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Plataforma / App (Receptor)</label>
                                    <input type="text" value={editFormData.aplicacion_pago} onChange={e => setEditFormData({...editFormData, aplicacion_pago: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="Ej: YPF, Mercado Pago, Cuenta DNI, BBVA"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Número de Operación</label>
                                    <input type="text" value={editFormData.numero_operacion} onChange={e => setEditFormData({...editFormData, numero_operacion: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="ID de transacción / Referencia"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Nombre Fantasía / Local</label>
                                    <input type="text" value={editFormData.nombre_fantasia} onChange={e => setEditFormData({...editFormData, nombre_fantasia: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="Ej: MINI MODA"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Medio de Pago / Tarjeta</label>
                                    <input type="text" value={editFormData.medio_pago_detalle} onChange={e => setEditFormData({...editFormData, medio_pago_detalle: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="Ej: Naranja *6164, Mastercard *9020"/>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Cuotas (si aplica)</label>
                                    <input type="text" value={editFormData.cuotas} onChange={e => setEditFormData({...editFormData, cuotas: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="Ej: 3 cuotas sin interés"/>
                                </div>
                                <div className="md:col-span-3 space-y-2">
                                    <label className="text-[10px] font-black text-amber-800 uppercase tracking-widest px-1 flex items-center gap-1.5">
                                        <Icon name="Key" size={12}/> Código de Identificación Único
                                    </label>
                                    <input type="text" value={editFormData.codigo_identificacion} onChange={e => setEditFormData({...editFormData, codigo_identificacion: e.target.value})} className="w-full p-3 bg-amber-50/50 border border-amber-200/60 focus:ring-2 focus:ring-amber-300 rounded-xl transition-all outline-none font-mono text-xs font-bold text-amber-950 shadow-sm" placeholder="Código alfanumérico único COELSA / Transacción"/>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Parties Section */}
                    {(() => {
                        const isVenta = (editFormData.clasificacion_contable || 'venta') === 'venta';
                        return (
                            <div className="space-y-4">
                                <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                                    isVenta 
                                        ? 'bg-blue-50/70 border-blue-200 text-blue-900' 
                                        : 'bg-purple-50/70 border-purple-200 text-purple-900'
                                }`}>
                                    <Icon name="Info" size={16} className="shrink-0"/>
                                    <span>
                                        {isVenta 
                                            ? 'En Ventas: el Emisor es el Comprador y el Receptor es el Cliente del Estudio (quien factura).' 
                                            : 'En Compras/Gastos: el Emisor de fondos es el Cliente del Estudio (quien incurre en el egreso) y el Receptor es el Proveedor / Comercio.'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Columna 1: Emisor */}
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-6 rounded-full ${isVenta ? 'bg-gray-400' : 'bg-purple-600'}`}></div>
                                                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isVenta ? 'text-gray-500' : 'text-purple-700'}`}>
                                                    {isVenta ? 'Emisor Original (Comprador)' : 'Emisor de Fondos (Cliente Titular)'}
                                                </h4>
                                            </div>
                                            {!isVenta && (
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                                                    Cliente del Estudio
                                                </span>
                                            )}
                                        </div>
                                        <div className={`${isVenta ? 'bg-gray-50/60 border-gray-200/80' : 'bg-purple-50/40 border-purple-200'} p-7 rounded-[32px] border space-y-4`}>
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-black text-gray-500 uppercase px-1">Nombre / Razón Social</label>
                                                <input value={editFormData.nombre_emisor} onChange={e => setEditFormData({...editFormData, nombre_emisor: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-xs focus:border-purple-300"/>
                                            </div>

                                            {/* Teléfono en Emisor SOLO si es Compra/Gasto (Cliente Titular) */}
                                            {!isVenta && (
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-purple-700 uppercase px-1 flex items-center gap-1">
                                                        <Icon name="Phone" size={11}/> Teléfono / WhatsApp de Contacto
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">📱</span>
                                                        <input type="tel" placeholder="549..." value={editFormData.userPhone} onChange={e => setEditFormData({...editFormData, userPhone: e.target.value})} className="w-full pl-11 pr-4 py-2.5 bg-white border-2 border-purple-200 focus:border-purple-400 rounded-xl transition-all outline-none font-bold text-purple-900 shadow-xs"/>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase px-1">CUIT</label>
                                                    <input value={editFormData.cuit_emisor} onChange={e => setEditFormData({...editFormData, cuit_emisor: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-xs focus:border-purple-300 font-mono" placeholder="20-xxxxxxxx-x"/>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-gray-500 uppercase px-1">Banco / Billetera</label>
                                                    <input value={editFormData.banco_origen} onChange={e => setEditFormData({...editFormData, banco_origen: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-xs focus:border-purple-300"/>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    {/* Columna 2: Receptor */}
                                    <section>
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-1.5 h-6 rounded-full ${isVenta ? 'bg-blue-600' : 'bg-gray-400'}`}></div>
                                                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isVenta ? 'text-blue-700' : 'text-gray-500'}`}>
                                                    {isVenta ? 'Receptor (Cliente del Estudio)' : 'Receptor / Proveedor (Destino)'}
                                                </h4>
                                            </div>
                                            {isVenta && (
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                                                    Cliente del Estudio
                                                </span>
                                            )}
                                        </div>
                                        <div className={`${isVenta ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50/60 border-gray-200/80'} p-7 rounded-[32px] border space-y-4`}>
                                            <div className="space-y-1.5">
                                                <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-700' : 'text-gray-500'}`}>Nombre / Razón Social</label>
                                                <input value={editFormData.nombre_receptor} onChange={e => setEditFormData({...editFormData, nombre_receptor: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-900 shadow-xs focus:border-blue-300"/>
                                            </div>

                                            {/* Teléfono en Receptor SOLO si es Venta (Cliente del Estudio) */}
                                            {isVenta && (
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-black text-blue-700 uppercase px-1 flex items-center gap-1">
                                                        <Icon name="Phone" size={11}/> Teléfono / WhatsApp de Contacto
                                                    </label>
                                                    <div className="relative">
                                                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">📱</span>
                                                        <input type="tel" placeholder="549..." value={editFormData.userPhone} onChange={e => setEditFormData({...editFormData, userPhone: e.target.value})} className="w-full pl-11 pr-4 py-2.5 bg-white border-2 border-blue-200 focus:border-blue-400 rounded-xl transition-all outline-none font-bold text-blue-900 shadow-xs"/>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-700' : 'text-gray-500'}`}>CUIT</label>
                                                    <input value={editFormData.cuit_receptor} onChange={e => setEditFormData({...editFormData, cuit_receptor: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-900 shadow-xs focus:border-blue-300 font-mono" placeholder="20-xxxxxxxx-x"/>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-700' : 'text-gray-500'}`}>Banco / Billetera</label>
                                                    <input value={editFormData.banco_receptor} onChange={e => setEditFormData({...editFormData, banco_receptor: e.target.value})} className="w-full p-3 bg-white border border-gray-200/60 rounded-xl transition-all outline-none font-bold text-gray-900 shadow-xs focus:border-blue-300"/>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        );
                    })()}

                    <section>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Concepto Detectado / Detalle Adicional</label>
                            <textarea rows="3" value={editFormData.concepto_detectado} onChange={e => setEditFormData({...editFormData, concepto_detectado: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-[24px] transition-all outline-none font-medium text-gray-700 resize-none shadow-inner"></textarea>
                        </div>
                    </section>

                    <section>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Nota adicional (Cliente)</label>
                            <textarea rows="3" placeholder="Sin nota adicional" value={editFormData.note} onChange={e => setEditFormData({...editFormData, note: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-[24px] transition-all outline-none font-medium text-gray-700 resize-none shadow-inner"></textarea>
                        </div>
                    </section>

                    <div className="flex gap-6 pt-6 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="flex-1 py-5 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-2xl transition-all">Descartar Cambios</button>
                        <button 
                            type="submit" 
                            className="flex-[2] bg-gray-900 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-gray-200 hover:bg-black transition-all transform active:scale-95"
                        >
                            Confirmar y Guardar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditBillingRequestModal;
