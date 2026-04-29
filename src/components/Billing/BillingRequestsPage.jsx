import React, { useState, useEffect, useMemo } from 'react';
import { db, storage } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const BillingRequestsPage = () => {
    const { user, userData } = useAuth();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [filterStatus, setFilterStatus] = useState('pending'); 
    const [expandedRowId, setExpandedRowId] = useState(null); 
    const [selectedClient, setSelectedClient] = useState('todos');

    const currentYear = new Date().getFullYear();
    const availableYears = [currentYear, currentYear - 1, currentYear - 2];

    const [createMode, setCreateMode] = useState('file'); 
    const [manualData, setManualData] = useState({
        monto: '', 
        fecha: new Date().toISOString().split('T')[0], 
        concepto: 'Pago en Efectivo', 
        nombreCliente: '', 
        cuitCliente: '' 
    });

    const [newRequestFile, setNewRequestFile] = useState(null);
    const [newRequestNote, setNewRequestNote] = useState('');
    const [uploading, setUploading] = useState(false);
    const [isZipping, setIsZipping] = useState(false);

    const [completingId, setCompletingId] = useState(null);
    const [invoiceFile, setInvoiceFile] = useState(null);
    const [requestToDelete, setRequestToDelete] = useState(null);
    const [editingRequest, setEditingRequest] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    // 1. Security check
    if (!loading && !userData?.isAdmin && !userData?.servicioFacturacion) {
        return (
            <div className="p-12 text-center animate-fade-in">
                <Icon name="ShieldAlert" className="w-20 h-20 text-red-100 mx-auto mb-6" />
                <h2 className="text-3xl font-black text-gray-800">Acceso Restringido</h2>
                <p className="text-gray-500 mt-2">No tienes activo el servicio de facturación.</p>
            </div>
        );
    }

    // 2. Data Fetching
    useEffect(() => {
        if (!user) return;
        setLoading(true);
        let q;
        if (userData?.isAdmin) {
            q = query(collection(db, 'billing_requests'), orderBy('timestamp', 'desc'));
        } else {
            q = query(collection(db, 'billing_requests'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
        }
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(docs);
            setLoading(false);
            setError(null);
        }, (error) => {
            console.error("Error fetching billing requests:", error);
            setError("Error al sincronizar con el servidor.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, userData]);

    // 3. Complex Filtering & Dictionaries
    const visibleRequests = useMemo(() => {
        // Ordenamos por status en memoria para el Admin (Pendientes arriba)
        let data = [...requests];
        if (userData?.isAdmin) {
            data.sort((a, b) => {
                if (a.status === 'completed' && b.status !== 'completed') return 1;
                if (a.status !== 'completed' && b.status === 'completed') return -1;
                return 0;
            });
        }
        return data;
    }, [requests, userData]);

    const clientDictionary = useMemo(() => {
        const dict = {}; 
        visibleRequests.forEach(req => {
            const rawCuit = req.aiData?.cuit_receptor || '';
            const cuit = rawCuit.replace(/\D/g, ''); 
            const name = req.aiData?.nombre_receptor || 'Desconocido';
            if (cuit && cuit.length > 5) {
                if (!dict[cuit] || name.length > dict[cuit].length) {
                    dict[cuit] = name;
                }
            }
        });
        return dict;
    }, [visibleRequests]);

    const clientPhoneDictionary = useMemo(() => {
        const dict = {}; 
        visibleRequests.forEach(req => {
            const rawCuit = req.aiData?.cuit_receptor || '';
            const cuit = rawCuit.replace(/\D/g, ''); 
            if (cuit && cuit.length > 5 && req.userPhone) {
                if (!dict[cuit]) {
                    dict[cuit] = req.userPhone;
                }
            }
        });
        return dict;
    }, [visibleRequests]);

    const getUnifiedName = (req) => {
        const rawCuit = req.aiData?.cuit_receptor || '';
        const cuit = rawCuit.replace(/\D/g, '');
        const originalName = req.aiData?.nombre_receptor || req.manualData?.nombreCliente || 'Desconocido';
        if (cuit && clientDictionary[cuit]) return clientDictionary[cuit];
        return originalName;
    };

    const uniqueClients = useMemo(() => {
        const names = new Set();
        visibleRequests.forEach(req => {
            const unifiedName = getUnifiedName(req);
            if (unifiedName && unifiedName !== 'Carga Manual' && unifiedName !== 'Desconocido') {
                names.add(unifiedName);
            }
        });
        return Array.from(names).sort();
    }, [visibleRequests, clientDictionary]);

    const filteredRequests = useMemo(() => {
        let data = visibleRequests;
        if (selectedClient !== 'todos') {
            data = data.filter(req => getUnifiedName(req) === selectedClient);
        }

        if (filterStatus === 'completed') {
            return data.filter(r => r.status === 'completed').slice(0, 30);
        } else {
            return data.filter(r => r.status !== 'completed');
        }
    }, [visibleRequests, selectedClient, filterStatus, clientDictionary]);

    const metrics = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        let baseData = visibleRequests;
        if (selectedClient !== 'todos') {
            baseData = baseData.filter(req => getUnifiedName(req) === selectedClient);
        }
        const reqs = baseData.filter(req => req.timestamp && req.timestamp.toDate().getMonth() === currentMonth && req.timestamp.toDate().getFullYear() === currentYear);
        return {
            totalFacturado: reqs.filter(r => r.status === 'completed').reduce((sum, r) => sum + (r.aiData?.monto_total || 0), 0),
            totalPendiente: reqs.filter(r => r.status !== 'completed' && r.status !== 'duplicate').reduce((sum, r) => sum + (r.aiData?.monto_total || 0), 0)
        };
    }, [visibleRequests, selectedClient, clientDictionary]);

    // 4. Backup ZIP Logic
    const downloadYearlyBackup = async (year) => {
        const confirmMessage = selectedClient === 'todos' 
            ? `¿Descargar respaldo GLOBAL del año ${year}?`
            : `¿Descargar respaldo ${year} de ${selectedClient}?`;

        if (!window.confirm(confirmMessage)) return;

        setIsZipping(true);
        try {
            const zip = new JSZip();
            const folderName = selectedClient === 'todos' ? `Respaldo_${year}` : `Respaldo_${year}_${selectedClient.replace(/[^a-z0-9]/gi, '_')}`;
            const rootFolder = zip.folder(folderName);
            
            let sourceData = visibleRequests;
            if (selectedClient !== 'todos') {
                sourceData = sourceData.filter(req => getUnifiedName(req) === selectedClient);
            }

            const targetRequests = sourceData.filter(req => req.timestamp && req.timestamp.toDate().getFullYear() === parseInt(year));

            if (targetRequests.length === 0) throw new Error("No hay datos para descargar con este filtro.");

            const promises = targetRequests.map(async (req) => {
                const date = req.timestamp.toDate();
                const monthName = `${String(date.getMonth() + 1).padStart(2, '0')}_${date.toLocaleString('es-AR', { month: 'long' })}`;
                const folder = rootFolder.folder(monthName);
                
                const clientName = getUnifiedName(req);
                const safeName = clientName.replace(/[^a-z0-9]/gi, '_').substring(0, 20);
                const baseName = `${date.toISOString().split('T')[0]}_$${Math.round(req.aiData?.monto_total||0)}_${safeName}`;

                let addedSomething = false;

                if (req.requestImageUrl) {
                    try {
                        const res = await fetch(req.requestImageUrl);
                        const blob = await res.blob();
                        let ext = "jpg"; 
                        if (req.requestImageUrl.includes('.png')) ext = "png";
                        else if (req.requestImageUrl.includes('.pdf')) ext = "pdf";
                        else if (req.requestImageUrl.includes('.jpeg')) ext = "jpeg";

                        folder.file(`${baseName}_ORIGEN.${ext}`, blob);
                        addedSomething = true;
                    } catch (e) { folder.file(`${baseName}_ORIGEN_ERROR.txt`, "Error: " + e.message); }
                }

                if (req.invoiceUrl) {
                    try {
                        const res = await fetch(req.invoiceUrl);
                        const blob = await res.blob();
                        folder.file(`${baseName}_FACTURA.pdf`, blob);
                        addedSomething = true;
                    } catch (e) { folder.file(`${baseName}_FACTURA_ERROR.txt`, "Error: " + e.message); }
                }

                if (!addedSomething) {
                    folder.file(`${baseName}_MANUAL.txt`, `REGISTRO MANUAL\nCliente: ${clientName}\nCUIT: ${req.aiData?.cuit_receptor}\nMonto: ${req.aiData?.monto_total}`);
                }
            });
            
            await Promise.all(promises);
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${folderName}.zip`);
        } catch (e) { alert(e.message); } finally { setIsZipping(false); }
    };

    // 5. Actions
    const handleCreateRequest = async (e) => {
        e.preventDefault();
        if (!user) return;
        if (createMode === 'file' && !newRequestFile) return alert("Falta archivo");
        if (createMode === 'manual' && (!manualData.monto || !manualData.nombreCliente)) return alert("Faltan datos");

        setUploading(true);
        try {
            let url = null;
            let finalAiData = null;

            if (createMode === 'file') {
                const fileRef = ref(storage, `billing_requests/${user.uid}/${Date.now()}_${newRequestFile.name}`);
                await uploadBytes(fileRef, newRequestFile);
                url = await getDownloadURL(fileRef);
            } else {
                finalAiData = {
                    monto_total: parseFloat(manualData.monto),
                    fecha_pago: manualData.fecha,
                    tipo_comprobante: 'Efectivo/Manual',
                    concepto_detectado: manualData.concepto,
                    nombre_emisor: userData.nombre || user.email, 
                    nombre_receptor: manualData.nombreCliente,
                    cuit_receptor: manualData.cuitCliente || '', 
                    banco_origen: 'Efectivo/Caja'
                };
            }

            const modo = userData?.isAdmin ? 'estudio' : (userData.modoFacturacion || 'estudio');

            await addDoc(collection(db, 'billing_requests'), {
                userId: user.uid, 
                userName: userData.nombre || user.email, 
                userPhone: userData.telefono || "",
                userModoFacturacion: modo, 
                status: 'pending', 
                requestImageUrl: url, 
                aiData: finalAiData,
                note: newRequestNote, 
                timestamp: Timestamp.now(), 
                invoiceUrl: null, 
                isManualEntry: createMode === 'manual'
            });

            setShowModal(false); 
            setNewRequestFile(null); 
            setNewRequestNote('');
            setManualData({ monto: '', fecha: new Date().toISOString().split('T')[0], concepto: 'Pago en Efectivo', nombreCliente: '', cuitCliente: '' });
            setCreateMode('file');
        } catch (e) { 
            console.error(e);
            alert("Error al crear la solicitud"); 
        } finally { 
            setUploading(false); 
        }
    };

    const handleCompleteRequest = async (id) => { 
        if (!invoiceFile || !id) return; 
        setUploading(true); 
        try { 
            const req = requests.find(r => r.id === id); 
            const fileRef = ref(storage, `billing_invoices/${req.userId}/${Date.now()}_${invoiceFile.name}`); 
            await uploadBytes(fileRef, invoiceFile); 
            const url = await getDownloadURL(fileRef); 
            await updateDoc(doc(db, 'billing_requests', id), { 
                status: 'completed', 
                invoiceUrl: url, 
                completedAt: Timestamp.now() 
            }); 
            setCompletingId(null); 
            setInvoiceFile(null); 
        } catch (e) {
            alert("Error al subir la factura");
        } finally { 
            setUploading(false); 
        } 
    };

    const openEditModal = (req) => {
        if (req.status === 'pending' && !req.aiData && !req.isManualEntry) {
            return alert("⏳ Por favor, espere a que la IA termine de analizar el comprobante.");
        }

        const rawCuit = req.aiData?.cuit_receptor || '';
        const cuit = rawCuit.replace(/\D/g, '');
        const phoneFromHistory = clientPhoneDictionary[cuit] || '';
        const phoneToShow = req.userPhone || phoneFromHistory || '';

        setEditFormData({
            fecha_pago: req.aiData?.fecha_pago || '',
            hora_pago: req.aiData?.hora_pago || '', 
            monto_total: req.aiData?.monto_total || 0,
            tipo_comprobante: req.aiData?.tipo_comprobante || '',
            numero_operacion: req.aiData?.numero_operacion || '', 
            cuit_emisor: req.aiData?.cuit_emisor || '',
            nombre_emisor: req.aiData?.nombre_emisor || '',
            banco_origen: req.aiData?.banco_origen || '',
            cuit_receptor: req.aiData?.cuit_receptor || '',
            nombre_receptor: req.aiData?.nombre_receptor || '',
            banco_receptor: req.aiData?.banco_receptor || '',
            userPhone: phoneToShow, 
            concepto_detectado: req.aiData?.concepto_detectado || ''
        });
        setEditingRequest(req);
    };

    const handleSaveEdits = async (e) => { 
        e.preventDefault(); 
        if (!editingRequest) return; 
        try { 
            const { userPhone, ...aiDataFields } = editFormData;
            await updateDoc(doc(db, 'billing_requests', editingRequest.id), { 
                aiData: { ...aiDataFields, monto_total: parseFloat(editFormData.monto_total) },
                userPhone: userPhone 
            }); 
            setEditingRequest(null); 
        } catch (e) { alert("Error al guardar"); } 
    };

    const handleDeleteRequest = async () => { 
        if(requestToDelete) { 
            try {
                await deleteDoc(doc(db, 'billing_requests', requestToDelete)); 
            } catch (error) {
                console.error("Error deleting request:", error);
            } finally {
                setRequestToDelete(null); 
            }
        } 
    };

    const markAsDone = async (reqId) => { 
        if(!confirm("¿Confirmar facturación sin comprobante PDF?")) return; 
        try { 
            await updateDoc(doc(db, 'billing_requests', reqId), { 
                status: 'completed', 
                completedAt: Timestamp.now() 
            }); 
        } catch(e) {} 
    };

    const toggleDetails = (id) => setExpandedRowId(expandedRowId === id ? null : id);

    const sendWhatsAppNotification = (req) => {
        if (!req.invoiceUrl) return;
        let phone = req.userPhone;
        if (!phone) phone = prompt("Ingresa el número de celular del cliente (ej: 549381...):");
        if (!phone) return;

        const nombreCliente = getUnifiedName(req);
        const monto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(req.aiData?.monto_total || 0);
        const fecha = req.aiData?.fecha_pago || 'la fecha';
        
        const mensaje = `Hola *${nombreCliente}*! 👋\n\n` +
                        `Te envío la factura correspondiente al pago de *${monto}* realizado el día ${fecha}.\n\n` +
                        `📎 *Podés descargarla desde este link:*\n` +
                        `${req.invoiceUrl}`; 

        const urlWhatsApp = `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`;
        window.open(urlWhatsApp, '_blank');
    };

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">
                        {userData?.isAdmin ? 'Centro de Facturación' : 'Mis Facturaciones'}
                    </h2>
                    <p className="text-gray-500 mt-1 font-medium">Gestión de comprobantes y solicitudes de facturas.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                        <Icon name="Filter" className="w-4 h-4 text-gray-400 ml-2"/>
                        <select 
                            value={selectedClient} 
                            onChange={(e) => setSelectedClient(e.target.value)} 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 outline-none pr-8 cursor-pointer"
                        >
                            <option value="todos">Todos los Clientes</option>
                            {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={() => setShowModal(true)} 
                        className="bg-blue-600 text-white px-6 py-3 rounded-2xl hover:bg-blue-700 flex items-center font-bold shadow-lg shadow-blue-100 transition-all transform active:scale-95"
                    >
                        <Icon name="PlusCircle" className="w-5 h-5 mr-2"/> Nueva Solicitud
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 border border-red-100 p-6 rounded-[32px] flex items-center gap-4 animate-pulse">
                    <Icon name="AlertTriangle" className="w-8 h-8 text-red-500" />
                    <div>
                        <h4 className="font-black text-red-800 text-sm">Error de Sincronización</h4>
                        <p className="text-red-600 text-xs font-medium">{error}</p>
                    </div>
                </div>
            )}

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 flex items-center gap-6 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 text-green-50/50 group-hover:scale-110 transition-transform">
                        <Icon name="CheckCircle" size={120} />
                    </div>
                    <div className="bg-green-100 p-4 rounded-2xl text-green-600 relative z-10">
                        <Icon name="TrendingUp" size={32} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Facturado (Mes)</p>
                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">{formatCurrency(metrics.totalFacturado)}</h3>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 flex items-center gap-6 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 text-yellow-50/50 group-hover:scale-110 transition-transform">
                        <Icon name="Clock" size={120} />
                    </div>
                    <div className="bg-yellow-100 p-4 rounded-2xl text-yellow-600 relative z-10">
                        <Icon name="History" size={32} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pendiente (Mes)</p>
                        <h3 className="text-3xl font-black text-gray-900 tracking-tight">{formatCurrency(metrics.totalPendiente)}</h3>
                    </div>
                </div>
            </div>

            {/* Backup Action Bar */}
            <div className="bg-indigo-600 p-6 rounded-[32px] shadow-xl shadow-indigo-100 flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative">
                <div className="absolute left-0 top-0 w-full h-full opacity-10 pointer-events-none">
                    <div className="absolute top-0 right-0 p-4 transform translate-x-1/2 -translate-y-1/2">
                        <Icon name="Archive" size={200} />
                    </div>
                </div>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="bg-white/20 p-3 rounded-2xl text-white backdrop-blur-md">
                        <Icon name="FolderArchive" size={28}/>
                    </div>
                    <div>
                        <h4 className="font-black text-white text-lg leading-none">Respaldo Legal Anual</h4>
                        <p className="text-indigo-100 text-xs font-bold mt-1 uppercase tracking-widest">Descarga todos los comprobantes y facturas en un solo ZIP.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
                    <select id="y_select" className="flex-1 md:flex-none bg-white/10 border-2 border-white/20 rounded-xl px-4 py-2.5 text-white font-bold outline-none backdrop-blur-md appearance-none cursor-pointer hover:bg-white/20 transition-all">
                        {availableYears.map(year => <option key={year} value={year} className="text-gray-800">{year}</option>)}
                    </select>
                    <button 
                        onClick={() => downloadYearlyBackup(document.getElementById('y_select').value)} 
                        disabled={isZipping} 
                        className="bg-white text-indigo-600 px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-50 transition-all shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                    >
                        {isZipping ? 'Procesando...' : 'Generar ZIP'}
                    </button>
                </div>
            </div>

            {/* Main Table Tabs */}
            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex border-b border-gray-50 bg-gray-50/30 p-2">
                    <button 
                        onClick={() => setFilterStatus('pending')} 
                        className={`flex-1 py-4 px-6 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${filterStatus === 'pending' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Pendientes ({visibleRequests.filter(r => r.status !== 'completed').length})
                    </button>
                    <button 
                        onClick={() => setFilterStatus('completed')} 
                        className={`flex-1 py-4 px-6 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all ${filterStatus === 'completed' ? 'bg-white shadow-sm text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                        Historial (Últimas 30)
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente / Receptor</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Detección IA</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto Total</th>
                                <th className="px-8 py-5"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="5" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando solicitudes...</td></tr>
                            ) : filteredRequests.length === 0 ? (
                                <tr><td colSpan="5" className="text-center py-24 text-gray-400 font-bold italic">No se encontraron registros con este filtro.</td></tr>
                            ) : filteredRequests.map(req => (
                                <React.Fragment key={req.id}>
                                    <tr 
                                        className={`hover:bg-blue-50/50 cursor-pointer transition-all ${expandedRowId === req.id ? 'bg-blue-50/50' : ''}`} 
                                        onClick={() => toggleDetails(req.id)}
                                    >
                                        <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500">
                                            {req.status === 'pending' && !req.aiData && !req.isManualEntry ? (
                                                <div className="h-4 bg-gray-100 rounded-lg w-20 animate-pulse"></div>
                                            ) : (
                                                req.timestamp?.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                            )}
                                        </td>
                                        <td className="px-8 py-6">
                                            {req.status === 'pending' && !req.aiData && !req.isManualEntry ? (
                                                <div className="space-y-2">
                                                    <div className="h-4 bg-blue-50 rounded-lg w-32 animate-pulse"></div>
                                                    <div className="h-3 bg-gray-50 rounded-lg w-24 animate-pulse"></div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="text-sm font-black text-gray-900 leading-tight">{getUnifiedName(req)}</div>
                                                    <div className="text-[10px] text-gray-400 font-black uppercase tracking-tighter mt-0.5">{req.aiData?.cuit_receptor || req.manualData?.cuitCliente || 'Sin CUIT'}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-8 py-6">
                                            {req.status === 'pending' && !req.aiData && !req.isManualEntry ? (
                                                <div className="flex items-center gap-3 text-blue-600 animate-pulse">
                                                    <div className="p-1.5 bg-blue-100 rounded-lg">
                                                        <Icon name="Cpu" className="w-4 h-4 animate-spin" />
                                                    </div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest">IA Analizando...</span>
                                                </div>
                                            ) : (
                                                <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                    {req.isManualEntry ? 'Manual' : (req.aiData?.banco_origen || 'Extraído')}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            {req.status === 'pending' && !req.aiData && !req.isManualEntry ? (
                                                <div className="h-5 bg-green-50 rounded-lg w-24 ml-auto animate-pulse"></div>
                                            ) : req.status === 'duplicate' ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600 border border-red-100 uppercase tracking-widest">
                                                    <Icon name="AlertTriangle" className="w-3 h-3 mr-1"/> Duplicado
                                                </span>
                                            ) : (
                                                <div className="text-lg font-black text-gray-900 tracking-tight">
                                                    {formatCurrency(req.aiData?.monto_total || req.manualData?.monto || 0)}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <Icon name={expandedRowId === req.id ? 'ChevronUp' : 'ChevronDown'} className="w-5 h-5 text-gray-300"/>
                                        </td>
                                    </tr>
                                    
                                    {/* Expanded Detail View */}
                                    {expandedRowId === req.id && (
                                        <tr className="bg-gray-50/50">
                                            <td colSpan="5" className="p-0 border-b border-gray-100">
                                                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
                                                    {/* Data Card */}
                                                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex justify-between items-center mb-8">
                                                                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Detalle Técnico Extraído</h4>
                                                                <button 
                                                                    onClick={() => openEditModal(req)} 
                                                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${req.status === 'pending' && !req.aiData && !req.isManualEntry ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                                                                >
                                                                    <Icon name="Edit" size={14}/> {req.status === 'pending' && !req.aiData && !req.isManualEntry ? 'Procesando...' : 'Corregir'}
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-6 mb-8">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fecha de Pago</p>
                                                                    <p className="font-bold text-gray-800">{req.aiData?.fecha_pago || 'S/D'}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Tipo Comprobante</p>
                                                                    <p className="font-bold text-gray-800">{req.aiData?.tipo_comprobante || 'S/D'}</p>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-4 mb-8">
                                                                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Icon name="ArrowUpRight" size={12}/> Emisor Original</p>
                                                                    <div className="flex justify-between items-end">
                                                                        <div>
                                                                            <p className="font-black text-gray-800 text-sm leading-tight">{req.aiData?.nombre_emisor || 'Desconocido'}</p>
                                                                            <p className="text-[10px] font-bold text-gray-400 font-mono mt-1">{req.aiData?.cuit_emisor || 'S/D'}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase">Origen</p>
                                                                            <p className="text-xs font-bold text-gray-700">{req.aiData?.banco_origen || '-'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-100">
                                                                    <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 flex items-center gap-2"><Icon name="ArrowDownLeft" size={12}/> Receptor (Cliente)</p>
                                                                    <div className="flex justify-between items-end">
                                                                        <div>
                                                                            <p className="font-black text-white text-sm leading-tight">{req.aiData?.nombre_receptor || 'Desconocido'}</p>
                                                                            <p className="text-[10px] font-bold text-blue-200 font-mono mt-1">{req.aiData?.cuit_receptor || 'S/D'}</p>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <p className="text-[9px] font-black text-blue-200 uppercase">Destino</p>
                                                                            <p className="text-xs font-bold text-white">{req.aiData?.banco_receptor || '-'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-black text-gray-400 uppercase">Concepto / Referencia</p>
                                                                <p className="text-sm font-medium text-gray-600 italic">"{req.aiData?.concepto_detectado || 'Sin descripción'}"</p>
                                                            </div>
                                                        </div>
                                                        
                                                        {req.requestImageUrl && (
                                                            <div className="mt-8 pt-6 border-t border-gray-50 flex justify-center">
                                                                <a href={req.requestImageUrl} target="_blank" className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:gap-4 transition-all">
                                                                    Ver Comprobante Original <Icon name="ArrowRight" size={12}/>
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Management Card */}
                                                    <div className="bg-gray-100 p-8 rounded-[32px] border border-gray-200 flex flex-col justify-between">
                                                        <div className="space-y-8">
                                                            <div className="flex justify-between items-center">
                                                                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Acciones de Gestión</h4>
                                                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${req.status === 'completed' ? 'bg-green-600 text-white' : 'bg-yellow-400 text-yellow-900'}`}>
                                                                    {req.status === 'completed' ? 'Finalizado' : 'Pendiente'}
                                                                </span>
                                                            </div>

                                                            {req.status !== 'completed' ? (
                                                                (req.userModoFacturacion === 'estudio' && !userData?.isAdmin) ? (
                                                                    <div className="bg-white p-8 rounded-2xl text-center shadow-sm border border-gray-200">
                                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                                                                        <p className="text-gray-500 font-bold">Nuestro estudio está procesando tu solicitud...</p>
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-6">
                                                                        <div className="space-y-3">
                                                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Subir Factura Final (PDF)</label>
                                                                            <div className="flex gap-3">
                                                                                <label className="flex-1 cursor-pointer">
                                                                                    <div className="w-full bg-white px-4 py-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 flex items-center justify-between truncate hover:border-blue-200 transition-all">
                                                                                        <span className="truncate">{invoiceFile ? invoiceFile.name : 'Seleccionar Archivo'}</span>
                                                                                        <Icon name="FileText" size={16}/>
                                                                                    </div>
                                                                                    <input type="file" className="hidden" onChange={(e) => setInvoiceFile(e.target.files[0])} accept=".pdf"/>
                                                                                </label>
                                                                                <button 
                                                                                    onClick={() => handleCompleteRequest(req.id)} 
                                                                                    disabled={uploading || !invoiceFile}
                                                                                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50"
                                                                                >
                                                                                    {uploading ? '...' : 'Subir'}
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="relative">
                                                                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                                                            <div className="relative flex justify-center text-[10px] font-black uppercase text-gray-400"><span className="bg-gray-100 px-3">O también</span></div>
                                                                        </div>
                                                                        <button 
                                                                            onClick={() => markAsDone(req.id)} 
                                                                            className="w-full bg-white text-gray-700 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm border border-gray-200"
                                                                        >
                                                                            Marcar sin Comprobante
                                                                        </button>
                                                                    </div>
                                                                )
                                                            ) : (
                                                                <div className="bg-white p-8 rounded-[24px] text-center shadow-sm border border-gray-200 space-y-6">
                                                                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto">
                                                                        <Icon name="Check" size={32} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-xl font-black text-gray-900 leading-tight">Facturación Exitosa</p>
                                                                        <p className="text-xs text-gray-500 font-medium mt-2">La operación ha sido procesada y archivada.</p>
                                                                    </div>
                                                                    {req.invoiceUrl && (
                                                                        <a href={req.invoiceUrl} target="_blank" className="flex items-center justify-center gap-3 w-full bg-blue-50 text-blue-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-100 transition-all">
                                                                            <Icon name="DownloadCloud" size={18}/> Descargar Comprobante PDF
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-3 mt-8">
                                                            {req.invoiceUrl && (
                                                                <button 
                                                                    onClick={() => sendWhatsAppNotification(req)} 
                                                                    className="w-full bg-green-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-3"
                                                                >
                                                                    <Icon name="MessageCircle" size={18}/> Notificar por WhatsApp
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => setRequestToDelete(req.id)} 
                                                                className="w-full text-red-400 hover:text-red-600 text-[10px] font-black uppercase tracking-widest pt-2 transition-colors flex items-center justify-center gap-2"
                                                            >
                                                                <Icon name="Trash2" size={14}/> Eliminar este Registro
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {requestToDelete && (
                <ConfirmModal 
                    message="¿Estás seguro de que quieres eliminar esta solicitud? Esta acción no se puede deshacer." 
                    confirmText="Eliminar permanentemente" 
                    isDestructive={true} 
                    onConfirm={handleDeleteRequest} 
                    onCancel={() => setRequestToDelete(null)} 
                />
            )}
            
            {/* Modal de Creación */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-10 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Nueva Solicitud</h3>
                                <p className="text-gray-500 text-sm font-medium mt-1">Sube un comprobante o registra un pago manual.</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all">
                                <Icon name="X" size={24}/>
                            </button>
                        </div>

                        <div className="flex bg-gray-50 p-1.5 rounded-2xl mb-8 border border-gray-100">
                            <button 
                                onClick={() => setCreateMode('file')} 
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${createMode === 'file' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}
                            >
                                Adjuntar Archivo
                            </button>
                            <button 
                                onClick={() => setCreateMode('manual')} 
                                className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${createMode === 'manual' ? 'bg-white shadow-md text-blue-600' : 'text-gray-400'}`}
                            >
                                Carga Manual
                            </button>
                        </div>

                        <form onSubmit={handleCreateRequest} className="space-y-6">
                            {createMode === 'file' ? (
                                <div className="space-y-4">
                                    <label className="group block">
                                        <div className="border-4 border-dashed border-gray-100 rounded-[32px] p-12 text-center group-hover:border-blue-100 group-hover:bg-blue-50/30 transition-all cursor-pointer">
                                            <div className="bg-blue-50 w-16 h-16 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-4 group-hover:scale-110 transition-transform">
                                                <Icon name="Search" size={32}/>
                                            </div>
                                            <p className="text-sm font-black text-gray-800">{newRequestFile ? newRequestFile.name : 'Subir Comprobante'}</p>
                                            <p className="text-xs text-gray-400 font-bold mt-2 uppercase tracking-widest">{newRequestFile ? 'Archivo seleccionado' : 'Imagen o PDF'}</p>
                                        </div>
                                        <input type="file" className="hidden" onChange={(e) => setNewRequestFile(e.target.files[0])} accept="image/*,application/pdf"/>
                                    </label>
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
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Nota adicional (Opcional)</label>
                                <textarea placeholder="¿Algún detalle que debamos saber?" value={newRequestNote} onChange={e => setNewRequestNote(e.target.value)} className="w-full px-5 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl transition-all outline-none font-medium text-gray-700 min-h-[100px] resize-none"></textarea>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-2xl transition-all">Cancelar</button>
                                <button 
                                    type="submit" 
                                    disabled={uploading} 
                                    className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-50"
                                >
                                    {uploading ? 'Procesando...' : 'Guardar Solicitud'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Edición Completo */}
            {editingRequest && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[48px] shadow-2xl max-w-3xl w-full p-12 animate-in fade-in zoom-in-95 duration-500 overflow-y-auto max-h-[90vh]">
                        <div className="flex justify-between items-start mb-10">
                            <div>
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight">Corregir Datos Detectados</h3>
                                <p className="text-gray-500 text-sm font-medium mt-1 uppercase tracking-widest">Ajusta la información extraída por la IA para asegurar precisión.</p>
                            </div>
                            <button onClick={() => setEditingRequest(null)} className="p-3 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-2xl transition-all">
                                <Icon name="X" size={28}/>
                            </button>
                        </div>
                        
                        <form onSubmit={handleSaveEdits} className="space-y-10">
                            {/* Operation Details Section */}
                            <section>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-1.5 h-6 bg-yellow-400 rounded-full"></div>
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Información General</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-yellow-50/50 p-8 rounded-[32px] border border-yellow-100">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Fecha</label>
                                        <input type="date" value={editFormData.fecha_pago} onChange={e => setEditFormData({...editFormData, fecha_pago: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
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
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-[10px] font-black text-yellow-700 uppercase tracking-widest px-1">Número de Operación</label>
                                        <input type="text" value={editFormData.numero_operacion} onChange={e => setEditFormData({...editFormData, numero_operacion: e.target.value})} className="w-full p-3 bg-white border-transparent focus:ring-2 focus:ring-yellow-200 rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm" placeholder="ID de transacción / Referencia"/>
                                    </div>
                                </div>
                            </section>

                            {/* Parties Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-1.5 h-6 bg-gray-400 rounded-full"></div>
                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Emisor (Origen)</h4>
                                    </div>
                                    <div className="bg-gray-50 p-8 rounded-[32px] border border-gray-100 space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-500 uppercase px-1">Nombre / Razón Social</label>
                                            <input value={editFormData.nombre_emisor} onChange={e => setEditFormData({...editFormData, nombre_emisor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase px-1">CUIT</label>
                                                <input value={editFormData.cuit_emisor} onChange={e => setEditFormData({...editFormData, cuit_emisor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-gray-500 uppercase px-1">Banco / Billetera</label>
                                                <input value={editFormData.banco_origen} onChange={e => setEditFormData({...editFormData, banco_origen: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-800 shadow-sm"/>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-1.5 h-6 bg-blue-500 rounded-full"></div>
                                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Receptor (Cliente)</h4>
                                    </div>
                                    <div className="bg-blue-50/50 p-8 rounded-[32px] border border-blue-100 space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-blue-600 uppercase px-1">Nombre / Razón Social</label>
                                            <input value={editFormData.nombre_receptor} onChange={e => setEditFormData({...editFormData, nombre_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-blue-600 uppercase px-1">WhatsApp Notificación</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">📱</span>
                                                <input type="tel" placeholder="549..." value={editFormData.userPhone} onChange={e => setEditFormData({...editFormData, userPhone: e.target.value})} className="w-full pl-12 pr-4 py-3 bg-white border-2 border-blue-100 focus:border-blue-300 rounded-xl transition-all outline-none font-black text-blue-800 shadow-sm"/>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-blue-600 uppercase px-1">CUIT</label>
                                                <input value={editFormData.cuit_receptor} onChange={e => setEditFormData({...editFormData, cuit_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black text-blue-600 uppercase px-1">Banco / Billetera</label>
                                                <input value={editFormData.banco_receptor} onChange={e => setEditFormData({...editFormData, banco_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <section>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Concepto Detectado / Detalle Adicional</label>
                                    <textarea rows="3" value={editFormData.concepto_detectado} onChange={e => setEditFormData({...editFormData, concepto_detectado: e.target.value})} className="w-full px-6 py-4 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-[24px] transition-all outline-none font-medium text-gray-700 resize-none shadow-inner"></textarea>
                                </div>
                            </section>

                            <div className="flex gap-6 pt-6 border-t border-gray-100">
                                <button type="button" onClick={() => setEditingRequest(null)} className="flex-1 py-5 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-2xl transition-all">Descartar Cambios</button>
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
            )}
        </div>
    );
};

export default BillingRequestsPage;
