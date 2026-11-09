import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../../firebase';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import Icon from '../../Common/Icon';
import {
    TIPOS_DOCUMENTO,
    MOTIVOS_PAGO,
    CLAUSULAS_CHEQUE,
    ECHEQ_FIELD_DEFINITIONS,
    isoToDdMmYyyy,
    ddMmYyyyToIso,
    formatMontoConComa,
    parseMontoNumerico,
    sanitizeNroDocumento,
    validateEcheqRow,
    exportEcheqPlantillaExcel,
    parseEcheqExcelOrCsvFile
} from '../../../utils/echeqExcel';

const createEmptyEmisionRow = () => ({
    tipoDocumento: 'CUIT',
    nroDocumento: '',
    monto: '',
    fechaPago: new Date().toISOString().split('T')[0],
    motivoPago: 'Varios',
    referenciaPago: '',
    valorReferenciaPago: '',
    mail: '',
    clausula: 'A la orden',
    // Campos complementarios de gestión interna
    terceroId: '',
    terceroNombre: '',
    numeroCheque: '',
    entidadOrigen: '',
    impactarOperaciones: false
});

const CargaChequesModal = ({
    isOpen,
    onClose,
    targetUid,
    terceros = [],
    initialCheque = null,
    onSuccess
}) => {
    const fileInputRef = useRef(null);
    const [modalTab, setModalTab] = useState('emision'); // 'emision' | 'recibido'
    const [showInstructions, setShowInstructions] = useState(false);
    const [formData, setFormData] = useState(createEmptyEmisionRow());
    const [batchRows, setBatchRows] = useState([]);
    const [touched, setTouched] = useState({});
    const [submitError, setSubmitError] = useState('');
    const [importFeedback, setImportFeedback] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // Estado para cheque recibido (Cartera)
    const [recibidoData, setRecibidoData] = useState({
        terceroId: '',
        terceroNombre: '',
        tipoDocumento: 'CUIT',
        nroDocumento: '',
        numero: '',
        entidad: '',
        fechaRecepcion: new Date().toISOString().split('T')[0],
        fechaVencimiento: new Date().toISOString().split('T')[0],
        monto: '',
        clausula: 'A la orden',
        motivoPago: 'Varios',
        referenciaPago: '',
        impactarOperaciones: false
    });

    useEffect(() => {
        if (isOpen) {
            if (initialCheque) {
                setFormData({
                    tipoDocumento: initialCheque.tipoDocumento || 'CUIT',
                    nroDocumento: sanitizeNroDocumento(initialCheque.nroDocumento || ''),
                    monto: formatMontoConComa(initialCheque.monto || ''),
                    fechaPago: initialCheque.fechaVencimiento?.toDate
                        ? initialCheque.fechaVencimiento.toDate().toISOString().split('T')[0]
                        : ddMmYyyyToIso(initialCheque.fechaPagoStr || '') || new Date().toISOString().split('T')[0],
                    motivoPago: initialCheque.motivoPago || 'Varios',
                    referenciaPago: initialCheque.referenciaPago || '',
                    valorReferenciaPago: initialCheque.valorReferenciaPago || '',
                    mail: initialCheque.mail || '',
                    clausula: initialCheque.clausula || 'A la orden',
                    terceroId: initialCheque.terceroId || '',
                    terceroNombre: initialCheque.terceroNombre || '',
                    numeroCheque: initialCheque.numero || '',
                    entidadOrigen: initialCheque.banco || '',
                    impactarOperaciones: false
                });
            } else {
                setFormData(createEmptyEmisionRow());
            }
            setBatchRows([]);
            setTouched({});
            setSubmitError('');
            setImportFeedback(null);
            setIsSaving(false);
        }
    }, [isOpen, initialCheque]);

    const validation = useMemo(() => validateEcheqRow(formData), [formData]);

    const handleSelectTerceroEmision = (e) => {
        const selectedId = e.target.value;
        if (!selectedId) {
            setFormData(prev => ({ ...prev, terceroId: '', terceroNombre: '' }));
            return;
        }
        const found = terceros.find(t => t.id === selectedId);
        if (found) {
            const cleanDoc = sanitizeNroDocumento(found.cuit || '');
            setFormData(prev => ({
                ...prev,
                terceroId: found.id,
                terceroNombre: found.nombre || '',
                nroDocumento: cleanDoc || prev.nroDocumento,
                mail: (found.email || prev.mail || '').slice(0, 150)
            }));
            setTouched(prev => ({ ...prev, nroDocumento: true }));
        }
    };

    const handleFieldChange = (field, value) => {
        setSubmitError('');
        setTouched(prev => ({ ...prev, [field]: true }));

        if (field === 'nroDocumento') {
            const cleaned = sanitizeNroDocumento(value);
            // Si coincide con algún tercero por CUIT, sugerir nombre automáticamente si está vacío
            const matchedTercero = cleaned.length === 11
                ? terceros.find(t => sanitizeNroDocumento(t.cuit) === cleaned)
                : null;
            setFormData(prev => ({
                ...prev,
                nroDocumento: cleaned,
                terceroId: matchedTercero ? matchedTercero.id : prev.terceroId,
                terceroNombre: matchedTercero && !prev.terceroNombre ? matchedTercero.nombre : prev.terceroNombre,
                mail: matchedTercero && !prev.mail && matchedTercero.email ? matchedTercero.email : prev.mail
            }));
            return;
        }

        if (field === 'monto') {
            // Permitir números, una coma o un punto decimal, máximo 18 caracteres
            const sanitized = String(value).replace(/[^0-9.,]/g, '').slice(0, 18);
            setFormData(prev => ({ ...prev, monto: sanitized }));
            return;
        }

        if (field === 'referenciaPago') {
            setFormData(prev => ({ ...prev, referenciaPago: String(value).slice(0, 100) }));
            setTouched(prev => ({ ...prev, referenciaPago: true, valorReferenciaPago: true }));
            return;
        }

        if (field === 'valorReferenciaPago') {
            setFormData(prev => ({ ...prev, valorReferenciaPago: String(value).slice(0, 50) }));
            setTouched(prev => ({ ...prev, referenciaPago: true, valorReferenciaPago: true }));
            return;
        }

        if (field === 'mail') {
            setFormData(prev => ({ ...prev, mail: String(value).slice(0, 150) }));
            return;
        }

        if (field === 'motivoPago') {
            setFormData(prev => ({ ...prev, motivoPago: String(value).slice(0, 100) }));
            return;
        }

        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAddCurrentToBatch = () => {
        setTouched({
            tipoDocumento: true,
            nroDocumento: true,
            monto: true,
            fechaPago: true,
            motivoPago: true,
            referenciaPago: true,
            valorReferenciaPago: true,
            mail: true,
            clausula: true
        });

        if (!validation.isValid) {
            setSubmitError('Revisa los campos marcados en rojo antes de agregar el cheque a la plantilla.');
            return;
        }

        const normalizedRow = {
            ...formData,
            id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            tipoDocumento: formData.tipoDocumento.toUpperCase(),
            nroDocumento: sanitizeNroDocumento(formData.nroDocumento),
            monto: formatMontoConComa(formData.monto),
            montoNumerico: parseMontoNumerico(formData.monto),
            fechaPago: formData.fechaPago,
            fechaPagoStr: isoToDdMmYyyy(formData.fechaPago),
            terceroNombre: formData.terceroNombre.trim() || `Doc. ${sanitizeNroDocumento(formData.nroDocumento)}`
        };

        setBatchRows(prev => [...prev, normalizedRow]);
        setFormData(prev => ({
            ...createEmptyEmisionRow(),
            fechaPago: prev.fechaPago,
            entidadOrigen: prev.entidadOrigen,
            clausula: prev.clausula
        }));
        setTouched({});
        setSubmitError('');
    };

    const handleRemoveBatchRow = (rowId) => {
        setBatchRows(prev => prev.filter(r => r.id !== rowId));
    };

    const handleImportFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSubmitError('');
        setImportFeedback(null);

        try {
            const parsedRows = await parseEcheqExcelOrCsvFile(file);
            if (!parsedRows || parsedRows.length === 0) {
                setSubmitError('No se encontraron filas con datos en la hoja "Plantilla para emisión".');
                return;
            }

            let validCount = 0;
            let invalidCount = 0;
            const enriched = parsedRows.map((r, idx) => {
                const cleanDoc = sanitizeNroDocumento(r.nroDocumento);
                const matchedTercero = cleanDoc.length === 11
                    ? terceros.find(t => sanitizeNroDocumento(t.cuit) === cleanDoc)
                    : null;

                const candidate = {
                    ...createEmptyEmisionRow(),
                    ...r,
                    id: `imp_${Date.now()}_${idx}`,
                    nroDocumento: cleanDoc,
                    monto: formatMontoConComa(r.monto),
                    montoNumerico: parseMontoNumerico(r.monto),
                    fechaPago: ddMmYyyyToIso(r.fechaPago) || new Date().toISOString().split('T')[0],
                    fechaPagoStr: isoToDdMmYyyy(r.fechaPago),
                    terceroId: matchedTercero?.id || '',
                    terceroNombre: matchedTercero?.nombre || `Doc. ${cleanDoc || 'S/D'}`
                };
                const v = validateEcheqRow(candidate);
                if (v.isValid) validCount++;
                else invalidCount++;
                return { ...candidate, _validation: v };
            });

            setBatchRows(prev => [...prev, ...enriched]);
            setImportFeedback({
                total: enriched.length,
                validCount,
                invalidCount,
                fileName: file.name
            });
        } catch (err) {
            console.error('Error al leer archivo Excel/CSV:', err);
            setSubmitError('No se pudo leer el archivo. Asegúrate de que sea un archivo .xlsx o .csv válido.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const getEffectiveEmisionRows = () => {
        if (batchRows.length > 0) {
            // Si además hay un cheque válido cargado en el formulario actual, lo incluimos si el usuario quiere o solo el lote
            if (formData.nroDocumento && formData.monto && validation.isValid) {
                return [
                    ...batchRows,
                    {
                        ...formData,
                        tipoDocumento: formData.tipoDocumento.toUpperCase(),
                        nroDocumento: sanitizeNroDocumento(formData.nroDocumento),
                        monto: formatMontoConComa(formData.monto),
                        montoNumerico: parseMontoNumerico(formData.monto),
                        fechaPagoStr: isoToDdMmYyyy(formData.fechaPago),
                        terceroNombre: formData.terceroNombre.trim() || `Doc. ${sanitizeNroDocumento(formData.nroDocumento)}`
                    }
                ];
            }
            return batchRows;
        }

        // Si no hay filas en lote, validar el formulario individual
        return null;
    };

    const handleSaveEmision = async (alsoDownloadExcel = false) => {
        if (!targetUid || isSaving) return;
        setSubmitError('');

        let rowsToSave = getEffectiveEmisionRows();
        if (!rowsToSave) {
            setTouched({
                tipoDocumento: true,
                nroDocumento: true,
                monto: true,
                fechaPago: true,
                motivoPago: true,
                referenciaPago: true,
                valorReferenciaPago: true,
                mail: true,
                clausula: true
            });
            if (!validation.isValid) {
                setSubmitError('Completa correctamente los campos obligatorios según las instrucciones de emisión.');
                return;
            }
            rowsToSave = [{
                ...formData,
                tipoDocumento: formData.tipoDocumento.toUpperCase(),
                nroDocumento: sanitizeNroDocumento(formData.nroDocumento),
                monto: formatMontoConComa(formData.monto),
                montoNumerico: parseMontoNumerico(formData.monto),
                fechaPagoStr: isoToDdMmYyyy(formData.fechaPago),
                terceroNombre: formData.terceroNombre.trim() || `Doc. ${sanitizeNroDocumento(formData.nroDocumento)}`
            }];
        }

        // Verificar que todas las filas a guardar sean válidas
        const firstInvalid = rowsToSave.find(r => !validateEcheqRow(r).isValid);
        if (firstInvalid) {
            const errs = Object.values(validateEcheqRow(firstInvalid).errors).join(' ');
            setSubmitError(`Hay filas con errores de formato (${firstInvalid.nroDocumento || 'Sin documento'}): ${errs}`);
            return;
        }

        setIsSaving(true);
        try {
            const nowTs = Timestamp.fromDate(new Date());

            for (const r of rowsToSave) {
                const isoDate = ddMmYyyyToIso(r.fechaPago) || r.fechaPago;
                const vencDate = new Date(`${isoDate}T00:00:00-03:00`);
                const vencTimestamp = isNaN(vencDate.getTime()) ? nowTs : Timestamp.fromDate(vencDate);
                const montoNum = parseMontoNumerico(r.monto);

                const chequeDoc = {
                    terceroId: r.terceroId || null,
                    terceroNombre: r.terceroNombre?.trim() || `Doc. ${sanitizeNroDocumento(r.nroDocumento)}`,
                    tipo: 'emitido',
                    estado: 'Emitido',
                    formato: 'eCheq',
                    numero: r.numeroCheque?.trim() || 'eCheq',
                    banco: r.entidadOrigen?.trim() || 'Emisión Electrónica',
                    fechaEmision: nowTs,
                    fechaVencimiento: vencTimestamp,
                    monto: montoNum,
                    // Las 9 columnas oficiales de la plantilla de emisión
                    tipoDocumento: r.tipoDocumento.toUpperCase(),
                    nroDocumento: sanitizeNroDocumento(r.nroDocumento),
                    montoTextoComa: formatMontoConComa(r.monto),
                    fechaPagoStr: isoToDdMmYyyy(r.fechaPago),
                    motivoPago: r.motivoPago.trim(),
                    referenciaPago: (r.referenciaPago || '').trim(),
                    valorReferenciaPago: (r.valorReferenciaPago || '').trim(),
                    mail: (r.mail || '').trim(),
                    clausula: r.clausula
                };

                const chequeRef = await addDoc(collection(db, 'users', targetUid, 'cheques'), chequeDoc);

                // Si seleccionó un Tercero y marcó impactar en Cuenta Corriente / Operaciones
                if (r.impactarOperaciones && r.terceroId) {
                    const pagoData = {
                        terceroId: r.terceroId,
                        fechaPago: nowTs,
                        montoPagado: montoNum,
                        medioDePago: 'Cheque',
                        referencia: `${r.motivoPago}${r.referenciaPago ? ` - ${r.referenciaPago}: ${r.valorReferenciaPago}` : ''}`,
                        chequeId: chequeRef.id
                    };
                    await addDoc(collection(db, 'users', targetUid, 'pagosRealizados'), pagoData);
                }
            }

            if (alsoDownloadExcel) {
                await exportEcheqPlantillaExcel(rowsToSave);
            }

            if (onSuccess) {
                onSuccess(
                    alsoDownloadExcel
                        ? `${rowsToSave.length} cheque(s) registrado(s) y plantilla Excel descargada`
                        : `${rowsToSave.length} cheque(s) registrado(s) en Gestión de Valores`
                );
            }
            onClose();
        } catch (err) {
            console.error('Error al guardar cheques emitidos:', err);
            setSubmitError('Ocurrió un error al guardar los cheques en la base de datos.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadTemplateOnly = async () => {
        const rows = getEffectiveEmisionRows() || (validation.isValid ? [formData] : []);
        await exportEcheqPlantillaExcel(rows);
    };

    const handleSaveRecibido = async (e) => {
        e.preventDefault();
        if (!targetUid || isSaving) return;
        setSubmitError('');

        const montoNum = parseMontoNumerico(recibidoData.monto);
        if (montoNum <= 0) {
            setSubmitError('El monto del cheque recibido debe ser mayor a 0.');
            return;
        }
        if (!recibidoData.terceroNombre.trim()) {
            setSubmitError('Indique el nombre del emisor o cliente.');
            return;
        }
        if (!recibidoData.fechaVencimiento) {
            setSubmitError('Indique la fecha de pago / vencimiento del cheque.');
            return;
        }

        setIsSaving(true);
        try {
            const recepDate = new Date(`${recibidoData.fechaRecepcion}T00:00:00-03:00`);
            const vencDate = new Date(`${recibidoData.fechaVencimiento}T00:00:00-03:00`);

            await addDoc(collection(db, 'users', targetUid, 'cheques'), {
                terceroId: recibidoData.terceroId || null,
                terceroNombre: recibidoData.terceroNombre.trim(),
                tipo: 'recibido',
                estado: 'En Cartera',
                numero: recibidoData.numero.trim() || 'S/N',
                banco: recibidoData.entidad.trim() || 'Cheque de Tercero',
                fechaRecepcion: Timestamp.fromDate(recepDate),
                fechaVencimiento: Timestamp.fromDate(vencDate),
                monto: montoNum,
                tipoDocumento: recibidoData.tipoDocumento || 'CUIT',
                nroDocumento: sanitizeNroDocumento(recibidoData.nroDocumento),
                montoTextoComa: formatMontoConComa(montoNum),
                fechaPagoStr: isoToDdMmYyyy(recibidoData.fechaVencimiento),
                motivoPago: recibidoData.motivoPago || 'Varios',
                referenciaPago: recibidoData.referenciaPago || '',
                clausula: recibidoData.clausula || 'A la orden'
            });

            if (onSuccess) {
                onSuccess('Cheque recibido agregado a Cartera Activa');
            }
            onClose();
        } catch (err) {
            console.error('Error al guardar cheque recibido:', err);
            setSubmitError('Ocurrió un error al registrar el cheque en cartera.');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    const hasCrossRefRequirement = Boolean(
        formData.referenciaPago.trim() || formData.valorReferenciaPago.trim()
    );

    const totalBatchMonto = batchRows.reduce((acc, r) => acc + (parseMontoNumerico(r.monto) || 0), 0);

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-3xl sm:rounded-[36px] shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
                {/* HEADER */}
                <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-start sm:items-center justify-between gap-4 bg-slate-50/70">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                            <Icon name="Landmark" size={24} />
                        </div>
                        <div>
                            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                Carga y Emisión de Cheques
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-500 font-medium">
                                Completa los campos reglamentarios para emisión de cheques electrónicos o registra valores en cartera.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 text-slate-400 hover:text-slate-700 bg-white hover:bg-slate-100 rounded-2xl border border-slate-200/80 transition-all cursor-pointer"
                    >
                        <Icon name="X" size={20} />
                    </button>
                </div>

                {/* SELECTOR DE MODO */}
                <div className="px-6 sm:px-8 pt-4 pb-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                    <div className="flex gap-1.5 p-1 bg-slate-100 rounded-2xl">
                        <button
                            type="button"
                            onClick={() => { setModalTab('emision'); setSubmitError(''); }}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                                modalTab === 'emision'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Icon name="FileSpreadsheet" size={15} />
                            Emisión de Cheques Electrónicos
                        </button>
                        <button
                            type="button"
                            onClick={() => { setModalTab('recibido'); setSubmitError(''); }}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                                modalTab === 'recibido'
                                    ? 'bg-white text-emerald-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800'
                            }`}
                        >
                            <Icon name="ArrowDownLeft" size={15} />
                            Cheque Recibido (En Cartera)
                        </button>
                    </div>

                    {modalTab === 'emision' && (
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowInstructions(prev => !prev)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                                    showInstructions
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                }`}
                            >
                                <Icon name="HelpCircle" size={15} />
                                {showInstructions ? 'Ocultar Instrucciones de Plantilla' : 'Ver Instrucciones de Plantilla (9 Columnas)'}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.csv"
                                onChange={handleImportFile}
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all cursor-pointer flex items-center gap-1.5"
                                title="Importar desde archivo Excel (.xlsx) o CSV con formato Plantilla para emisión"
                            >
                                <Icon name="Upload" size={15} />
                                Importar Excel (.xlsx)
                            </button>

                            <button
                                type="button"
                                onClick={handleDownloadTemplateOnly}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all cursor-pointer flex items-center gap-1.5"
                                title="Descargar archivo Excel con las 2 pestañas: Ayuda y Plantilla para emisión"
                            >
                                <Icon name="Download" size={15} />
                                Descargar Plantilla (.xlsx)
                            </button>
                        </div>
                    )}
                </div>

                {/* CONTENIDO SCROLLABLE */}
                <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
                    {modalTab === 'emision' ? (
                        <>
                            {/* PANEL DESPLEGABLE DE INSTRUCCIONES OFICIALES (HOJA 1: AYUDA) */}
                            {showInstructions && (
                                <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-5 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/70 pb-3">
                                        <div>
                                            <h4 className="text-sm font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
                                                <Icon name="Info" size={16} />
                                                Ayuda: Plantilla de Excel para emisión de cheques electrónicos
                                            </h4>
                                            <p className="text-xs text-amber-800 font-medium mt-1">
                                                1. Completar los espacios según las siguientes definiciones • 2. Guardar o exportar la hoja &quot;Plantilla para emisión&quot; al momento de emitir.
                                            </p>
                                        </div>
                                        <span className="text-[11px] font-bold bg-white text-amber-800 px-3 py-1 rounded-full border border-amber-200 self-start">
                                            AN = Alfanumérico | N = Numérico
                                        </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="border-b border-amber-200 text-[10px] font-black uppercase tracking-wider text-amber-900">
                                                    <th className="py-2 pr-3">Campo</th>
                                                    <th className="py-2 px-3">Definición (Def_Campo)</th>
                                                    <th className="py-2 px-3 text-center">Longitud</th>
                                                    <th className="py-2 px-3 text-center">Tipo</th>
                                                    <th className="py-2 px-3">Observaciones</th>
                                                    <th className="py-2 pl-3">Ejemplo de Carga</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-200/50 text-slate-700 font-medium">
                                                {ECHEQ_FIELD_DEFINITIONS.map(def => (
                                                    <tr key={def.campo} className="hover:bg-amber-100/40">
                                                        <td className="py-2 pr-3 font-mono font-bold text-indigo-700">{def.campo}</td>
                                                        <td className="py-2 px-3 font-bold text-slate-900">
                                                            {def.defCampo}
                                                            {def.obligatorio && <span className="text-rose-500 ml-1">*</span>}
                                                        </td>
                                                        <td className="py-2 px-3 text-center font-mono font-bold">{def.longitud}</td>
                                                        <td className="py-2 px-3 text-center">
                                                            <span className="px-2 py-0.5 rounded bg-white border border-amber-200 font-mono text-[10px] font-bold">
                                                                {def.tipo}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 text-slate-600">{def.observaciones}</td>
                                                        <td className="py-2 pl-3 font-mono font-bold text-emerald-700">
                                                            {def.ejemplo || <span className="text-slate-400 italic">(Vacío)</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* FEEDBACK DE IMPORTACIÓN EXCEL */}
                            {importFeedback && (
                                <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <Icon name="CheckCircle2" size={20} className="text-indigo-600 shrink-0" />
                                        <div className="text-xs font-bold text-indigo-900">
                                            Archivo <span className="underline">{importFeedback.fileName}</span> procesado: se cargaron{' '}
                                            <strong>{importFeedback.total}</strong> fila(s) en la tabla inferior ({importFeedback.validCount} válidas
                                            {importFeedback.invalidCount > 0 ? `, ${importFeedback.invalidCount} con observaciones` : ''}).
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setImportFeedback(null)}
                                        className="text-indigo-500 hover:text-indigo-800 p-1 cursor-pointer"
                                    >
                                        <Icon name="X" size={16} />
                                    </button>
                                </div>
                            )}

                            {/* AUTOCOMPLETADO RÁPIDO DESDE TERCEROS / PROVEEDORES */}
                            <div className="p-4 sm:p-5 rounded-3xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                        Autocompletar desde Tercero Registrado (Opcional)
                                    </label>
                                    <select
                                        value={formData.terceroId}
                                        onChange={handleSelectTerceroEmision}
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200 cursor-pointer"
                                    >
                                        <option value="">-- Seleccionar Proveedor / Tercero o cargar manual --</option>
                                        {terceros.map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.nombre} {t.cuit ? `(CUIT: ${sanitizeNroDocumento(t.cuit)})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                        Nombre / Razón Social del Beneficiario
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.terceroNombre}
                                        onChange={e => handleFieldChange('terceroNombre', e.target.value)}
                                        placeholder="Ej: Proveedor S.A. (para control interno)"
                                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                            N° / ID Cheque (Opc.)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.numeroCheque}
                                            onChange={e => handleFieldChange('numeroCheque', e.target.value)}
                                            placeholder="Ej: 00012345"
                                            className="w-full px-3.5 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                                            Cuenta / Origen (Opc.)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.entidadOrigen}
                                            onChange={e => handleFieldChange('entidadOrigen', e.target.value)}
                                            placeholder="Ej: Cta. Cte. Principal"
                                            className="w-full px-3.5 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN PRINCIPAL: LOS 9 ESPACIOS REGLAMENTARIOS DE LA PLANTILLA */}
                            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 space-y-5 shadow-xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono text-xs font-black">
                                            COL_1 a COL_9
                                        </span>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                                            Datos de la &quot;Plantilla para emisión&quot;
                                        </h4>
                                    </div>
                                    <span className="text-[11px] text-slate-400 font-bold">
                                        Los campos con <span className="text-rose-500">*</span> son obligatorios
                                    </span>
                                </div>

                                {/* FILA 1: COL_1, COL_2, COL_3, COL_4 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* COL_1: Tipo de documento */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_1</span>
                                                Tipo de documento <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">Máx 4 | AN</span>
                                        </div>
                                        <select
                                            value={formData.tipoDocumento}
                                            onChange={e => handleFieldChange('tipoDocumento', e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                                        >
                                            {TIPOS_DOCUMENTO.map(td => (
                                                <option key={td} value={td}>{td}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400 font-medium">Valores: CUIT, CUIL o CDI</p>
                                    </div>

                                    {/* COL_2: Nro. de documento */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_2</span>
                                                Nro. de documento <span className="text-rose-500">*</span>
                                            </label>
                                            <span className={`text-[9px] font-mono font-bold ${formData.nroDocumento.length === 11 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                {formData.nroDocumento.length}/11 | N
                                            </span>
                                        </div>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={formData.nroDocumento}
                                            onChange={e => handleFieldChange('nroDocumento', e.target.value)}
                                            placeholder="30398521151"
                                            maxLength={11}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-mono font-black outline-none transition-all ${
                                                touched.nroDocumento && validation.errors.nroDocumento
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        {touched.nroDocumento && validation.errors.nroDocumento ? (
                                            <p className="text-[10px] text-rose-600 font-bold">{validation.errors.nroDocumento}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-medium">Sin puntos, comas, ni guiones (11 dígitos)</p>
                                        )}
                                    </div>

                                    {/* COL_3: Monto */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_3</span>
                                                Monto <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">Máx 18 | N</span>
                                        </div>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={formData.monto}
                                            onChange={e => handleFieldChange('monto', e.target.value)}
                                            placeholder="1300,3"
                                            maxLength={18}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-black outline-none transition-all ${
                                                touched.monto && validation.errors.monto
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-emerald-700 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        {touched.monto && validation.errors.monto ? (
                                            <p className="text-[10px] text-rose-600 font-bold">{validation.errors.monto}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                Decimales con coma (,). Formato en plantilla:{' '}
                                                <strong className="font-mono text-slate-700">{formatMontoConComa(formData.monto) || '1300,3'}</strong>
                                            </p>
                                        )}
                                    </div>

                                    {/* COL_4: Fecha de pago */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_4</span>
                                                Fecha de pago <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">10 | DD/MM/AAAA</span>
                                        </div>
                                        <input
                                            type="date"
                                            value={formData.fechaPago}
                                            onChange={e => handleFieldChange('fechaPago', e.target.value)}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all ${
                                                touched.fechaPago && validation.errors.fechaPago
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            Valor en plantilla:{' '}
                                            <strong className="font-mono text-slate-700">{isoToDdMmYyyy(formData.fechaPago) || 'DD/MM/AAAA'}</strong>
                                        </p>
                                    </div>
                                </div>

                                {/* FILA 2: COL_5, COL_6, COL_7 */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {/* COL_5: Motivo de pago */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_5</span>
                                                Motivo de pago <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">Máx 100 | AN</span>
                                        </div>
                                        <select
                                            value={formData.motivoPago}
                                            onChange={e => handleFieldChange('motivoPago', e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none cursor-pointer"
                                        >
                                            {MOTIVOS_PAGO.map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            Varios, Factura, Orden de pago, Alquiler, Expensas, Servicios
                                        </p>
                                    </div>

                                    {/* COL_6: Referencia pago */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_6</span>
                                                Referencia pago
                                                {formData.valorReferenciaPago.trim() && (
                                                    <span className="text-rose-500 ml-1" title="Obligatorio si completa Valor referencia pago">*</span>
                                                )}
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">{formData.referenciaPago.length}/100 | AN</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={formData.referenciaPago}
                                            onChange={e => handleFieldChange('referenciaPago', e.target.value)}
                                            placeholder="Ej: Factura A / Orden N° (Opcional)"
                                            maxLength={100}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all ${
                                                validation.errors.referenciaPago
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        {validation.errors.referenciaPago ? (
                                            <p className="text-[10px] text-rose-600 font-bold">{validation.errors.referenciaPago}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                Si completa Valor referencia pago, deberá llenar este campo.
                                            </p>
                                        )}
                                    </div>

                                    {/* COL_7: Valor referencia pago */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_7</span>
                                                Valor referencia pago
                                                {formData.referenciaPago.trim() && (
                                                    <span className="text-rose-500 ml-1" title="Obligatorio si completa Referencia pago">*</span>
                                                )}
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">{formData.valorReferenciaPago.length}/50 | AN</span>
                                        </div>
                                        <input
                                            type="text"
                                            value={formData.valorReferenciaPago}
                                            onChange={e => handleFieldChange('valorReferenciaPago', e.target.value)}
                                            placeholder="Ej: 0001-00004512 (Opcional)"
                                            maxLength={50}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all ${
                                                validation.errors.valorReferenciaPago
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        {validation.errors.valorReferenciaPago ? (
                                            <p className="text-[10px] text-rose-600 font-bold">{validation.errors.valorReferenciaPago}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                Si completa Referencia pago, deberá llenar este campo.
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* FILA 3: COL_8 y COL_9 */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {/* COL_8: Mail */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_8</span>
                                                Mail al beneficiario (Opcional)
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">{formData.mail.length}/150 | AN</span>
                                        </div>
                                        <input
                                            type="email"
                                            value={formData.mail}
                                            onChange={e => handleFieldChange('mail', e.target.value)}
                                            placeholder="ejemplo@gmail.com"
                                            maxLength={150}
                                            className={`w-full px-4 py-3 bg-slate-50 border rounded-2xl text-sm font-bold outline-none transition-all ${
                                                touched.mail && validation.errors.mail
                                                    ? 'border-rose-400 bg-rose-50/40 text-rose-900'
                                                    : 'border-slate-200 text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-200'
                                            }`}
                                        />
                                        {touched.mail && validation.errors.mail ? (
                                            <p className="text-[10px] text-rose-600 font-bold">{validation.errors.mail}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 font-medium">Notificación por correo al beneficiario (no obligatorio)</p>
                                        )}
                                    </div>

                                    {/* COL_9: Cláusula */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                                                <span className="text-indigo-600 font-mono mr-1">COL_9</span>
                                                Cláusula <span className="text-rose-500">*</span>
                                            </label>
                                            <span className="text-[9px] font-mono text-slate-400">Máx 13 | AN</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2.5">
                                            {CLAUSULAS_CHEQUE.map(c => {
                                                const active = formData.clausula === c.value;
                                                return (
                                                    <button
                                                        key={c.value}
                                                        type="button"
                                                        onClick={() => handleFieldChange('clausula', c.value)}
                                                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                                                            active
                                                                ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-100'
                                                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className={`text-xs font-black ${active ? 'text-indigo-900' : 'text-slate-700'}`}>
                                                                {c.label}
                                                            </span>
                                                            {active && <Icon name="CheckCircle2" size={14} className="text-indigo-600" />}
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight">
                                                            {c.description}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* BARRA INFERIOR DEL FORMULARIO: VINCULACIÓN Y AGREGAR AL LOTE */}
                                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                                    {formData.terceroId ? (
                                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={formData.impactarOperaciones}
                                                onChange={e => handleFieldChange('impactarOperaciones', e.target.checked)}
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs font-bold text-slate-700">
                                                Registrar también como Pago Realizado en la Cuenta Corriente de <strong>{formData.terceroNombre}</strong>
                                            </span>
                                        </label>
                                    ) : (
                                        <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                                            <Icon name="Info" size={14} />
                                            Puedes guardar este cheque directo o agregar varios a la plantilla de emisión.
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleAddCurrentToBatch}
                                        className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 shadow-sm"
                                    >
                                        <Icon name="PlusCircle" size={16} />
                                        Agregar a la Lista de Emisión
                                    </button>
                                </div>
                            </div>

                            {/* VISTA PREVIA DE LA HOJA "PLANTILLA PARA EMISIÓN" (CUANDO HAY FILAS EN LOTE) */}
                            {batchRows.length > 0 && (
                                <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                                    <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5">
                                            <Icon name="Layers" size={18} className="text-indigo-600" />
                                            <h4 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                                                Hoja &quot;Plantilla para emisión&quot; ({batchRows.length} {batchRows.length === 1 ? 'cheque' : 'cheques'})
                                            </h4>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                                                Total Lote: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(totalBatchMonto)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setBatchRows([])}
                                                className="text-xs font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                                            >
                                                Vaciar lista
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                                            <thead className="bg-slate-50/60 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                                                <tr>
                                                    <th className="px-3 py-2.5 text-left">Tipo Doc</th>
                                                    <th className="px-3 py-2.5 text-left">Nro. Documento</th>
                                                    <th className="px-3 py-2.5 text-left">Beneficiario</th>
                                                    <th className="px-3 py-2.5 text-right">Monto (Coma)</th>
                                                    <th className="px-3 py-2.5 text-center">Fecha Pago</th>
                                                    <th className="px-3 py-2.5 text-left">Motivo</th>
                                                    <th className="px-3 py-2.5 text-left">Ref. / Valor</th>
                                                    <th className="px-3 py-2.5 text-left">Mail</th>
                                                    <th className="px-3 py-2.5 text-center">Cláusula</th>
                                                    <th className="px-3 py-2.5 text-center">Quitar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {batchRows.map(r => {
                                                    const rowVal = validateEcheqRow(r);
                                                    return (
                                                        <tr key={r.id} className={!rowVal.isValid ? 'bg-rose-50/60' : 'hover:bg-slate-50/60'}>
                                                            <td className="px-3 py-2.5 font-bold text-slate-800">{r.tipoDocumento}</td>
                                                            <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{r.nroDocumento}</td>
                                                            <td className="px-3 py-2.5 font-bold text-slate-700">{r.terceroNombre}</td>
                                                            <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-700">
                                                                {formatMontoConComa(r.monto)}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-700">
                                                                {isoToDdMmYyyy(r.fechaPago)}
                                                            </td>
                                                            <td className="px-3 py-2.5 font-semibold text-slate-700">{r.motivoPago}</td>
                                                            <td className="px-3 py-2.5 text-slate-500">
                                                                {r.referenciaPago ? `${r.referenciaPago}: ${r.valorReferenciaPago}` : '-'}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-slate-500 truncate max-w-[140px]">{r.mail || '-'}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">
                                                                    {r.clausula}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveBatchRow(r.id)}
                                                                    className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                                                >
                                                                    <Icon name="Trash2" size={14} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* PESTAÑA 2: CARGAR CHEQUE RECIBIDO (EN CARTERA) */
                        <form id="recibido-cheque-form" onSubmit={handleSaveRecibido} className="space-y-5">
                            <div className="bg-emerald-50/60 border border-emerald-200 rounded-3xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Seleccionar Cliente / Tercero (Opcional)
                                    </label>
                                    <select
                                        value={recibidoData.terceroId}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const found = terceros.find(t => t.id === id);
                                            setRecibidoData(prev => ({
                                                ...prev,
                                                terceroId: id,
                                                terceroNombre: found ? found.nombre : prev.terceroNombre,
                                                nroDocumento: found?.cuit ? sanitizeNroDocumento(found.cuit) : prev.nroDocumento
                                            }));
                                        }}
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    >
                                        <option value="">-- Cargar manualmente --</option>
                                        {terceros.map(t => (
                                            <option key={t.id} value={t.id}>{t.nombre}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Nombre del Librador / Cliente <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={recibidoData.terceroNombre}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, terceroNombre: e.target.value }))}
                                        placeholder="Nombre o Razón Social"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        CUIT del Librador (11 dígitos sin guiones)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={11}
                                        value={recibidoData.nroDocumento}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, nroDocumento: sanitizeNroDocumento(e.target.value) }))}
                                        placeholder="30123456789"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-mono font-bold text-slate-800 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Monto <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        required
                                        value={recibidoData.monto}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, monto: e.target.value.replace(/[^0-9.,]/g, '') }))}
                                        placeholder="150000,00"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-sm font-black text-emerald-700 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Fecha de Pago / Cobro <span className="text-rose-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={recibidoData.fechaVencimiento}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, fechaVencimiento: e.target.value }))}
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        N° de Cheque / eCheq
                                    </label>
                                    <input
                                        type="text"
                                        value={recibidoData.numero}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, numero: e.target.value }))}
                                        placeholder="00012345"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Entidad Emisora / Origen
                                    </label>
                                    <input
                                        type="text"
                                        value={recibidoData.entidad}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, entidad: e.target.value }))}
                                        placeholder="Entidad emisora del cheque"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Cláusula
                                    </label>
                                    <select
                                        value={recibidoData.clausula}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, clausula: e.target.value }))}
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    >
                                        {CLAUSULAS_CHEQUE.map(c => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">
                                        Motivo / Referencia
                                    </label>
                                    <input
                                        type="text"
                                        value={recibidoData.referenciaPago}
                                        onChange={e => setRecibidoData(prev => ({ ...prev, referenciaPago: e.target.value }))}
                                        placeholder="Factura / Concepto"
                                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-2xl text-xs font-bold text-slate-800 outline-none"
                                    />
                                </div>
                            </div>
                        </form>
                    )}

                    {submitError && (
                        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-xs font-bold text-rose-700">
                            <Icon name="AlertTriangle" size={18} className="shrink-0 text-rose-600" />
                            <span>{submitError}</span>
                        </div>
                    )}
                </div>

                {/* FOOTER DE ACCIONES */}
                <div className="px-6 sm:px-8 py-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
                    >
                        Cancelar
                    </button>

                    {modalTab === 'emision' ? (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSaveEmision(true)}
                                className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-100 disabled:opacity-50"
                            >
                                <Icon name="Download" size={16} />
                                {isSaving ? 'Procesando...' : 'Guardar y Descargar Excel (.xlsx)'}
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleSaveEmision(false)}
                                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
                            >
                                <Icon name="CheckCircle" size={16} />
                                {isSaving
                                    ? 'Guardando...'
                                    : batchRows.length > 0
                                    ? `Registrar Emisión (${batchRows.length + (formData.nroDocumento && formData.monto && validation.isValid ? 1 : 0)})`
                                    : 'Registrar Cheque Emitido'}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="submit"
                            form="recibido-cheque-form"
                            disabled={isSaving}
                            className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 disabled:opacity-50"
                        >
                            <Icon name="CheckCircle" size={16} />
                            {isSaving ? 'Guardando...' : 'Guardar Cheque en Cartera'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CargaChequesModal;

