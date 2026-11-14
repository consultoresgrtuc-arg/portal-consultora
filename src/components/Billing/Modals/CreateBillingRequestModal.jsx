import React from 'react';
import Icon from '../../Common/Icon';
import { MAX_FILES, getSafePreviewUrl } from '../../../utils/billingUtils';

/** Modal de creación de solicitudes de facturación (multi-archivo con Drag & Drop y carga manual) + Lightbox de vista previa. */
const CreateBillingRequestModal = ({
    isOpen,
    onClose,
    createMode,
    setCreateMode,
    manualData,
    setManualData,
    newRequestFiles,
    newRequestNote,
    setNewRequestNote,
    fileError,
    uploadProgress,
    uploading,
    isDragging,
    previewItem,
    setPreviewItem,
    onSubmit,
    onDragOver,
    onDragLeave,
    onDrop,
    onFileSelection,
    onRemoveFile
}) => {
    if (!isOpen && !previewItem) return null;

    return (
        <>
            {/* Modal de Creación (Nivel Completo con Drag & Drop y Lightbox) */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                >
                    <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto relative">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Nueva Solicitud</h3>
                                <p className="text-gray-500 text-sm font-medium mt-1">Sube uno o varios comprobantes para análisis IA o registra un pago manual.</p>
                            </div>
                            <button onClick={onClose} disabled={uploading} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all disabled:opacity-50">
                                <Icon name="X" size={24}/>
                            </button>
                        </div>

                        <div className="flex bg-gray-50 p-1.5 rounded-2xl mb-6 border border-gray-100">
                            <button 
                                onClick={() => setCreateMode('file')} 
                                disabled={uploading}
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${createMode === 'file' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}
                            >
                                Adjuntar Archivos
                            </button>
                            <button 
                                onClick={() => setCreateMode('manual')} 
                                disabled={uploading}
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${createMode === 'manual' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}
                            >
                                Carga Manual
                            </button>
                        </div>

                        <form onSubmit={onSubmit} className="space-y-5">
                            {createMode === 'file' ? (
                                <div className="space-y-4">
                                    {/* Zona de Drop / Selección con Drag & Drop Interactivo */}
                                    {newRequestFiles.length === 0 ? (
                                        <label 
                                            className="group block"
                                            onDragOver={onDragOver}
                                            onDragLeave={onDragLeave}
                                            onDrop={onDrop}
                                        >
                                            <div className={`border-4 border-dashed rounded-3xl p-8 text-center transition-all cursor-pointer ${
                                                isDragging 
                                                    ? 'border-blue-500 bg-blue-50/80 ring-4 ring-blue-100 scale-[1.02]' 
                                                    : 'border-gray-100 group-hover:border-blue-200 group-hover:bg-blue-50/30'
                                            }`}>
                                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 transition-transform shadow-sm ${
                                                    isDragging ? 'bg-blue-600 text-white scale-125' : 'bg-blue-50 text-blue-600 group-hover:scale-110'
                                                }`}>
                                                    <Icon name={isDragging ? 'DownloadCloud' : 'Search'} size={26}/>
                                                </div>
                                                <p className="text-sm font-black text-gray-800">
                                                    {isDragging ? '¡Suelta tus comprobantes aquí!' : 'Arrastra o Selecciona Comprobantes'}
                                                </p>
                                                <p className="text-xs text-gray-400 font-bold mt-1.5 uppercase tracking-wider">
                                                    Hasta {MAX_FILES} archivos (JPG, PNG, WEBP o PDF)
                                                </p>
                                                <div className="flex justify-center gap-2 mt-3">
                                                    <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg uppercase tracking-widest">
                                                        Máx. 5 MB c/u
                                                    </span>
                                                    <span className="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-black rounded-lg uppercase tracking-widest">
                                                        Arrastrar & Soltar
                                                    </span>
                                                </div>
                                            </div>
                                            <input 
                                                type="file" 
                                                className="hidden" 
                                                multiple 
                                                onChange={onFileSelection} 
                                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                                disabled={uploading}
                                            />
                                        </label>
                                    ) : (
                                        <div 
                                            className="space-y-3"
                                            onDragOver={onDragOver}
                                            onDragLeave={onDragLeave}
                                            onDrop={onDrop}
                                        >
                                            {/* Header de archivos seleccionados */}
                                            <div className={`flex justify-between items-center px-4 py-2.5 rounded-2xl border transition-all ${
                                                isDragging ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100' : 'bg-gray-50/80 border-gray-100'
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-lg">
                                                        {newRequestFiles.length} / {MAX_FILES}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-600">
                                                        Comprobantes ({ (newRequestFiles.reduce((sum, item) => sum + item.file.size, 0) / (1024 * 1024)).toFixed(2) } MB)
                                                    </span>
                                                </div>
                                                {newRequestFiles.length < MAX_FILES && !uploading && (
                                                    <label className="text-[11px] font-black text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                                                        <Icon name="PlusCircle" size={14}/> Agregar más
                                                        <input 
                                                            type="file" 
                                                            className="hidden" 
                                                            multiple 
                                                            onChange={onFileSelection} 
                                                            accept="image/jpeg,image/png,image/webp,application/pdf"
                                                        />
                                                    </label>
                                                )}
                                            </div>

                                            {/* Lista scrolleable de comprobantes con zoom preview */}
                                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                {newRequestFiles.map((item, index) => (
                                                    <div 
                                                        key={item.id} 
                                                        className="flex items-center justify-between p-2.5 bg-white border border-gray-100 rounded-2xl shadow-sm hover:border-blue-100 transition-all group"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                                                            {/* Thumbnail / Icono con botón de zoom */}
                                                            <div className="relative group/thumb shrink-0">
                                                                {item.isPdf ? (
                                                                    <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex flex-col items-center justify-center font-black text-[9px] border border-red-100">
                                                                        <Icon name="FileText" size={16}/>
                                                                        <span>PDF</span>
                                                                    </div>
                                                                ) : (
                                                                    <div 
                                                                        onClick={() => setPreviewItem(item)} 
                                                                        className="cursor-pointer relative overflow-hidden rounded-xl"
                                                                        title="Ver imagen ampliada"
                                                                    >
                                                                        <img 
                                                                            src={getSafePreviewUrl(item.previewUrl)} 
                                                                            alt={item.name} 
                                                                            className="w-11 h-11 rounded-xl object-cover border border-gray-100 bg-gray-50 group-hover/thumb:scale-105 transition-transform"
                                                                        />
                                                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                            <Icon name="Maximize2" size={14}/>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-gray-800 truncate" title={item.name}>
                                                                    {index + 1}. {item.name}
                                                                </p>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[10px] font-bold text-gray-400">
                                                                        {item.sizeFormatted}
                                                                    </span>
                                                                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                                                        {item.isPdf ? 'PDF' : item.name.split('.').pop()?.toUpperCase() || 'IMG'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {!item.isPdf && (
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setPreviewItem(item)} 
                                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                                    title="Ver comprobante"
                                                                >
                                                                    <Icon name="Maximize2" size={16}/>
                                                                </button>
                                                            )}
                                                            {!uploading && (
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => onRemoveFile(item.id)} 
                                                                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                                    title="Eliminar archivo"
                                                                >
                                                                    <Icon name="Trash2" size={16}/>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Feedback de error de archivos */}
                                    {fileError && (
                                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-2xl flex items-start gap-2.5 text-amber-800 text-xs font-medium animate-fadeIn">
                                            <Icon name="AlertTriangle" size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                            <span>{fileError}</span>
                                        </div>
                                    )}

                                    {/* Progreso de subida en tiempo real */}
                                    {uploading && (
                                        <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-2xl space-y-2 animate-pulse">
                                            <div className="flex justify-between items-center text-xs font-bold text-blue-900">
                                                <span className="flex items-center gap-2">
                                                    <Icon name="Cpu" size={14} className="animate-spin text-blue-600"/>
                                                    Subiendo comprobante {uploadProgress.current} de {uploadProgress.total}...
                                                </span>
                                                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
                                            </div>
                                            <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                                                ></div>
                                            </div>
                                            <p className="text-[10px] text-blue-700 font-mono truncate">
                                                {uploadProgress.fileName}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Cliente (Receptor)</label>
                                        <input type="text" placeholder="Nombre completo / Razón Social" value={manualData.nombreCliente} onChange={e => setManualData({...manualData, nombreCliente: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"/>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">CUIT del Cliente</label>
                                        <input type="text" placeholder="00-00000000-0" value={manualData.cuitCliente} onChange={e => setManualData({...manualData, cuitCliente: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"/>
                                    </div>
                                    <div className="border-t border-gray-100/80 pt-4 mt-2 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-3.5 bg-blue-500 rounded-full"></div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Datos del Emisor (Pagador)</span>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Nombre / Razón Social del Emisor</label>
                                            <input type="text" placeholder="Consumidor Final" value={manualData.nombreEmisor} onChange={e => setManualData({...manualData, nombreEmisor: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"/>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">CUIT del Emisor</label>
                                            <input type="text" placeholder="00-00000000-0" value={manualData.cuitEmisor} onChange={e => setManualData({...manualData, cuitEmisor: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"/>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Fecha de Pago</label>
                                            <input type="date" value={manualData.fecha} onChange={e => setManualData({...manualData, fecha: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-bold text-gray-800"/>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Monto Total</label>
                                            <input type="number" placeholder="$ 0.00" value={manualData.monto} onChange={e => setManualData({...manualData, monto: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-black text-gray-900"/>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">
                                    {createMode === 'file' && newRequestFiles.length > 1
                                        ? `Nota adicional compartida (${newRequestFiles.length} comprobantes - Opcional)`
                                        : 'Nota adicional (Opcional)'}
                                </label>
                                <textarea 
                                    placeholder={createMode === 'file' && newRequestFiles.length > 1 
                                        ? "Esta nota se guardará en todas las solicitudes del lote..." 
                                        : "¿Algún detalle que debamos saber?"} 
                                    value={newRequestNote} 
                                    onChange={e => setNewRequestNote(e.target.value)} 
                                    disabled={uploading}
                                    className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-medium text-gray-700 min-h-[80px] resize-none disabled:opacity-50"
                                ></textarea>
                            </div>

                            <div className="flex gap-4 pt-2">
                                <button 
                                    type="button" 
                                    onClick={onClose} 
                                    disabled={uploading}
                                    className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-2xl transition-all disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={uploading || (createMode === 'file' && newRequestFiles.length === 0)} 
                                    className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {uploading 
                                        ? `Procesando (${uploadProgress.current}/${uploadProgress.total})...` 
                                        : createMode === 'file' && newRequestFiles.length > 1
                                            ? `Guardar ${newRequestFiles.length} Solicitudes`
                                            : 'Guardar Solicitud'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Lightbox / Modal de Vista Previa Ampliada */}
            {previewItem && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[120] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[32px] overflow-hidden max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h4 className="text-sm font-black text-gray-900 truncate max-w-md">{previewItem.name}</h4>
                                <p className="text-[10px] font-bold text-gray-400">{previewItem.sizeFormatted}</p>
                            </div>
                            <button 
                                onClick={() => setPreviewItem(null)} 
                                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                            >
                                <Icon name="X" size={20}/>
                            </button>
                        </div>
                        <div className="p-6 flex items-center justify-center overflow-auto bg-gray-950/5">
                            {previewItem.isPdf ? (
                                <div className="p-12 text-center">
                                    <Icon name="FileText" size={64} className="text-red-500 mx-auto mb-4"/>
                                    <p className="font-bold text-gray-800 text-sm">Archivo PDF seleccionado</p>
                                    <p className="text-xs text-gray-400 mt-1">{previewItem.name}</p>
                                </div>
                            ) : (
                                <img 
                                    src={getSafePreviewUrl(previewItem.previewUrl)} 
                                    alt={previewItem.name} 
                                    className="max-h-[65vh] w-auto object-contain rounded-2xl shadow-md"
                                />
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
                            <button 
                                onClick={() => setPreviewItem(null)} 
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-black transition-all"
                            >
                                Cerrar Vista Previa
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CreateBillingRequestModal;
