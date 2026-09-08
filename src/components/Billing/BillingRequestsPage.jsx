import React, { useState, useEffect, useMemo } from 'react';
import { db, storage, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
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
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const WEBHOOK_URL = "https://us-central1-gyrconsultores-82422.cloudfunctions.net/whatsappWebhook";

/** Modal de configuración de conexión WhatsApp — componente separado para respetar reglas de hooks */
const WhatsAppConnectionModal = ({ onClose }) => {
    const [expandedOption, setExpandedOption] = useState(null);
    const [copied, setCopied] = useState(false);

    const copyWebhook = () => {
        navigator.clipboard.writeText(WEBHOOK_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const StepItem = ({ step, title, desc, extra, link, links, color = 'blue' }) => (
        <li className="flex gap-3 items-start">
            <span className={`shrink-0 w-6 h-6 rounded-full bg-${color}-600 text-white text-[10px] font-black flex items-center justify-center mt-0.5`}>{step}</span>
            <div className="space-y-1 flex-1">
                <p className="text-xs font-bold text-gray-800">{title}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
                {extra && (
                    <div className="mt-1 flex items-center gap-2">
                        <code className={`text-[10px] bg-white border border-${color}-200 text-${color}-700 px-2 py-1 rounded-lg font-mono break-all flex-1`}>{extra}</code>
                        <button onClick={copyWebhook} className={`shrink-0 text-${color}-600 hover:text-${color}-800 transition-colors`} title="Copiar URL">
                            <Icon name={copied ? "Check" : "Copy"} size={13}/>
                        </button>
                    </div>
                )}
                {link && (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[11px] text-${color}-600 font-bold hover:underline mt-0.5`}>
                        <Icon name="ExternalLink" size={12}/> {link.label}
                    </a>
                )}
                {links && (
                    <div className="flex gap-3 mt-1">
                        {links.map(l => (
                            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[11px] text-${color}-600 font-bold hover:underline`}>
                                <Icon name="ExternalLink" size={12}/> {l.label}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </li>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-xl w-full p-8 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                            <Icon name="MessageCircle" size={28}/>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900">Conexión de WhatsApp</h3>
                            <p className="text-xs text-gray-500 font-medium">Recepción y clasificación automática de comprobantes</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl">
                        <Icon name="X" size={20}/>
                    </button>
                </div>

                <div className="space-y-5">
                    {/* Cómo funciona */}
                    <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100 space-y-2">
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Icon name="CheckCircle" size={14}/> ¿Cómo funciona la vinculación?
                        </h4>
                        <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                            ¡Es 100% automática! Los comprobantes que llegan a tu número de WhatsApp Business son reenviados a nuestro Webhook. La IA detecta el emisor, receptor, monto y CUIT; si el remitente o el CUIT coincide con algún cliente del estudio, <strong>se asocia automáticamente</strong>.
                        </p>
                    </div>

                    {/* URL del Webhook */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block px-1">
                            URL de tu Webhook Cloud Functions (Listo para usar)
                        </label>
                        <div className="flex items-center gap-2">
                            <input type="text" readOnly value={WEBHOOK_URL}
                                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 select-all outline-none"
                            />
                            <button onClick={copyWebhook}
                                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${copied ? 'bg-emerald-500 text-white' : 'bg-gray-800 hover:bg-black text-white'}`}
                            >
                                <Icon name={copied ? "Check" : "Copy"} size={14}/>
                                {copied ? '¡Copiado!' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {/* Opciones como acordeones */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">
                            Elegí tu método de conexión
                        </h4>

                        {/* Opción 1 – Evolution API */}
                        <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                            expandedOption === 1 ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/20'
                        }`}>
                            <button onClick={() => setExpandedOption(expandedOption === 1 ? null : 1)}
                                className="w-full p-4 flex items-center gap-3 text-left">
                                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0"><Icon name="Smartphone" size={16}/></div>
                                <div className="flex-1">
                                    <p className="font-black text-gray-800 text-xs">Opción 1: Evolution API / Baileys</p>
                                    <p className="text-[11px] text-gray-500">Recomendada · Escaneo QR único, sin perder tu app</p>
                                </div>
                                <div className={`text-blue-500 transition-transform duration-200 ${expandedOption === 1 ? 'rotate-180' : ''}`}>
                                    <Icon name="ChevronDown" size={18}/>
                                </div>
                            </button>
                            {expandedOption === 1 && (
                                <div className="px-4 pb-5 space-y-4">
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Evolution API es un servidor que conecta tu WhatsApp Business a cualquier webhook. Se instala en un VPS propio o en la nube y solo necesitás escanear el QR una sola vez.
                                    </p>
                                    <ol className="space-y-3">
                                        <StepItem step={1} color="blue"
                                            title="Instalá Evolution API en tu servidor"
                                            desc="Necesitás un VPS (DigitalOcean, Hetzner, etc.) con Docker. Seguí la guía oficial:"
                                            link={{ label: "Ver documentación oficial de Evolution API →", url: "https://doc.evolution-api.com/v2/pt/get-started/introduction" }}
                                        />
                                        <StepItem step={2} color="blue"
                                            title="Creá una instancia de WhatsApp"
                                            desc="Desde el panel de Evolution API (o vía API REST), creás una nueva instancia, escaneás el QR con tu celular y tu número queda vinculado."
                                        />
                                        <StepItem step={3} color="blue"
                                            title="Configurá el Webhook en la instancia"
                                            desc="En la configuración de la instancia, ingresá esta URL en el campo Webhook URL y activá los eventos: MESSAGES_UPSERT y MESSAGES_UPDATE."
                                            extra={WEBHOOK_URL}
                                        />
                                        <StepItem step={4} color="blue"
                                            title="¡Listo! La conexión es automática"
                                            desc="Desde ese momento, cada foto o PDF que recibas en WhatsApp se procesará con la IA y aparecerá en esta bandeja."
                                        />
                                    </ol>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <p className="text-[11px] text-amber-800 font-medium">
                                            💡 <strong>Sin servidor propio:</strong> Podés usar{' '}
                                            <a href="https://app.evolution-api.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Evolution API Cloud</a>{' '}
                                            (versión gestionada) o un hosting con Docker preconfigurado.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Opción 2 – Make / n8n / Zapier */}
                        <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                            expandedOption === 2 ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50/20'
                        }`}>
                            <button onClick={() => setExpandedOption(expandedOption === 2 ? null : 2)}
                                className="w-full p-4 flex items-center gap-3 text-left">
                                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0"><Icon name="Layers" size={16}/></div>
                                <div className="flex-1">
                                    <p className="font-black text-gray-800 text-xs">Opción 2: Make / n8n / Zapier</p>
                                    <p className="text-[11px] text-gray-500">Sin servidor · Conectás tu WhatsApp vía automatización</p>
                                </div>
                                <div className={`text-indigo-500 transition-transform duration-200 ${expandedOption === 2 ? 'rotate-180' : ''}`}>
                                    <Icon name="ChevronDown" size={18}/>
                                </div>
                            </button>
                            {expandedOption === 2 && (
                                <div className="px-4 pb-5 space-y-4">
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Si ya tenés WhatsApp Business conectado a Make, n8n o Zapier, solo necesitás agregar un paso HTTP POST que reenvíe el mensaje a nuestro webhook.
                                    </p>
                                    <ol className="space-y-3">
                                        <StepItem step={1} color="indigo"
                                            title="Abrí tu plataforma de automatización"
                                            desc="Creá un nuevo Escenario (Make), Workflow (n8n) o Zap (Zapier) con el trigger: 'Mensaje entrante de WhatsApp'."
                                            links={[
                                                { label: "Ir a Make →", url: "https://www.make.com" },
                                                { label: "Ir a n8n →", url: "https://n8n.io" },
                                            ]}
                                        />
                                        <StepItem step={2} color="indigo"
                                            title="Agrega un módulo HTTP POST"
                                            desc="Añadí un paso 'HTTP Request' con método POST y la siguiente URL:"
                                            extra={WEBHOOK_URL}
                                        />
                                        <StepItem step={3} color="indigo"
                                            title="Mapeá el cuerpo del mensaje"
                                            desc="En el body, mapeá: número de teléfono del remitente (phone), texto del mensaje (body) y si hay adjunto, su URL (mediaUrl / fileUrl)."
                                        />
                                        <StepItem step={4} color="indigo"
                                            title="Activá y probá el flujo"
                                            desc="Enviá un comprobante de prueba. Debería aparecer en esta bandeja en segundos con la clasificación automática de la IA."
                                        />
                                    </ol>
                                </div>
                            )}
                        </div>
                    </div>

                    <button onClick={onClose}
                        className="w-full py-3.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

const MONTHS = [
    { value: 'todos', label: 'Todos los Meses' },
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
];

const BillingRequestsPage = ({ navigate }) => {
    const { user, userData } = useAuth();
    const { clients, selectClientById, setActiveEntity } = useClientSelection();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [filterStatus, setFilterStatus] = useState('pending'); 
    const [activeModule, setActiveModule] = useState('ventas'); // 'ventas' | 'compras_gastos' | 'summary' | 'unassigned'
    const [subFilterExpense, setSubFilterExpense] = useState('todos'); // 'todos' | 'compra' | 'gasto'
    const [filterType, setFilterType] = useState('todos'); // Para compatibilidad
    const [assigningRequest, setAssigningRequest] = useState(null); // Request unassigned para asignar cliente
    const [selectedAssignUserId, setSelectedAssignUserId] = useState('');
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false); // Modal de conexión / webhook WhatsApp
    const [expandedRowId, setExpandedRowId] = useState(null); 
    const [reanalyzingId, setReanalyzingId] = useState(null);
    const [selectedClient, setSelectedClient] = useState('todos');
    const [selectedYear, setSelectedYear] = useState('todos');
    const [selectedMonth, setSelectedMonth] = useState('todos');
    const [selectedConsolidatedClient, setSelectedConsolidatedClient] = useState(null);

    const handleInspectClient = (clientObj, destination = 'dashboard') => {
        if (!clientObj) return;
        const rawCuit = (clientObj.cuit || '').replace(/\D/g, '');
        const matchedClient = (clients || []).find(c => {
            const cCuit = (c.cuit || '').replace(/\D/g, '');
            if (clientObj.userId && c.id === clientObj.userId) return true;
            if (rawCuit && cCuit && rawCuit === cCuit) return true;
            if (c.displayName && clientObj.name && c.displayName.toLowerCase().trim() === clientObj.name.toLowerCase().trim()) return true;
            return false;
        });

        if (matchedClient) {
            selectClientById(matchedClient.id);
        } else if (clientObj.userId && clientObj.userId !== 'unassigned') {
            selectClientById(clientObj.userId);
        } else {
            setActiveEntity({
                id: clientObj.userId || clientObj.key || 'client_temp',
                displayName: clientObj.name,
                cuit: clientObj.cuit || '',
                isStudio: false
            });
        }
        if (navigate) {
            navigate(destination);
        }
    };

    useEffect(() => {
        setSelectedConsolidatedClient(null);
    }, [selectedClient, selectedYear, selectedMonth]);

    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = 0; i <= 10; i++) {
            years.push(currentYear - i);
        }
        return years;
    }, []);

    const getPeriodLabel = () => {
        if (selectedYear === 'todos' && selectedMonth === 'todos') {
            return '(Mes Actual)';
        }
        const monthObj = MONTHS.find(m => m.value === String(selectedMonth));
        const monthLabel = monthObj && monthObj.value !== 'todos' ? monthObj.label : '';
        
        if (selectedYear !== 'todos' && selectedMonth !== 'todos') {
            return `(${monthLabel} ${selectedYear})`;
        }
        if (selectedYear !== 'todos') {
            return `(Año ${selectedYear})`;
        }
        if (selectedMonth !== 'todos') {
            return `(${monthLabel} - Histórico)`;
        }
        return '';
    };

    const [createMode, setCreateMode] = useState('file'); 
    const [manualData, setManualData] = useState({
        monto: '', 
        fecha: new Date().toISOString().split('T')[0], 
        concepto: 'Pago en Efectivo', 
        nombreCliente: '', 
        cuitCliente: '',
        nombreEmisor: 'Consumidor Final',
        cuitEmisor: ''
    });

    const [newRequestFiles, setNewRequestFiles] = useState([]);
    const [newRequestNote, setNewRequestNote] = useState('');
    const [fileError, setFileError] = useState(null);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [previewItem, setPreviewItem] = useState(null);
    const [isZipping, setIsZipping] = useState(false);

    const [completingId, setCompletingId] = useState(null);
    const [invoiceFile, setInvoiceFile] = useState(null);
    const [requestToDelete, setRequestToDelete] = useState(null);
    const [editingRequest, setEditingRequest] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [autoRegisterInBook, setAutoRegisterInBook] = useState(true);

    // Mapeo dinámico del teléfono desde los perfiles de usuario
    const [systemUsers, setSystemUsers] = useState([]);

    useEffect(() => {
        if (userData?.isAdmin) {
            const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
                const usersList = [];
                snapshot.forEach(doc => {
                    usersList.push({ id: doc.id, ...doc.data() });
                });
                setSystemUsers(usersList);
            }, (error) => {
                console.error("Error al obtener usuarios para mapeo de teléfono:", error);
            });
            return () => unsubscribe();
        }
    }, [userData]);

    const userProfilePhoneDictionary = useMemo(() => {
        const dict = {};
        systemUsers.forEach(u => {
            const rawCuit = u.cuit || '';
            const cuit = rawCuit.replace(/\D/g, '');
            if (cuit && u.telefono) {
                dict[cuit] = u.telefono;
            }
        });
        return dict;
    }, [systemUsers]);

    // 1. Security check (activo por defecto salvo que se haya desactivado explícitamente)
    if (!loading && !userData?.isAdmin && (userData?.servicioFacturacion === false || userData?.permisos?.facturacion === false)) {
        return (
            <div className="p-12 text-center animate-fade-in">
                <Icon name="ShieldAlert" className="w-20 h-20 text-red-100 mx-auto mb-6" />
                <h2 className="text-3xl font-black text-gray-800">Acceso Restringido</h2>
                <p className="text-gray-500 mt-2">El servicio de facturación no se encuentra disponible para tu cuenta.</p>
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

    // Helper para determinar contraparte y cliente según la naturaleza contable de la operación
    const getPartyDetails = (req) => {
        const tipo = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
        const isVenta = tipo === 'venta';
        const tipoComp = (req.aiData?.tipo_comprobante || '').toLowerCase();
        const isTransfer = tipoComp.includes('transferencia') || tipoComp.includes('pago');

        if (isVenta) {
            return {
                tipo,
                isVenta: true,
                clienteLabel: 'Cliente del Estudio (Vendedor / Destino de Fondos)',
                clienteNombre: (req.userName && req.userId !== 'unassigned') ? req.userName : (req.aiData?.nombre_receptor || req.manualData?.nombreCliente || 'Cliente'),
                clienteCuit: req.aiData?.cuit_receptor || req.manualData?.cuitCliente || 'S/D',
                clienteBanco: req.aiData?.banco_receptor || req.aiData?.aplicacion_pago || '-',
                contraparteLabel: 'Comprador (Pagador / Origen Fondos)',
                contraparteNombre: req.aiData?.nombre_emisor || req.manualData?.nombreEmisor || 'Comprador',
                contraparteCuit: req.aiData?.cuit_emisor || req.manualData?.cuitEmisor || 'S/D',
                contraparteBanco: req.aiData?.banco_origen || '-'
            };
        } else {
            // Compra o Gasto: Inversión Contable de Roles
            // Si pagó por transferencia: nuestro cliente fue el EMISOR del pago
            // Si es factura de compra: el cliente fue el RECEPTOR (comprador de la factura)
            const clienteEsEmisor = isTransfer;
            const clienteNombre = (req.userName && req.userId !== 'unassigned') 
                ? req.userName 
                : (clienteEsEmisor ? req.aiData?.nombre_emisor : req.aiData?.nombre_receptor) || 'Cliente';
            const clienteCuit = (clienteEsEmisor ? req.aiData?.cuit_emisor : req.aiData?.cuit_receptor) || req.manualData?.cuitCliente || 'S/D';
            const clienteBanco = (clienteEsEmisor ? req.aiData?.banco_origen : req.aiData?.banco_receptor) || '-';

            const contraparteNombre = req.aiData?.nombre_proveedor || 
                (clienteEsEmisor ? req.aiData?.nombre_receptor : req.aiData?.nombre_emisor) || req.manualData?.nombreEmisor || 'Proveedor / Comercio';
            const contraparteCuit = req.aiData?.cuit_proveedor || 
                (clienteEsEmisor ? req.aiData?.cuit_receptor : req.aiData?.cuit_emisor) || req.manualData?.cuitEmisor || 'S/D';
            const contraparteBanco = (clienteEsEmisor ? req.aiData?.banco_receptor : req.aiData?.banco_origen) || '-';

            return {
                tipo,
                isVenta: false,
                clienteLabel: 'Cliente del Estudio (Titular Egreso / Pagador)',
                clienteNombre,
                clienteCuit,
                clienteBanco,
                contraparteLabel: 'Proveedor / Comercio / Servicio',
                contraparteNombre,
                contraparteCuit,
                contraparteBanco
            };
        }
    };

    const clientDictionary = useMemo(() => {
        const dict = {}; 
        visibleRequests.forEach(req => {
            const party = getPartyDetails(req);
            const rawCuit = party.clienteCuit || '';
            const cuit = rawCuit.replace(/\D/g, ''); 
            const name = party.clienteNombre || 'Desconocido';
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
            const party = getPartyDetails(req);
            const rawCuit = party.clienteCuit || '';
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
        if (req.userName && req.userId && req.userId !== 'unassigned') {
            return req.userName;
        }
        const party = getPartyDetails(req);
        if (party.clienteNombre && party.clienteNombre !== 'Desconocido' && party.clienteNombre !== 'Cliente') {
            return party.clienteNombre;
        }
        const rawCuit = party.clienteCuit || '';
        const cuit = rawCuit.replace(/\D/g, '');
        if (cuit && clientDictionary[cuit]) return clientDictionary[cuit];
        return party.clienteNombre || 'Desconocido';
    };

    const getReceptorPhone = (req) => {
        const party = getPartyDetails(req);
        const rawCuit = party.clienteCuit || '';
        const cuit = rawCuit.replace(/\D/g, '');
        return req.userPhone || userProfilePhoneDictionary[cuit] || clientPhoneDictionary[cuit] || '';
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
        if (selectedYear !== 'todos') {
            const y = parseInt(selectedYear, 10);
            data = data.filter(req => {
                const reqDate = req.timestamp?.toDate();
                if (!reqDate || reqDate.getFullYear() !== y) return false;
                if (selectedMonth !== 'todos') {
                    const m = parseInt(selectedMonth, 10);
                    return (reqDate.getMonth() + 1) === m;
                }
                return true;
            });
        } else if (selectedMonth !== 'todos') {
            const m = parseInt(selectedMonth, 10);
            data = data.filter(req => {
                const reqDate = req.timestamp?.toDate();
                return reqDate && (reqDate.getMonth() + 1) === m;
            });
        }

        // Filtrado por Módulo Operativo Principal
        if (activeModule === 'unassigned') {
            data = data.filter(req => req.userId === 'unassigned' || req.status === 'unassigned');
        } else if (activeModule === 'ventas') {
            data = data.filter(req => {
                const tipo = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
                return tipo === 'venta' && req.userId !== 'unassigned' && req.status !== 'unassigned';
            });
        } else if (activeModule === 'compras_gastos') {
            data = data.filter(req => {
                const tipo = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
                const esEgreso = tipo === 'compra' || tipo === 'gasto';
                if (!esEgreso || req.userId === 'unassigned' || req.status === 'unassigned') return false;
                if (subFilterExpense !== 'todos') {
                    return tipo === subFilterExpense;
                }
                return true;
            });
        }

        if (filterStatus === 'completed') {
            return (selectedYear !== 'todos' || selectedMonth !== 'todos') 
                ? data.filter(r => r.status === 'completed') 
                : data.filter(r => r.status === 'completed').slice(0, 30);
        } else {
            return data.filter(r => r.status !== 'completed');
        }
    }, [visibleRequests, selectedClient, selectedYear, selectedMonth, filterStatus, activeModule, subFilterExpense, clientDictionary]);

    const metrics = useMemo(() => {
        let baseData = visibleRequests;
        if (selectedClient !== 'todos') {
            baseData = baseData.filter(req => getUnifiedName(req) === selectedClient);
        }
        
        let reqs = baseData;
        if (selectedYear !== 'todos') {
            const y = parseInt(selectedYear, 10);
            reqs = baseData.filter(req => {
                const reqDate = req.timestamp?.toDate();
                if (!reqDate || reqDate.getFullYear() !== y) return false;
                if (selectedMonth !== 'todos') {
                    const m = parseInt(selectedMonth, 10);
                    return (reqDate.getMonth() + 1) === m;
                }
                return true;
            });
        } else if (selectedMonth !== 'todos') {
            const m = parseInt(selectedMonth, 10);
            reqs = baseData.filter(req => {
                const reqDate = req.timestamp?.toDate();
                return reqDate && (reqDate.getMonth() + 1) === m;
            });
        } else {
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            reqs = baseData.filter(req => req.timestamp && req.timestamp.toDate().getMonth() === currentMonth && req.timestamp.toDate().getFullYear() === currentYear);
        }

        const isExpenseModule = activeModule === 'compras_gastos';
        const filteredByModule = reqs.filter(r => {
            const tipo = r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta';
            if (activeModule === 'ventas') return tipo === 'venta';
            if (activeModule === 'compras_gastos') return tipo === 'compra' || tipo === 'gasto';
            return true;
        });

        return {
            isExpenseModule,
            totalFacturado: filteredByModule.filter(r => r.status === 'completed').reduce((sum, r) => sum + (r.aiData?.monto_total || r.manualData?.monto || 0), 0),
            totalPendiente: filteredByModule.filter(r => r.status !== 'completed' && r.status !== 'duplicate').reduce((sum, r) => sum + (r.aiData?.monto_total || r.manualData?.monto || 0), 0)
        };
    }, [visibleRequests, selectedClient, selectedYear, selectedMonth, activeModule, clientDictionary]);

    const clientBillingSummary = useMemo(() => {
        const summaryMap = {};
        
        let targetRequests = requests;
        if (selectedYear !== 'todos') {
            const y = parseInt(selectedYear, 10);
            targetRequests = requests.filter(req => {
                const reqDate = req.timestamp?.toDate();
                if (!reqDate || reqDate.getFullYear() !== y) return false;
                if (selectedMonth !== 'todos') {
                    const m = parseInt(selectedMonth, 10);
                    return (reqDate.getMonth() + 1) === m;
                }
                return true;
            });
        } else if (selectedMonth !== 'todos') {
            const m = parseInt(selectedMonth, 10);
            targetRequests = requests.filter(req => {
                const reqDate = req.timestamp?.toDate();
                return reqDate && (reqDate.getMonth() + 1) === m;
            });
        }

        targetRequests.forEach(req => {
            const party = getPartyDetails(req);
            const clientName = getUnifiedName(req);
            const rawCuit = party.clienteCuit || '';
            const cuit = rawCuit.replace(/\D/g, '') || 'Sin CUIT';
            const key = cuit !== 'Sin CUIT' && cuit ? cuit : clientName;
            
            if (!key || key === 'Desconocido' || key === 'Carga Manual') return;

            const monto = req.aiData?.monto_total || req.manualData?.monto || 0;
            const isCompleted = req.status === 'completed';
            const isPending = req.status !== 'completed' && req.status !== 'duplicate';
            
            if (!summaryMap[key]) {
                summaryMap[key] = {
                    key,
                    name: clientName,
                    cuit: cuit,
                    userId: req.userId && req.userId !== 'unassigned' ? req.userId : null,
                    totalFacturado: 0,
                    totalPendiente: 0,
                    count: 0,
                    lastActivity: null
                };
            }
            if (!summaryMap[key].userId && req.userId && req.userId !== 'unassigned') {
                summaryMap[key].userId = req.userId;
            }
            
            const clientData = summaryMap[key];
            if (isCompleted) {
                clientData.totalFacturado += monto;
            }
            if (isPending) {
                clientData.totalPendiente += monto;
            }
            clientData.count += 1;
            
            const reqDate = req.timestamp?.toDate();
            if (reqDate) {
                if (!clientData.lastActivity || reqDate > clientData.lastActivity) {
                    clientData.lastActivity = reqDate;
                }
            }
        });
        
        return Object.values(summaryMap).sort((a, b) => b.totalFacturado - a.totalFacturado);
    }, [requests, selectedYear, selectedMonth, clientDictionary]);

    const consolidatedClientRequests = useMemo(() => {
        if (!selectedConsolidatedClient) return [];
        let data = requests.filter(req => getUnifiedName(req) === selectedConsolidatedClient.name);
        if (selectedYear !== 'todos') {
            const y = parseInt(selectedYear, 10);
            data = data.filter(req => {
                const reqDate = req.timestamp?.toDate();
                if (!reqDate || reqDate.getFullYear() !== y) return false;
                if (selectedMonth !== 'todos') {
                    const m = parseInt(selectedMonth, 10);
                    return (reqDate.getMonth() + 1) === m;
                }
                return true;
            });
        } else if (selectedMonth !== 'todos') {
            const m = parseInt(selectedMonth, 10);
            data = data.filter(req => {
                const reqDate = req.timestamp?.toDate();
                return reqDate && (reqDate.getMonth() + 1) === m;
            });
        }
        return data;
    }, [requests, selectedConsolidatedClient, selectedYear, selectedMonth]);

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

    // 5. Multi-file Handlers & Actions (Nivel Completo)
    const MAX_FILES = 10;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30 MB
    const SAFE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
    const SAFE_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

    const getSafePreviewUrl = (url) => {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('blob:') || url.startsWith('https://') || url.startsWith('http://')) {
            return url;
        }
        return '';
    };

    const processFiles = (fileList) => {
        setFileError(null);
        const incomingFiles = Array.from(fileList || []);
        if (incomingFiles.length === 0) return;

        let updatedList = [...newRequestFiles];
        let rejectedReasons = [];

        for (const file of incomingFiles) {
            if (updatedList.length >= MAX_FILES) {
                rejectedReasons.push(`Límite máximo de ${MAX_FILES} comprobantes alcanzado.`);
                break;
            }

            const fileNameLower = file.name.toLowerCase();
            const isPdf = file.type === 'application/pdf' || fileNameLower.endsWith('.pdf');
            const isSafeImage = (SAFE_IMAGE_MIMES.includes(file.type) || SAFE_IMAGE_EXTS.some(ext => fileNameLower.endsWith(ext))) && !fileNameLower.endsWith('.svg');

            if (!isPdf && !isSafeImage) {
                rejectedReasons.push(`"${file.name}": Formato no permitido (solo imágenes JPG, PNG, WEBP o PDF).`);
                continue;
            }

            if (file.size > MAX_FILE_SIZE) {
                rejectedReasons.push(`"${file.name}": Supera el tamaño máximo de 5 MB.`);
                continue;
            }

            const alreadyExists = updatedList.some(item => item.file.name === file.name && item.file.size === file.size);
            if (alreadyExists) {
                rejectedReasons.push(`"${file.name}": Ya está en la lista.`);
                continue;
            }

            const currentTotalSize = updatedList.reduce((sum, item) => sum + item.file.size, 0);
            if (currentTotalSize + file.size > MAX_TOTAL_SIZE) {
                rejectedReasons.push(`Se supera el peso acumulado permitido de 30 MB.`);
                break;
            }

            const previewUrl = isSafeImage ? URL.createObjectURL(file) : null;

            updatedList.push({
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file,
                isPdf,
                previewUrl,
                name: file.name,
                sizeFormatted: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
            });
        }

        setNewRequestFiles(updatedList);
        if (rejectedReasons.length > 0) {
            setFileError(rejectedReasons.join(' '));
        }
    };

    const handleFileSelection = (e) => {
        processFiles(e.target.files);
        e.target.value = '';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!uploading && !isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (uploading) return;
        if (e.dataTransfer && e.dataTransfer.files) {
            processFiles(e.dataTransfer.files);
        }
    };

    const handleRemoveFile = (idToRemove) => {
        setFileError(null);
        setNewRequestFiles(prev => {
            const itemToRemove = prev.find(item => item.id === idToRemove);
            if (itemToRemove && itemToRemove.previewUrl) {
                URL.revokeObjectURL(itemToRemove.previewUrl);
            }
            return prev.filter(item => item.id !== idToRemove);
        });
    };

    const resetModalState = () => {
        newRequestFiles.forEach(item => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        setNewRequestFiles([]);
        setNewRequestNote('');
        setFileError(null);
        setIsDragging(false);
        setPreviewItem(null);
        setUploadProgress({ current: 0, total: 0, fileName: '' });
        setManualData({
            monto: '',
            fecha: new Date().toISOString().split('T')[0],
            concepto: 'Pago en Efectivo',
            nombreCliente: '',
            cuitCliente: '',
            nombreEmisor: 'Consumidor Final',
            cuitEmisor: ''
        });
        setCreateMode('file');
        setShowModal(false);
    };

    const uploadFileWithRetry = async (fileRef, file, maxRetries = 2) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await uploadBytes(fileRef, file);
                return await getDownloadURL(fileRef);
            } catch (err) {
                if (attempt === maxRetries) throw err;
                await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
            }
        }
    };

    const handleCreateRequest = async (e) => {
        e.preventDefault();
        if (!user) return;
        if (createMode === 'file' && newRequestFiles.length === 0) {
            return setFileError("Debes adjuntar al menos un comprobante.");
        }
        if (createMode === 'manual' && (!manualData.monto || !manualData.nombreCliente)) {
            return alert("Faltan datos requeridos para la carga manual");
        }

        setUploading(true);
        setFileError(null);
        try {
            const modo = userData?.isAdmin ? 'estudio' : (userData.modoFacturacion || 'estudio');

            if (createMode === 'file') {
                const totalFiles = newRequestFiles.length;
                let successCount = 0;
                let failCount = 0;

                for (let i = 0; i < totalFiles; i++) {
                    const item = newRequestFiles[i];
                    setUploadProgress({
                        current: i + 1,
                        total: totalFiles,
                        fileName: item.name
                    });

                    try {
                        // 1. Subir a Storage con reintento automático
                        const fileRef = ref(storage, `billing_requests/${user.uid}/${Date.now()}_${item.file.name}`);
                        const url = await uploadFileWithRetry(fileRef, item.file);

                        // 2. Crear documento individual en Firestore (disparará la Cloud Function analyzeBillingRequest)
                        await addDoc(collection(db, 'billing_requests'), {
                            userId: user.uid,
                            userName: userData.nombre || user.email,
                            userPhone: userData.telefono || "",
                            userModoFacturacion: modo,
                            status: 'pending',
                            requestImageUrl: url,
                            aiData: null,
                            note: newRequestNote,
                            timestamp: Timestamp.now(),
                            invoiceUrl: null,
                            isManualEntry: false
                        });
                        successCount++;
                    } catch (fileErr) {
                        console.error(`Error al subir ${item.name}:`, fileErr);
                        failCount++;
                    }
                }

                if (failCount > 0) {
                    alert(`Se procesaron ${successCount} de ${totalFiles} comprobantes. ${failCount} tuvieron problemas de conexión.`);
                }
            } else {
                const finalAiData = {
                    monto_total: parseFloat(manualData.monto),
                    fecha_pago: manualData.fecha,
                    tipo_comprobante: 'Efectivo/Manual',
                    concepto_detectado: manualData.concepto,
                    nombre_emisor: manualData.nombreEmisor || 'Consumidor Final', 
                    cuit_emisor: manualData.cuitEmisor || '',
                    nombre_receptor: manualData.nombreCliente,
                    cuit_receptor: manualData.cuitCliente || '', 
                    banco_origen: 'Efectivo/Caja'
                };

                await addDoc(collection(db, 'billing_requests'), {
                    userId: user.uid, 
                    userName: userData.nombre || user.email, 
                    userPhone: userData.telefono || "",
                    userModoFacturacion: modo, 
                    status: 'pending', 
                    requestImageUrl: null, 
                    aiData: finalAiData,
                    note: newRequestNote, 
                    timestamp: Timestamp.now(), 
                    invoiceUrl: null, 
                    isManualEntry: true
                });
            }

            resetModalState();
        } catch (e) { 
            console.error("Error al procesar la solicitud:", e);
            alert("Ocurrió un error al procesar las solicitudes. Por favor reintenta."); 
        } finally { 
            setUploading(false); 
            setUploadProgress({ current: 0, total: 0, fileName: '' });
        }
    };

    const handleCompleteRequest = async (id, overrideFile = undefined) => { 
        const fileToUpload = overrideFile !== undefined ? overrideFile : invoiceFile;
        const req = requests.find(r => r.id === id); 
        if (!req) return;
        const isVenta = (req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta') === 'venta';

        if (isVenta && !fileToUpload && overrideFile === undefined) {
            alert("Por favor selecciona el archivo de la factura de venta.");
            return;
        }

        setUploading(true); 
        try { 
            let url = null;
            if (fileToUpload) {
                const folder = isVenta ? 'billing_invoices' : 'expense_invoices';
                const fileRef = ref(storage, `${folder}/${req.userId}/${Date.now()}_${fileToUpload.name}`); 
                await uploadBytes(fileRef, fileToUpload); 
                url = await getDownloadURL(fileRef); 
            }

            // Determinar si también se registra en el Libro de Operaciones
            const shouldExport = (autoRegisterInBook || !isVenta) && req.userId && req.userId !== 'unassigned' && !req.exportedToOperations;

            await updateDoc(doc(db, 'billing_requests', id), { 
                status: 'completed', 
                ...(url ? { invoiceUrl: url } : {}), 
                completedAt: Timestamp.now(),
                ...(shouldExport ? { exportedToOperations: true } : {})
            }); 

            // Auto-registrar en el Libro de Operaciones si corresponde
            if (shouldExport) {
                try {
                    const monto = req.aiData?.monto_total || req.manualData?.monto || 0;
                    const tipo = req.clasificacionContable === 'gasto' ? 'gasto' : (req.clasificacionContable === 'compra' ? 'compra' : 'venta');
                    const party = getPartyDetails(req);
                    const partyDesc = isVenta ? (party.contraparteNombre || 'Comprador') : (party.contraparteNombre || 'Proveedor');
                    const desc = req.aiData?.concepto_detectado 
                        ? `[${tipo.toUpperCase()}] ${partyDesc} - ${req.aiData.concepto_detectado}`
                        : `${tipo.toUpperCase()} - ${partyDesc}`;
                    const fechaStr = req.aiData?.fecha_pago || new Date().toISOString().split('T')[0];
                    const localDate = new Date(fechaStr + 'T00:00:00-03:00');

                    await addDoc(collection(db, 'users', req.userId, 'operations'), {
                        type: tipo,
                        amount: parseFloat(monto),
                        description: desc,
                        fechaEmision: Timestamp.fromDate(localDate),
                        year: localDate.getFullYear(),
                        month: localDate.getMonth() + 1,
                        day: localDate.getDate(),
                        billingRequestId: req.id,
                        source: req.source || 'web'
                    });
                } catch (opErr) {
                    console.error("Error al auto-registrar en libro de operaciones:", opErr);
                }
            }

            setCompletingId(null); 
            setInvoiceFile(null); 
        } catch (e) {
            console.error("Error al completar solicitud:", e);
            alert("Error al procesar la solicitud: " + (e.message || ''));
        } finally { 
            setUploading(false); 
        } 
    };

    const handleQuickChangeClasificacion = async (reqId, newClasif) => {
        try {
            await updateDoc(doc(db, 'billing_requests', reqId), {
                clasificacionContable: newClasif,
                'aiData.clasificacion_contable': newClasif
            });
        } catch (error) {
            console.error("Error al actualizar clasificación:", error);
            alert("No se pudo actualizar la clasificación contable.");
        }
    };

    const handleReanalyze = async (req) => {
        if (!req.id) return;
        try {
            setReanalyzingId(req.id);
            const reanalyzeFn = httpsCallable(functions, 'reanalyzeBillingRequest');
            await reanalyzeFn({ requestId: req.id });
        } catch (err) {
            console.error("Error al reanalizar comprobante:", err);
            alert("No se pudo reanalizar el comprobante: " + (err.message || 'Error desconocido'));
        } finally {
            setReanalyzingId(null);
        }
    };

    const openEditModal = (req) => {
        if (req.status === 'pending' && !req.aiData && !req.isManualEntry && !req.aiError) {
            return alert("⏳ Por favor, espere a que la IA termine de analizar el comprobante.");
        }

        const phoneToShow = getReceptorPhone(req);
        const initialApp = (req.aiData?.aplicacion_pago && req.aiData.aplicacion_pago.toLowerCase() !== 'otro')
            ? req.aiData.aplicacion_pago
            : (req.aiData?.banco_receptor || '');

        setEditFormData({
            clasificacion_contable: req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta',
            fecha_pago: req.aiData?.fecha_pago || '',
            hora_pago: req.aiData?.hora_pago || '', 
            monto_total: req.aiData?.monto_total || 0,
            tipo_comprobante: req.aiData?.tipo_comprobante || '',
            aplicacion_pago: initialApp,
            numero_operacion: req.aiData?.numero_operacion || '', 
            codigo_identificacion: req.aiData?.codigo_identificacion || '',
            cuit_emisor: req.aiData?.cuit_emisor || '',
            nombre_emisor: req.aiData?.nombre_emisor || '',
            banco_origen: req.aiData?.banco_origen || '',
            cuit_receptor: req.aiData?.cuit_receptor || '',
            nombre_receptor: req.aiData?.nombre_receptor || '',
            banco_receptor: req.aiData?.banco_receptor || '',
            userPhone: phoneToShow, 
            concepto_detectado: req.aiData?.concepto_detectado || '',
            note: req.note || ''
        });
        setEditingRequest(req);
    };

    const handleSaveEdits = async (e) => { 
        e.preventDefault(); 
        if (!editingRequest) return; 
        try { 
            const { userPhone, note, clasificacion_contable, ...aiDataFields } = editFormData;
            const finalClasif = clasificacion_contable || 'venta';
            await updateDoc(doc(db, 'billing_requests', editingRequest.id), { 
                clasificacionContable: finalClasif,
                aiData: { 
                    ...(editingRequest.aiData || {}),
                    ...aiDataFields, 
                    clasificacion_contable: finalClasif,
                    monto_total: parseFloat(editFormData.monto_total) || 0 
                },
                userPhone: userPhone,
                note: note || ''
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
        const req = requests.find(r => r.id === reqId);
        if (!req) return;
        const isVenta = (req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta') === 'venta';
        const msg = isVenta 
            ? "¿Confirmar facturación en AFIP sin comprobante PDF?" 
            : "¿Confirmar imputación del egreso en la contabilidad sin comprobante adicional?";
        if (!confirm(msg)) return; 
        
        await handleCompleteRequest(reqId, null);
    };

    const handleAssignClient = async () => {
        if (!assigningRequest || !selectedAssignUserId) return;
        const targetUser = systemUsers.find(u => u.id === selectedAssignUserId);
        if (!targetUser) return;

        try {
            await updateDoc(doc(db, 'billing_requests', assigningRequest.id), {
                userId: targetUser.id,
                userName: targetUser.nombre || targetUser.email || 'Cliente Asignado',
                userPhone: targetUser.telefono || assigningRequest.userPhone || '',
                userModoFacturacion: targetUser.modoFacturacion || 'estudio',
                status: 'pending'
            });
            setAssigningRequest(null);
            setSelectedAssignUserId('');
            alert(`Comprobante asignado con éxito a ${targetUser.nombre || targetUser.email}`);
        } catch (err) {
            console.error("Error al asignar cliente:", err);
            alert("Error al asignar el comprobante al cliente.");
        }
    };

    const handleExportToOperations = async (req) => {
        if (!req.userId || req.userId === 'unassigned') {
            return alert("Primero debes asignar este comprobante a un cliente.");
        }

        const monto = req.aiData?.monto_total || 0;
        if (!monto) return alert("El comprobante no tiene un monto válido registrado.");

        const tipo = req.clasificacionContable === 'gasto' ? 'gasto' : (req.clasificacionContable === 'compra' ? 'compra' : 'venta');
        const desc = req.aiData?.concepto_detectado || `${tipo.toUpperCase()} - ${req.aiData?.nombre_emisor || 'Comprobante'}`;
        const fechaStr = req.aiData?.fecha_pago || new Date().toISOString().split('T')[0];
        const localDate = new Date(fechaStr + 'T00:00:00-03:00');

        if (!confirm(`¿Deseas asentar este registro de ${formatCurrency(monto)} como '${tipo.toUpperCase()}' en el Libro de Operaciones del cliente?`)) {
            return;
        }

        try {
            await addDoc(collection(db, 'users', req.userId, 'operations'), {
                type: tipo,
                amount: parseFloat(monto),
                description: desc,
                fechaEmision: Timestamp.fromDate(localDate),
                year: localDate.getFullYear(),
                month: localDate.getMonth() + 1,
                day: localDate.getDate(),
                billingRequestId: req.id,
                source: req.source || 'web'
            });

            await updateDoc(doc(db, 'billing_requests', req.id), {
                exportedToOperations: true,
                status: 'completed',
                completedAt: Timestamp.now()
            });

            alert(`✅ Operación asentada con éxito en el libro del cliente.`);
        } catch (err) {
            console.error("Error al exportar operación:", err);
            alert("Error al registrar la operación en el libro diario.");
        }
    };

    const toggleDetails = (id) => setExpandedRowId(expandedRowId === id ? null : id);

    const sendWhatsAppNotification = (req) => {
        let phone = getReceptorPhone(req);
        if (!phone) phone = prompt("Ingresa el número de celular del cliente (ej: 549381...):");
        if (!phone) return;

        const nombreCliente = getUnifiedName(req);
        const monto = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(req.aiData?.monto_total || 0);
        const fecha = req.aiData?.fecha_pago || 'la fecha';
        
        let mensaje = `Hola *${nombreCliente}*! 👋\n\n` +
                      `Te notificamos que el pago de *${monto}* realizado el día ${fecha} ya fue registrado y facturado con éxito.`;

        if (req.invoiceUrl) {
            mensaje += `\n\n📎 *Podés descargar tu factura desde este link:*\n${req.invoiceUrl}`;
        } else {
            mensaje += `\n\nMuchas gracias!`;
        }

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
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                        <Icon name="Calendar" className="w-4 h-4 text-gray-400 ml-2"/>
                        <select 
                            value={selectedYear} 
                            onChange={(e) => setSelectedYear(e.target.value)} 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 outline-none pr-8 cursor-pointer"
                        >
                            <option value="todos">Todos los Años</option>
                            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                        <Icon name="Clock" className="w-4 h-4 text-gray-400 ml-2"/>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)} 
                            className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 outline-none pr-8 cursor-pointer"
                        >
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={() => setShowWhatsAppModal(true)} 
                        className="bg-emerald-600 text-white px-5 py-3 rounded-2xl hover:bg-emerald-700 flex items-center font-bold shadow-lg shadow-emerald-100 transition-all transform active:scale-95 text-sm"
                        title="Conectar línea de WhatsApp o configurar Webhook"
                    >
                        <Icon name="MessageCircle" className="w-5 h-5 mr-2"/> WhatsApp
                    </button>
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
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex items-center gap-6 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 text-blue-50/40 group-hover:scale-110 transition-transform">
                        <Icon name="CheckCircle" size={120} />
                    </div>
                    <div className="p-4 rounded-2xl relative z-10 bg-blue-50 text-blue-600 border border-blue-100/60">
                        <Icon name={metrics.isExpenseModule ? "ShoppingBag" : "TrendingUp"} size={32} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                            {metrics.isExpenseModule ? 'Total Egresos Imputados' : 'Total Facturado'} {getPeriodLabel()}
                        </p>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{formatCurrency(metrics.totalFacturado)}</h3>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex items-center gap-6 group overflow-hidden relative">
                    <div className="absolute -right-4 -top-4 text-sky-50/40 group-hover:scale-110 transition-transform">
                        <Icon name="Clock" size={120} />
                    </div>
                    <div className="bg-sky-50 p-4 rounded-2xl text-sky-600 border border-sky-100/60 relative z-10">
                        <Icon name="History" size={32} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                            {metrics.isExpenseModule ? 'Egresos Pendientes de Imputar' : 'Pendiente de Facturación'} {getPeriodLabel()}
                        </p>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{formatCurrency(metrics.totalPendiente)}</h3>
                    </div>
                </div>
            </div>

            {/* Backup Action Bar */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 p-6 rounded-[32px] shadow-xl shadow-blue-950/15 flex flex-col md:flex-row justify-between items-center gap-6 overflow-hidden relative border border-blue-800/30">
                <div className="absolute left-0 top-0 w-full h-full opacity-10 pointer-events-none text-sky-200">
                    <div className="absolute top-0 right-0 p-4 transform translate-x-1/2 -translate-y-1/2">
                        <Icon name="Archive" size={200} />
                    </div>
                </div>
                <div className="flex items-center gap-4 relative z-10">
                    <div className="bg-white/10 p-3 rounded-2xl text-sky-200 border border-white/10 backdrop-blur-md">
                        <Icon name="FolderArchive" size={28}/>
                    </div>
                    <div>
                        <h4 className="font-black text-white text-lg leading-none">Respaldo Legal Anual</h4>
                        <p className="text-blue-200/90 text-xs font-bold mt-1 uppercase tracking-widest">Descarga todos los comprobantes y facturas en un solo ZIP.</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 relative z-10 w-full md:w-auto">
                    <select id="y_select" className="flex-1 md:flex-none bg-white/10 border-2 border-white/20 rounded-xl px-4 py-2.5 text-white font-bold outline-none backdrop-blur-md appearance-none cursor-pointer hover:bg-white/20 transition-all">
                        {availableYears.map(year => <option key={year} value={year} className="text-gray-800">{year}</option>)}
                    </select>
                    <button 
                        onClick={() => downloadYearlyBackup(document.getElementById('y_select').value)} 
                        disabled={isZipping} 
                        className="bg-white hover:bg-blue-50 text-blue-950 px-8 py-3 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-black/20 disabled:opacity-50 cursor-pointer active:scale-95"
                    >
                        {isZipping ? 'Procesando...' : 'Generar ZIP'}
                    </button>
                </div>
            </div>

            {/* Selector de Módulo Operativo: Ventas vs Compras/Gastos vs Consolidado */}
            <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-[28px] border border-blue-100/70 shadow-xs">
                <button
                    onClick={() => {
                        setActiveModule('ventas');
                        setFilterStatus('pending');
                        setSelectedConsolidatedClient(null);
                    }}
                    className={`flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                        activeModule === 'ventas'
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 scale-[1.01]'
                            : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50/60'
                    }`}
                >
                    <span className={`w-2.5 h-2.5 rounded-full ${activeModule === 'ventas' ? 'bg-sky-200' : 'bg-blue-500'}`}></span>
                    Ventas e Ingresos (A Facturar)
                    {visibleRequests.filter(r => r.status !== 'completed' && (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'venta' && r.userId !== 'unassigned').length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeModule === 'ventas' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'}`}>
                            {visibleRequests.filter(r => r.status !== 'completed' && (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'venta' && r.userId !== 'unassigned').length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => {
                        setActiveModule('compras_gastos');
                        setFilterStatus('pending');
                        setSelectedConsolidatedClient(null);
                    }}
                    className={`flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                        activeModule === 'compras_gastos'
                            ? 'bg-gradient-to-r from-blue-800 to-sky-800 text-white shadow-lg shadow-blue-900/20 scale-[1.01]'
                            : 'text-slate-600 hover:text-sky-800 hover:bg-sky-50/60'
                    }`}
                >
                    <span className={`w-2.5 h-2.5 rounded-full ${activeModule === 'compras_gastos' ? 'bg-sky-300' : 'bg-sky-600'}`}></span>
                    Compras y Gastos (A Imputar)
                    {visibleRequests.filter(r => r.status !== 'completed' && ((r.clasificacionContable || r.aiData?.clasificacion_contable) === 'compra' || (r.clasificacionContable || r.aiData?.clasificacion_contable) === 'gasto') && r.userId !== 'unassigned').length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeModule === 'compras_gastos' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'}`}>
                            {visibleRequests.filter(r => r.status !== 'completed' && ((r.clasificacionContable || r.aiData?.clasificacion_contable) === 'compra' || (r.clasificacionContable || r.aiData?.clasificacion_contable) === 'gasto') && r.userId !== 'unassigned').length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => {
                        setActiveModule('summary');
                        setFilterStatus('summary');
                        setSelectedConsolidatedClient(null);
                    }}
                    className={`flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                        activeModule === 'summary'
                            ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 scale-[1.01]'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                >
                    <Icon name="Users" size={15}/>
                    Consolidado Clientes ({clientBillingSummary.length})
                </button>

                {visibleRequests.filter(r => r.userId === 'unassigned' || r.status === 'unassigned').length > 0 && (
                    <button
                        onClick={() => {
                            setActiveModule('unassigned');
                            setFilterStatus('pending');
                            setSelectedConsolidatedClient(null);
                        }}
                        className={`flex items-center gap-2.5 px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all cursor-pointer ${
                            activeModule === 'unassigned'
                                ? 'bg-amber-600 text-white shadow-lg shadow-amber-100 scale-[1.01]'
                                : 'text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200'
                        }`}
                    >
                        <Icon name="AlertCircle" size={15}/>
                        Sin Asignar ({visibleRequests.filter(r => r.userId === 'unassigned' || r.status === 'unassigned').length})
                    </button>
                )}
            </div>
            
            {/* Main Table Container */}
            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                {activeModule !== 'summary' && (
                    <div className="flex border-b border-blue-50/70 bg-slate-50/40 p-2">
                        <button 
                            onClick={() => {
                                setFilterStatus('pending');
                                setSelectedConsolidatedClient(null);
                            }} 
                            className={`flex-1 py-4 px-6 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                                filterStatus === 'pending' 
                                    ? 'bg-white shadow-xs text-blue-600 scale-[1.01]' 
                                    : 'text-slate-400 hover:text-blue-600'
                            }`}
                        >
                            {activeModule === 'ventas' 
                                ? `Pendientes de Facturar (${visibleRequests.filter(r => r.status !== 'completed' && (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'venta' && r.userId !== 'unassigned').length})`
                                : activeModule === 'compras_gastos'
                                ? `Pendientes de Imputar (${visibleRequests.filter(r => r.status !== 'completed' && ((r.clasificacionContable || r.aiData?.clasificacion_contable) === 'compra' || (r.clasificacionContable || r.aiData?.clasificacion_contable) === 'gasto') && r.userId !== 'unassigned').length})`
                                : `Pendientes (${visibleRequests.filter(r => r.status !== 'completed' && (r.userId === 'unassigned' || r.status === 'unassigned')).length})`
                            }
                        </button>
                        <button 
                            onClick={() => {
                                setFilterStatus('completed');
                                setSelectedConsolidatedClient(null);
                            }} 
                            className={`flex-1 py-4 px-6 rounded-[24px] text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${
                                filterStatus === 'completed' 
                                    ? 'bg-white shadow-xs text-blue-900 scale-[1.01]' 
                                    : 'text-slate-400 hover:text-blue-900'
                            }`}
                        >
                            {activeModule === 'ventas'
                                ? `Facturados / Finalizados (${visibleRequests.filter(r => r.status === 'completed' && (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'venta' && r.userId !== 'unassigned').length})`
                                : activeModule === 'compras_gastos'
                                ? `Imputados / Registrados (${visibleRequests.filter(r => r.status === 'completed' && ((r.clasificacionContable || r.aiData?.clasificacion_contable) === 'compra' || (r.clasificacionContable || r.aiData?.clasificacion_contable) === 'gasto') && r.userId !== 'unassigned').length})`
                                : `Completados (${visibleRequests.filter(r => r.status === 'completed' && (r.userId === 'unassigned' || r.status === 'unassigned')).length})`
                            }
                        </button>
                    </div>
                )}

                {/* Sub-filtros para Compras y Gastos */}
                {activeModule === 'compras_gastos' && (
                    <div className="flex flex-wrap items-center gap-2 p-4 bg-blue-50/40 border-b border-blue-100/60">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-900 mr-2">Filtrar Egresos:</span>
                        <button 
                            onClick={() => setSubFilterExpense('todos')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${subFilterExpense === 'todos' ? 'bg-blue-800 text-white shadow-xs' : 'bg-white text-blue-800 hover:bg-blue-50 border border-blue-200'}`}
                        >
                            Todos los Egresos
                        </button>
                        <button 
                            onClick={() => setSubFilterExpense('compra')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${subFilterExpense === 'compra' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'}`}
                        >
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span> Solo Compras
                        </button>
                        <button 
                            onClick={() => setSubFilterExpense('gasto')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${subFilterExpense === 'gasto' ? 'bg-sky-700 text-white shadow-xs' : 'bg-white text-sky-800 hover:bg-sky-50 border border-sky-200'}`}
                        >
                            <span className="w-2 h-2 rounded-full bg-sky-400"></span> Solo Gastos
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    {filterStatus === 'summary' ? (
                        selectedConsolidatedClient ? (
                            <div className="animate-fade-in bg-white">
                                {/* Header */}
                                <div className="p-8 border-b border-blue-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-blue-50/20">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-100/80 p-2.5 rounded-xl text-blue-700 border border-blue-200/60">
                                                <Icon name="Users" size={20}/>
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-black text-gray-900 leading-tight">{selectedConsolidatedClient.name}</h3>
                                                <p className="text-xs text-gray-400 font-bold font-mono mt-1">CUIT: {selectedConsolidatedClient.cuit}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <button
                                            onClick={() => handleInspectClient(selectedConsolidatedClient, 'dashboard')}
                                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 cursor-pointer"
                                            title="Ver el Dashboard financiero completo de este cliente"
                                        >
                                            <Icon name="LayoutDashboard" size={14}/> Ver Dashboard
                                        </button>
                                        <button
                                            onClick={() => handleInspectClient(selectedConsolidatedClient, 'operations')}
                                            className="flex items-center gap-2 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                                            title="Ver y gestionar el Libro de Operaciones de este cliente"
                                        >
                                            <Icon name="BookOpen" size={14}/> Libro Operaciones
                                        </button>
                                        <button
                                            onClick={() => setSelectedConsolidatedClient(null)}
                                            className="flex items-center gap-2 bg-white border border-blue-200/80 text-blue-900 hover:bg-blue-50/60 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                                        >
                                            <Icon name="ArrowLeft" size={14}/> Volver al Listado
                                        </button>
                                    </div>
                                </div>

                                {/* Summary KPI Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 bg-blue-50/10 border-b border-blue-50">
                                    <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-xs flex items-center gap-4 group hover:shadow-md transition-all">
                                        <div className="bg-blue-50 p-3 rounded-xl text-blue-600 border border-blue-100">
                                            <Icon name="TrendingUp" size={24}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Facturado</p>
                                            <p className="text-xl font-black text-blue-700 mt-0.5">{formatCurrency(selectedConsolidatedClient.totalFacturado)}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-xs flex items-center gap-4 group hover:shadow-md transition-all">
                                        <div className="bg-sky-50 p-3 rounded-xl text-sky-600 border border-sky-100">
                                            <Icon name="Clock" size={24}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pendiente</p>
                                            <p className="text-xl font-black text-sky-700 mt-0.5">{formatCurrency(selectedConsolidatedClient.totalPendiente)}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-xs flex items-center gap-4 group hover:shadow-md transition-all">
                                        <div className="bg-slate-100 p-3 rounded-xl text-slate-700 border border-slate-200">
                                            <Icon name="FileText" size={24}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Solicitudes</p>
                                            <p className="text-xl font-black text-slate-800 mt-0.5">{selectedConsolidatedClient.count} Comprobantes</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Table with Requests details for the client */}
                                <div className="p-8">
                                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                                        <Icon name="History" size={16} className="text-gray-400"/>
                                        Detalle de Comprobantes ({consolidatedClientRequests.length})
                                    </h4>
                                    <div className="overflow-x-auto border border-gray-100 rounded-3xl">
                                        <table className="min-w-full divide-y divide-gray-50">
                                            <thead className="bg-slate-50/50">
                                                <tr>
                                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Detección IA</th>
                                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                                                    <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Monto Total</th>
                                                    <th className="px-8 py-5"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-50">
                                                {consolidatedClientRequests.length === 0 ? (
                                                    <tr><td colSpan="5" className="text-center py-16 text-gray-400 font-bold italic">No se encontraron comprobantes para este cliente en el período seleccionado.</td></tr>
                                                ) : (
                                                    consolidatedClientRequests.map(req => {
                                                        const party = getPartyDetails(req);
                                                        return (
                                                        <React.Fragment key={req.id}>
                                                            <tr 
                                                                className={`hover:bg-blue-50/30 cursor-pointer transition-all ${expandedRowId === req.id ? 'bg-blue-50/30' : ''}`} 
                                                                onClick={() => toggleDetails(req.id)}
                                                            >
                                                                <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500">
                                                                    {req.timestamp?.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-widest">
                                                                            {req.isManualEntry ? 'Manual' : (req.aiData?.banco_receptor || 'Extraído')}
                                                                        </span>
                                                                        {party.isVenta ? (
                                                                            <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-full text-[9px] font-black uppercase tracking-wider">Venta</span>
                                                                        ) : party.tipoClasificacion === 'compra' ? (
                                                                            <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/80 rounded-full text-[9px] font-black uppercase tracking-wider">Compra</span>
                                                                        ) : (
                                                                            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[9px] font-black uppercase tracking-wider">Gasto</span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${req.status === 'completed' ? 'bg-blue-50 text-blue-700 border-blue-200/70' : 'bg-sky-50 text-sky-700 border-sky-200/70'}`}>
                                                                        {req.status === 'completed' ? 'Finalizado' : 'Pendiente'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-8 py-6 text-right font-black text-gray-900 text-base tracking-tight">
                                                                    {formatCurrency(req.aiData?.monto_total || req.manualData?.monto || 0)}
                                                                </td>
                                                                <td className="px-8 py-6 text-center">
                                                                    <Icon name={expandedRowId === req.id ? 'ChevronUp' : 'ChevronDown'} className="w-5 h-5 text-gray-300"/>
                                                                </td>
                                                            </tr>

                                                            {/* Expanded Detail View */}
                                                            {expandedRowId === req.id && (
                                                                <tr className="bg-blue-50/20">
                                                                    <td colSpan="5" className="p-0 border-b border-gray-100">
                                                                        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
                                                                            {/* Data Card */}
                                                                            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex flex-col justify-between">
                                                                                <div>
                                                                                    <div className="flex justify-between items-center mb-8">
                                                                                        <div>
                                                                                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Detalle Técnico Extraído</h4>
                                                                                            <span className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${party.isVenta ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                                                                                                {party.isVenta ? 'Ingreso Comercial / Venta' : `Egreso / ${party.tipoClasificacion === 'compra' ? 'Compra' : 'Gasto'}`}
                                                                                            </span>
                                                                                        </div>
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
                                                                                    
                                                                                    {/* Bloques de Contraparte y Cliente con Roles Invertidos */}
                                                                                    <div className="space-y-4 mb-8">
                                                                                        {/* Contraparte (Comprador o Proveedor) */}
                                                                                        <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                                                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                                                <Icon name={party.isVenta ? "ArrowUpRight" : "Store"} size={12}/> {party.contraparteLabel}
                                                                                            </p>
                                                                                            <div className="flex justify-between items-end">
                                                                                                <div>
                                                                                                    <p className="font-black text-gray-800 text-sm leading-tight">{party.contraparteNombre}</p>
                                                                                                    <p className="text-[10px] font-bold text-gray-400 font-mono mt-1">CUIT: {party.contraparteCuit}</p>
                                                                                                </div>
                                                                                                <div className="text-right">
                                                                                                    <p className="text-[9px] font-black text-gray-400 uppercase">{party.isVenta ? 'Origen' : 'Entidad'}</p>
                                                                                                    <p className="text-xs font-bold text-gray-700">{party.isVenta ? (req.aiData?.banco_origen || '-') : (req.aiData?.banco_receptor || req.aiData?.banco_origen || '-')}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {/* Cliente del Estudio */}
                                                                                        <div className={`${party.isVenta ? 'bg-gradient-to-r from-blue-700 to-blue-800 shadow-blue-500/10' : 'bg-gradient-to-r from-slate-800 via-blue-900 to-slate-900 shadow-blue-950/20'} p-4 rounded-2xl shadow-lg`}>
                                                                                            <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                                                <Icon name={party.isVenta ? "ArrowDownLeft" : "UserCheck"} size={12}/> {party.clienteLabel}
                                                                                            </p>
                                                                                            <div className="flex justify-between items-end">
                                                                                                <div>
                                                                                                    <p className="font-black text-white text-sm leading-tight">{party.clienteNombre}</p>
                                                                                                    <p className="text-[10px] font-bold text-blue-200 font-mono mt-1">
                                                                                                        CUIT: {party.clienteCuit}
                                                                                                        {getReceptorPhone(req) && ` | 📱 ${getReceptorPhone(req)}`}
                                                                                                    </p>
                                                                                                </div>
                                                                                                <div className="text-right">
                                                                                                    <p className="text-[9px] font-black text-blue-200 uppercase">{party.isVenta ? 'Destino' : 'Cuenta'}</p>
                                                                                                    <p className="text-xs font-bold text-white">{party.isVenta ? (req.aiData?.banco_receptor || '-') : (req.aiData?.banco_origen || '-')}</p>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                    
                                                                                    <div className="space-y-1">
                                                                                        <p className="text-[10px] font-black text-gray-400 uppercase">Concepto / Referencia</p>
                                                                                        <p className="text-sm font-medium text-gray-600 italic">"{req.aiData?.concepto_detectado || 'Sin descripción'}"</p>
                                                                                    </div>
                                                                                    {req.note && (
                                                                                        <div className="space-y-1 mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                                                                                            <p className="text-[10px] font-black text-blue-800 uppercase flex items-center gap-1.5">
                                                                                                <Icon name="FileText" size={12}/> Nota adicional (Cliente)
                                                                                            </p>
                                                                                            <p className="text-xs font-semibold text-blue-900">{req.note}</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                
                                                                                {req.requestImageUrl && (
                                                                                    <div className="mt-8 pt-6 border-t border-gray-50 flex justify-center">
                                                                                        <a href={req.requestImageUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:gap-4 transition-all">
                                                                                            Ver Comprobante Original <Icon name="ArrowRight" size={12}/>
                                                                                        </a>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Management Card */}
                                                                            <div className="bg-gray-100 p-8 rounded-[32px] border border-gray-200 flex flex-col justify-between">
                                                                                <div className="space-y-8">
                                                                                    <div className="flex justify-between items-center">
                                                                                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                                                                            {party.isVenta ? 'Gestión de Venta (A Facturar)' : 'Gestión de Egreso (Compra/Gasto)'}
                                                                                        </h4>
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
                                                                                        ) : party.isVenta ? (
                                                                                            /* Flujo de VENTAS: Emisión / Subida de Factura */
                                                                                            <div className="space-y-6">
                                                                                                <div className="space-y-3">
                                                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Subir Factura Final de Venta (PDF)</label>
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
                                                                                                {/* Toggle: Auto-registrar en Libro de Operaciones */}
                                                                                                <div 
                                                                                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                                                                                                        autoRegisterInBook 
                                                                                                            ? 'bg-indigo-50 border-indigo-200' 
                                                                                                            : 'bg-gray-50 border-gray-200'
                                                                                                    }`}
                                                                                                    onClick={() => setAutoRegisterInBook(!autoRegisterInBook)}
                                                                                                >
                                                                                                    <div className="flex items-center gap-2">
                                                                                                        <Icon name="BookOpen" size={14} className={autoRegisterInBook ? 'text-indigo-600' : 'text-gray-400'}/>
                                                                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${autoRegisterInBook ? 'text-indigo-700' : 'text-gray-500'}`}>
                                                                                                            Registrar en Libro de Operaciones
                                                                                                        </span>
                                                                                                    </div>
                                                                                                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${autoRegisterInBook ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${autoRegisterInBook ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="relative">
                                                                                                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                                                                                    <div className="relative flex justify-center text-[10px] font-black uppercase text-gray-400"><span className="bg-gray-100 px-3">O también</span></div>
                                                                                                </div>
                                                                                                <button 
                                                                                                    onClick={() => markAsDone(req.id)}
                                                                                                    className="w-full bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 py-3 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                                                                                                >
                                                                                                    <Icon name="Check" size={14}/> Completar sin Comprobante PDF
                                                                                                </button>
                                                                                            </div>
                                                                                        ) : (
                                                                                            /* Flujo de COMPRAS Y GASTOS: Imputación contable directa */
                                                                                            <div className="space-y-5">
                                                                                                <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/60 text-blue-950">
                                                                                                    <div className="flex items-center gap-2 mb-1">
                                                                                                        <Icon name="Info" size={16} className="text-blue-600 shrink-0"/>
                                                                                                        <p className="text-xs font-black uppercase tracking-wider">Egreso del Cliente</p>
                                                                                                    </div>
                                                                                                    <p className="text-xs text-blue-900/90 leading-relaxed font-medium">
                                                                                                        Este comprobante corresponde a un gasto o compra del cliente. Al confirmarlo, se asentará directamente en su Libro de Operaciones contable.
                                                                                                    </p>
                                                                                                </div>

                                                                                                <button 
                                                                                                    onClick={() => markAsDone(req.id)}
                                                                                                    className="w-full bg-gradient-to-r from-blue-700 to-sky-700 hover:from-blue-800 hover:to-sky-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                                                                                >
                                                                                                    <Icon name="CheckCircle" size={16}/> Confirmar e Imputar en Libro de Compras
                                                                                                </button>

                                                                                                <div className="pt-2 border-t border-gray-200">
                                                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1 mb-2">
                                                                                                        Adjuntar Factura de Proveedor (Opcional)
                                                                                                    </label>
                                                                                                    <div className="flex gap-2">
                                                                                                        <label className="flex-1 cursor-pointer">
                                                                                                            <div className="w-full bg-white px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 flex items-center justify-between truncate hover:border-blue-200 transition-all">
                                                                                                                <span className="truncate">{invoiceFile ? invoiceFile.name : 'Factura oficial (PDF)'}</span>
                                                                                                                <Icon name="FileText" size={14}/>
                                                                                                            </div>
                                                                                                            <input type="file" className="hidden" onChange={(e) => setInvoiceFile(e.target.files[0])} accept=".pdf"/>
                                                                                                        </label>
                                                                                                        {invoiceFile && (
                                                                                                            <button 
                                                                                                                onClick={() => handleCompleteRequest(req.id)} 
                                                                                                                disabled={uploading}
                                                                                                                className="bg-blue-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-blue-800 transition-all cursor-pointer"
                                                                                                            >
                                                                                                                {uploading ? '...' : 'Guardar PDF'}
                                                                                                            </button>
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        )
                                                                                    ) : (
                                                                                        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                                                                                            <div className="flex items-center gap-3 text-green-600">
                                                                                                <div className="p-1.5 bg-green-100 rounded-lg">
                                                                                                    <Icon name="CheckCircle" size={16} />
                                                                                                </div>
                                                                                                <span className="text-xs font-black uppercase tracking-wider">
                                                                                                    {party.isVenta ? 'Facturado Exitosamente' : 'Imputado en Libro de Compras'}
                                                                                                </span>
                                                                                            </div>
                                                                                            <div className="flex gap-2.5 pt-2 items-center">
                                                                                                {req.invoiceUrl ? (
                                                                                                    <a 
                                                                                                        href={req.invoiceUrl} 
                                                                                                        target="_blank" 
                                                                                                        rel="noreferrer"
                                                                                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md shadow-blue-100 flex items-center justify-center gap-2"
                                                                                                    >
                                                                                                        <Icon name="Download" size={14}/> {party.isVenta ? 'Descargar Factura' : 'Descargar Factura Proveedor'}
                                                                                                    </a>
                                                                                                ) : (
                                                                                                    <p className="flex-1 text-xs text-gray-500 font-bold italic">
                                                                                                        {party.isVenta ? 'Completado sin comprobante PDF.' : 'Asentado contablemente sin PDF adjunto.'}
                                                                                                    </p>
                                                                                                )}
                                                                                                <button 
                                                                                                    onClick={() => sendWhatsAppNotification(req)}
                                                                                                    className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-xl transition-all shadow-md shadow-green-100 cursor-pointer flex items-center justify-center gap-2 px-4 py-3"
                                                                                                    title="Notificar por WhatsApp"
                                                                                                >
                                                                                                    <Icon name="MessageCircle" size={16}/>
                                                                                                    {!req.invoiceUrl && <span className="text-[10px] font-black uppercase tracking-widest">Notificar</span>}
                                                                                                </button>
                                                                                            </div>
                                                                                            {!req.exportedToOperations && (
                                                                                                <button 
                                                                                                    onClick={() => handleExportToOperations(req)} 
                                                                                                    className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-indigo-200 flex items-center justify-center gap-2 mt-2"
                                                                                                >
                                                                                                    <Icon name="BookOpen" size={14}/> Asentar en Libro de Operaciones
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                                
                                                                                <div className="mt-8 pt-6 border-t border-gray-200 flex justify-between items-center">
                                                                                    <div className="text-[10px] text-gray-400 font-bold">Solicitado por: <span className="font-extrabold text-gray-700">{req.userName}</span></div>
                                                                                    <button 
                                                                                        onClick={() => setRequestToDelete(req.id)}
                                                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 p-2 rounded-xl transition-colors cursor-pointer"
                                                                                        title="Eliminar Registro"
                                                                                    >
                                                                                        <Icon name="Trash2" size={16}/>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <table className="min-w-full divide-y divide-gray-50">
                                <thead className="bg-white">
                                    <tr>
                                        <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente / Razón Social</th>
                                        <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">CUIT</th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Facturado</th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pendiente</th>
                                        <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Comprobantes</th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Último Movimiento</th>
                                        <th className="px-8 py-5"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {loading ? (
                                        <tr><td colSpan="7" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando consolidado...</td></tr>
                                    ) : clientBillingSummary.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-24 text-gray-400 font-bold italic">No se encontraron clientes.</td></tr>
                                    ) : (
                                        clientBillingSummary.map(client => (
                                            <tr key={client.key} className="hover:bg-blue-50/30 transition-all">
                                                <td className="px-8 py-6 whitespace-nowrap">
                                                    <div className="text-sm font-black text-gray-900 leading-tight">{client.name}</div>
                                                </td>
                                                <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500 font-mono">
                                                    {client.cuit}
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="text-sm font-black text-green-600 tracking-tight">
                                                        {formatCurrency(client.totalFacturado)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="text-sm font-black text-yellow-600 tracking-tight">
                                                        {formatCurrency(client.totalPendiente)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-center whitespace-nowrap text-sm font-bold text-gray-500">
                                                    {client.count}
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap text-sm font-semibold text-gray-500">
                                                    {client.lastActivity ? client.lastActivity.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleInspectClient(client, 'dashboard')}
                                                            className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest px-3 py-2 rounded-xl transition-all shadow-xs active:scale-95 flex items-center gap-1 cursor-pointer"
                                                            title="Ir directamente al Dashboard de este cliente"
                                                        >
                                                            <Icon name="LayoutDashboard" size={12}/> Dashboard
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setSelectedConsolidatedClient(client);
                                                            }}
                                                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] uppercase tracking-widest px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                                                        >
                                                            Ver Detalle
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )
                    ) : (
                        <table className="min-w-full divide-y divide-gray-50">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                    <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                        {activeModule === 'ventas' ? 'Cliente (Vendedor)' : activeModule === 'compras_gastos' ? 'Cliente (Titular Egreso)' : 'Cliente / Sujeto'}
                                    </th>
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
                                ) : filteredRequests.map(req => {
                                    const party = getPartyDetails(req);
                                    const hasAIError = req.status === 'error' || (Boolean(req.aiError) && !req.aiData);
                                    const isReanalyzing = reanalyzingId === req.id;
                                    const isAIAnalyzing = (req.status === 'pending' && !req.aiData && !req.isManualEntry && !hasAIError) || isReanalyzing;

                                    return (
                                    <React.Fragment key={req.id}>
                                        <tr 
                                            className={`hover:bg-blue-50/50 cursor-pointer transition-all ${expandedRowId === req.id ? 'bg-blue-50/50' : ''}`} 
                                            onClick={() => toggleDetails(req.id)}
                                        >
                                            <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500">
                                                {isAIAnalyzing ? (
                                                    <div className="h-4 bg-gray-100 rounded-lg w-20 animate-pulse"></div>
                                                ) : (
                                                    req.timestamp?.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                                )}
                                            </td>
                                            <td className="px-8 py-6">
                                                {isAIAnalyzing ? (
                                                    <div className="space-y-2">
                                                        <div className="h-4 bg-blue-50 rounded-lg w-32 animate-pulse"></div>
                                                        <div className="h-3 bg-gray-50 rounded-lg w-24 animate-pulse"></div>
                                                    </div>
                                                ) : hasAIError ? (
                                                    <div>
                                                        <div className="text-sm font-black text-gray-900 leading-tight">{party.clienteNombre}</div>
                                                        <div className="text-[10px] text-amber-600 font-bold flex items-center gap-1 mt-0.5">
                                                            <Icon name="AlertTriangle" size={11} /> Pendiente de reanálisis IA
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="text-sm font-black text-gray-900 leading-tight">{party.clienteNombre}</div>
                                                        <div className="text-[10px] text-gray-400 font-black uppercase tracking-tighter mt-0.5">
                                                            CUIT: {party.clienteCuit}
                                                        </div>
                                                        {party.contraparteNombre && party.contraparteNombre !== 'Desconocido' && (
                                                            <div className="text-[10px] text-gray-500 font-medium truncate max-w-[200px] mt-0.5">
                                                                <span className="font-bold text-gray-400">{party.isVenta ? 'Comprador:' : 'Proveedor:'}</span> {party.contraparteNombre}
                                                            </div>
                                                        )}
                                                        {req.note && (
                                                            <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50/50 px-2 py-0.5 rounded-lg w-fit border border-blue-100/50">
                                                                <Icon name="MessageSquare" size={10}/>
                                                                <span className="truncate max-w-[150px]">{req.note}</span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-8 py-6">
                                                {isReanalyzing ? (
                                                    <div className="flex items-center gap-2.5 text-indigo-600 animate-pulse">
                                                        <div className="p-1.5 bg-indigo-50 rounded-lg">
                                                            <Icon name="RefreshCw" className="w-4 h-4 animate-spin" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Reanalizando IA...</span>
                                                    </div>
                                                ) : isAIAnalyzing ? (
                                                    <div className="flex items-center gap-3 text-blue-600 animate-pulse">
                                                        <div className="p-1.5 bg-blue-100 rounded-lg">
                                                            <Icon name="Cpu" className="w-4 h-4 animate-spin" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">IA Analizando...</span>
                                                    </div>
                                                ) : hasAIError ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                            <Icon name="AlertCircle" size={12} className="text-amber-500" /> Error en IA
                                                        </span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleReanalyze(req);
                                                            }}
                                                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
                                                            title="Reintentar análisis con IA"
                                                        >
                                                            <Icon name="RefreshCw" size={10} /> Reintentar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {/* Badge de Origen WhatsApp */}
                                                        {req.source === 'whatsapp' && (
                                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                                                <Icon name="MessageCircle" size={10} /> WA
                                                            </span>
                                                        )}
                                                        {/* Badge de Clasificación Contable */}
                                                        {(() => {
                                                            const tipo = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
                                                            if (tipo === 'gasto') {
                                                                return <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[9px] font-black uppercase tracking-wider">Gasto</span>;
                                                            } else if (tipo === 'compra') {
                                                                return <span className="px-2.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200/80 rounded-full text-[9px] font-black uppercase tracking-wider">Compra</span>;
                                                            } else {
                                                                return <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200/80 rounded-full text-[9px] font-black uppercase tracking-wider">Venta/Cobro</span>;
                                                            }
                                                        })()}
                                                        {/* Badge de Banco / Manual */}
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[9px] font-bold uppercase tracking-wider">
                                                            {req.isManualEntry ? 'Manual' : (req.aiData?.banco_receptor || 'Extraído')}
                                                        </span>
                                                        {/* Badge Sin Asignar */}
                                                        {(req.userId === 'unassigned' || req.status === 'unassigned') && (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                                                                Sin Asignar
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                {isAIAnalyzing ? (
                                                    <div className="h-5 bg-blue-50 rounded-lg w-24 ml-auto animate-pulse"></div>
                                                ) : req.status === 'duplicate' ? (
                                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600 border border-red-100 uppercase tracking-widest">
                                                        <Icon name="AlertTriangle" className="w-3 h-3 mr-1"/> Duplicado
                                                    </span>
                                                ) : hasAIError && !req.aiData?.monto_total ? (
                                                    <div className="text-xs font-bold text-gray-400">
                                                        {req.manualData?.monto ? formatCurrency(req.manualData.monto) : 'Sin calcular'}
                                                    </div>
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
                                            <tr className="bg-blue-50/20">
                                                <td colSpan="5" className="p-0 border-b border-gray-100">
                                                    <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-300">
                                                        {/* Data Card */}
                                                        <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex flex-col justify-between">
                                                            <div>
                                                                <div className="flex justify-between items-center mb-8">
                                                                    <div>
                                                                        <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Detalle Técnico Extraído</h4>
                                                                        <span className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${party.isVenta ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                                                                            {party.isVenta ? 'Ingreso Comercial / Venta' : `Egreso / ${party.tipoClasificacion === 'compra' ? 'Compra' : 'Gasto'}`}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleReanalyze(req);
                                                                            }}
                                                                            disabled={isReanalyzing}
                                                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-blue-700 hover:bg-blue-50 border border-blue-100 transition-all disabled:opacity-50"
                                                                            title="Volver a analizar con IA Gemini 3.5 Flash Lite"
                                                                        >
                                                                            <Icon name="RefreshCw" size={13} className={isReanalyzing ? 'animate-spin' : ''}/> 
                                                                            {isReanalyzing ? 'Analizando...' : 'Reanalizar IA'}
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => openEditModal(req)} 
                                                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAIAnalyzing && !hasAIError ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50'}`}
                                                                        >
                                                                            <Icon name="Edit" size={14}/> {isAIAnalyzing && !hasAIError ? 'Procesando...' : 'Corregir'}
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {(hasAIError || req.aiError) && (
                                                                    <div className="mb-6 p-4 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
                                                                        <div className="flex items-start gap-2.5 text-xs">
                                                                            <Icon name="AlertTriangle" size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                                                            <div>
                                                                                <span className="font-black block text-amber-950">Inconveniente al procesar con IA:</span>
                                                                                <span className="text-amber-800 text-[11px] font-mono">{req.aiError || 'El análisis inicial no pudo completarse.'}</span>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleReanalyze(req);
                                                                            }}
                                                                            disabled={isReanalyzing}
                                                                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shrink-0 shadow-sm disabled:opacity-50"
                                                                        >
                                                                            <Icon name="RefreshCw" size={13} className={isReanalyzing ? 'animate-spin' : ''} />
                                                                            {isReanalyzing ? 'Reanalizando...' : 'Reintentar Análisis'}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fecha de Pago</p>
                                                                        <p className="font-bold text-gray-800 text-sm">{req.aiData?.fecha_pago || 'S/D'}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Tipo</p>
                                                                        <p className="font-bold text-gray-800 text-sm">{req.aiData?.tipo_comprobante || 'S/D'}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Plataforma / App</p>
                                                                        <p className="font-bold text-blue-700 text-sm">
                                                                            {(() => {
                                                                                const app = req.aiData?.aplicacion_pago;
                                                                                if (app && app.toLowerCase() !== 'otro') return app;
                                                                                return req.aiData?.banco_receptor || 'Otro';
                                                                            })()}
                                                                        </p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">N.° Operación</p>
                                                                        <p className="font-bold text-gray-800 font-mono text-xs truncate" title={req.aiData?.numero_operacion}>{req.aiData?.numero_operacion || 'S/D'}</p>
                                                                    </div>
                                                                </div>

                                                                {req.aiData?.codigo_identificacion && (
                                                                    <div className="mb-6 bg-blue-50/50 px-4 py-3 rounded-2xl border border-blue-100 flex items-center justify-between gap-3 shadow-xs">
                                                                        <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                                                                            <Icon name="Key" size={13} className="text-blue-600"/> Código Identificación Único:
                                                                        </span>
                                                                        <span className="font-mono text-xs font-black text-blue-950 bg-white px-2.5 py-1 rounded-lg border border-blue-200 select-all truncate">
                                                                            {req.aiData.codigo_identificacion}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Bloques de Contraparte y Cliente con Roles Invertidos */}
                                                                <div className="space-y-4 mb-8">
                                                                    {/* Contraparte (Comprador o Proveedor) */}
                                                                    <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                            <Icon name={party.isVenta ? "ArrowUpRight" : "Store"} size={12}/> {party.contraparteLabel}
                                                                        </p>
                                                                        <div className="flex justify-between items-end">
                                                                            <div>
                                                                                <p className="font-black text-gray-800 text-sm leading-tight">{party.contraparteNombre}</p>
                                                                                <p className="text-[10px] font-bold text-gray-400 font-mono mt-1">CUIT: {party.contraparteCuit}</p>
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <p className="text-[9px] font-black text-gray-400 uppercase">{party.isVenta ? 'Origen' : 'Entidad'}</p>
                                                                                <p className="text-xs font-bold text-gray-700">{party.isVenta ? (req.aiData?.banco_origen || '-') : (req.aiData?.banco_receptor || req.aiData?.banco_origen || '-')}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Cliente del Estudio */}
                                                                    <div className={`${party.isVenta ? 'bg-gradient-to-r from-blue-700 to-blue-800 shadow-blue-500/10' : 'bg-gradient-to-r from-slate-800 via-blue-900 to-slate-900 shadow-blue-950/20'} p-4 rounded-2xl shadow-lg`}>
                                                                        <p className="text-[10px] font-black text-blue-100 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                            <Icon name={party.isVenta ? "ArrowDownLeft" : "UserCheck"} size={12}/> {party.clienteLabel}
                                                                        </p>
                                                                        <div className="flex justify-between items-end">
                                                                            <div>
                                                                                <p className="font-black text-white text-sm leading-tight">{party.clienteNombre}</p>
                                                                                <p className="text-[10px] font-bold text-blue-200 font-mono mt-1">
                                                                                    CUIT: {party.clienteCuit}
                                                                                    {getReceptorPhone(req) && ` | 📱 ${getReceptorPhone(req)}`}
                                                                                </p>
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <p className="text-[9px] font-black text-blue-200 uppercase">{party.isVenta ? 'Destino' : 'Cuenta'}</p>
                                                                                <p className="text-xs font-bold text-white">{party.isVenta ? (req.aiData?.banco_receptor || '-') : (req.aiData?.banco_origen || '-')}</p>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="space-y-1">
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase">Concepto / Referencia</p>
                                                                    <p className="text-sm font-medium text-gray-600 italic">"{req.aiData?.concepto_detectado || 'Sin descripción'}"</p>
                                                                </div>

                                                                {/* Justificación de Clasificación IA y Selector Rápido */}
                                                                <div className="mt-4 p-4 bg-blue-50/40 rounded-2xl border border-blue-100/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                                    <div className="space-y-1">
                                                                        <p className="text-[10px] font-black text-blue-900 uppercase flex items-center gap-1.5">
                                                                            <Icon name="Cpu" size={13}/> Clasificación IA: <span className="font-extrabold underline tracking-wide">{(req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta').toUpperCase()}</span>
                                                                        </p>
                                                                        <p className="text-xs text-blue-950/90 leading-relaxed font-medium">{req.aiData?.justificacion_clasificacion || 'Comprobante procesado por IA.'}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5 shrink-0 bg-white p-1.5 rounded-xl border border-blue-200/60 shadow-xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase px-1">Cambiar a:</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); handleQuickChangeClasificacion(req.id, 'venta'); }}
                                                                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                                                                (req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta') === 'venta'
                                                                                    ? 'bg-blue-600 text-white shadow-xs'
                                                                                    : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
                                                                            }`}
                                                                            title="Marcar como Venta / Cobro"
                                                                        >
                                                                            Venta
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); handleQuickChangeClasificacion(req.id, 'compra'); }}
                                                                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                                                                (req.clasificacionContable || req.aiData?.clasificacion_contable) === 'compra'
                                                                                    ? 'bg-sky-600 text-white shadow-xs'
                                                                                    : 'text-slate-600 hover:text-sky-700 hover:bg-sky-50'
                                                                            }`}
                                                                            title="Marcar como Compra"
                                                                        >
                                                                            Compra
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => { e.stopPropagation(); handleQuickChangeClasificacion(req.id, 'gasto'); }}
                                                                            className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                                                                                (req.clasificacionContable || req.aiData?.clasificacion_contable) === 'gasto'
                                                                                    ? 'bg-slate-700 text-white shadow-xs'
                                                                                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                                                                            }`}
                                                                            title="Marcar como Gasto"
                                                                        >
                                                                            Gasto
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {req.note && (
                                                                    <div className="space-y-1 mt-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100/50">
                                                                        <p className="text-[10px] font-black text-blue-800 uppercase flex items-center gap-1.5">
                                                                            <Icon name="FileText" size={12}/> Nota adicional (Cliente)
                                                                        </p>
                                                                        <p className="text-xs font-semibold text-blue-900">{req.note}</p>
                                                                    </div>
                                                                )}
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
                                                                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                                                                        {party.isVenta ? 'Gestión de Venta (A Facturar)' : 'Gestión de Egreso (Compra/Gasto)'}
                                                                    </h4>
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
                                                                    ) : party.isVenta ? (
                                                                        /* Flujo de VENTAS: Subida de Factura o Marcar como Facturado */
                                                                        <div className="space-y-6">
                                                                            <div className="space-y-3">
                                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1">Subir Factura Final de Venta (PDF)</label>
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
                                                                                {/* Toggle: Auto-registrar en Libro de Operaciones */}
                                                                                <div 
                                                                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none ${
                                                                                        autoRegisterInBook 
                                                                                            ? 'bg-indigo-50 border-indigo-200' 
                                                                                            : 'bg-gray-50 border-gray-200'
                                                                                    }`}
                                                                                    onClick={() => setAutoRegisterInBook(!autoRegisterInBook)}
                                                                                >
                                                                                    <div className="flex items-center gap-2">
                                                                                        <Icon name="BookOpen" size={14} className={autoRegisterInBook ? 'text-indigo-600' : 'text-gray-400'}/>
                                                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${autoRegisterInBook ? 'text-indigo-700' : 'text-gray-500'}`}>
                                                                                            Registrar en Libro de Operaciones
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${autoRegisterInBook ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                                                                                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${autoRegisterInBook ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="relative">
                                                                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                                                                <div className="relative flex justify-center text-[10px] font-black uppercase text-gray-400"><span className="bg-gray-100 px-3">O también</span></div>
                                                                            </div>
                                                                            <button 
                                                                                onClick={() => markAsDone(req.id)} 
                                                                                className="w-full bg-white text-gray-700 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm border border-gray-200 flex items-center justify-center gap-2"
                                                                            >
                                                                                <Icon name="Check" size={14}/> Marcar como Facturado
                                                                            </button>

                                                                            {/* Si está sin asignar, botón prioritario para asignar cliente */}
                                                                            {(req.userId === 'unassigned' || req.status === 'unassigned') && userData?.isAdmin && (
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        setAssigningRequest(req);
                                                                                        setSelectedAssignUserId('');
                                                                                    }}
                                                                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-amber-100 flex items-center justify-center gap-2 animate-bounce"
                                                                                >
                                                                                    <Icon name="UserPlus" size={14}/> Asignar Cliente a este Comprobante
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        /* Flujo de COMPRAS Y GASTOS: Imputación contable directa */
                                                                        <div className="space-y-5">
                                                                            <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/60 text-blue-950">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <Icon name="Info" size={16} className="text-blue-600 shrink-0"/>
                                                                                    <p className="text-xs font-black uppercase tracking-wider">Egreso del Cliente</p>
                                                                                </div>
                                                                                <p className="text-xs text-blue-900/90 leading-relaxed font-medium">
                                                                                    Este comprobante corresponde a un gasto o compra del cliente. Al confirmarlo, se asentará directamente en su Libro de Operaciones contable.
                                                                                </p>
                                                                            </div>

                                                                            <button 
                                                                                onClick={() => markAsDone(req.id)}
                                                                                className="w-full bg-gradient-to-r from-blue-700 to-sky-700 hover:from-blue-800 hover:to-sky-800 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
                                                                            >
                                                                                <Icon name="CheckCircle" size={16}/> Confirmar e Imputar en Libro de Compras
                                                                            </button>

                                                                            <div className="pt-2 border-t border-gray-200">
                                                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-1 mb-2">
                                                                                    Adjuntar Factura de Proveedor (Opcional)
                                                                                </label>
                                                                                <div className="flex gap-2">
                                                                                    <label className="flex-1 cursor-pointer">
                                                                                        <div className="w-full bg-white px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 flex items-center justify-between truncate hover:border-blue-200 transition-all">
                                                                                            <span className="truncate">{invoiceFile ? invoiceFile.name : 'Factura oficial (PDF)'}</span>
                                                                                            <Icon name="FileText" size={14}/>
                                                                                        </div>
                                                                                        <input type="file" className="hidden" onChange={(e) => setInvoiceFile(e.target.files[0])} accept=".pdf"/>
                                                                                    </label>
                                                                                    {invoiceFile && (
                                                                                        <button 
                                                                                            onClick={() => handleCompleteRequest(req.id)} 
                                                                                            disabled={uploading}
                                                                                            className="bg-blue-700 text-white px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider hover:bg-blue-800 transition-all cursor-pointer"
                                                                                        >
                                                                                            {uploading ? '...' : 'Guardar PDF'}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* Si está sin asignar, botón prioritario para asignar cliente */}
                                                                            {(req.userId === 'unassigned' || req.status === 'unassigned') && userData?.isAdmin && (
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        setAssigningRequest(req);
                                                                                        setSelectedAssignUserId('');
                                                                                    }}
                                                                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md shadow-amber-100 flex items-center justify-center gap-2 animate-bounce"
                                                                                >
                                                                                    <Icon name="UserPlus" size={14}/> Asignar Cliente a este Comprobante
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                ) : (
                                                                    <div className="bg-white p-8 rounded-[24px] shadow-sm border border-gray-200/50 space-y-4">
                                                                        <div>
                                                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">
                                                                                {party.isVenta ? 'Comprobante de Factura' : 'Factura de Proveedor'}
                                                                            </p>
                                                                            {req.invoiceUrl ? (
                                                                                <a href={req.invoiceUrl} target="_blank" className="font-bold text-blue-600 hover:underline flex items-center gap-2">
                                                                                    <Icon name="FileText" size={16}/> {party.isVenta ? 'Factura Subida' : 'Factura Proveedor Subida'}
                                                                                </a>
                                                                            ) : (
                                                                                <p className="text-gray-500 font-bold italic">
                                                                                    {party.isVenta ? 'Facturado sin comprobante físico' : 'Imputado contablemente sin PDF adjunto'}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        {req.completedAt && (
                                                                            <div>
                                                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fecha de Registro</p>
                                                                                <p className="font-bold text-gray-800 text-xs">{req.completedAt.toDate().toLocaleString('es-AR')}</p>
                                                                            </div>
                                                                        )}
                                                                        {req.invoiceUrl && (
                                                                            <div className="pt-2">
                                                                                <a 
                                                                                    href={req.invoiceUrl} 
                                                                                    download 
                                                                                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all"
                                                                                >
                                                                                    <Icon name="DownloadCloud" size={18}/> Descargar Comprobante PDF
                                                                                </a>
                                                                            </div>
                                                                        )}

                                                                        {!req.exportedToOperations && (
                                                                            <button 
                                                                                onClick={() => handleExportToOperations(req)} 
                                                                                className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-indigo-200 flex items-center justify-center gap-2 mt-2"
                                                                            >
                                                                                <Icon name="BookOpen" size={14}/> Asentar en Libro de Operaciones
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="space-y-3 mt-8">
                                                                    <button 
                                                                        onClick={() => sendWhatsAppNotification(req)} 
                                                                        className="w-full bg-green-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-600 transition-all shadow-lg shadow-green-100 flex items-center justify-center gap-3"
                                                                    >
                                                                        <Icon name="MessageCircle" size={18}/> Notificar por WhatsApp
                                                                    </button>
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
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
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
            
            {/* Modal de Creación (Nivel Completo con Drag & Drop y Lightbox) */}
            {showModal && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div className="bg-white rounded-[32px] shadow-2xl max-w-lg w-full p-8 animate-in fade-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto relative">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Nueva Solicitud</h3>
                                <p className="text-gray-500 text-sm font-medium mt-1">Sube uno o varios comprobantes para análisis IA o registra un pago manual.</p>
                            </div>
                            <button onClick={resetModalState} disabled={uploading} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl transition-all disabled:opacity-50">
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

                        <form onSubmit={handleCreateRequest} className="space-y-5">
                            {createMode === 'file' ? (
                                <div className="space-y-4">
                                    {/* Zona de Drop / Selección con Drag & Drop Interactivo */}
                                    {newRequestFiles.length === 0 ? (
                                        <label 
                                            className="group block"
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
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
                                                onChange={handleFileSelection} 
                                                accept="image/jpeg,image/png,image/webp,application/pdf"
                                                disabled={uploading}
                                            />
                                        </label>
                                    ) : (
                                        <div 
                                            className="space-y-3"
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
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
                                                            onChange={handleFileSelection} 
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
                                                                    onClick={() => handleRemoveFile(item.id)} 
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
                                    onClick={resetModalState} 
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
                                                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' 
                                                : 'bg-purple-50/70 border-purple-200 text-purple-800'
                                        }`}>
                                            <Icon name="Info" size={16} className="shrink-0"/>
                                            <span>
                                                {isVenta 
                                                    ? 'En Ventas: el Emisor es el Comprador y el Receptor es el Cliente del Estudio (quien factura).' 
                                                    : 'En Compras/Gastos: el Emisor de fondos es el Cliente del Estudio (quien incurre en el egreso) y el Receptor es el Proveedor.'}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <section>
                                                <div className="flex items-center gap-3 mb-6">
                                                    <div className={`w-1.5 h-6 rounded-full ${isVenta ? 'bg-gray-400' : 'bg-purple-600'}`}></div>
                                                    <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isVenta ? 'text-gray-400' : 'text-purple-700'}`}>
                                                        {isVenta ? 'Emisor Original (Comprador)' : 'Emisor de Fondos (Cliente Titular)'}
                                                    </h4>
                                                </div>
                                                <div className={`${isVenta ? 'bg-gray-50 border-gray-100' : 'bg-purple-50/40 border-purple-100'} p-8 rounded-[32px] border space-y-5`}>
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
                                                    <div className={`w-1.5 h-6 rounded-full ${isVenta ? 'bg-blue-500' : 'bg-gray-400'}`}></div>
                                                    <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isVenta ? 'text-blue-600' : 'text-gray-500'}`}>
                                                        {isVenta ? 'Receptor (Cliente del Estudio)' : 'Receptor / Proveedor (Destino)'}
                                                    </h4>
                                                </div>
                                                <div className={`${isVenta ? 'bg-blue-50/50 border-blue-100' : 'bg-gray-50 border-gray-100'} p-8 rounded-[32px] border space-y-5`}>
                                                    <div className="space-y-2">
                                                        <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-600' : 'text-gray-500'}`}>Nombre / Razón Social</label>
                                                        <input value={editFormData.nombre_receptor} onChange={e => setEditFormData({...editFormData, nombre_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-600' : 'text-gray-500'}`}>WhatsApp Notificación</label>
                                                        <div className="relative">
                                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">📱</span>
                                                            <input type="tel" placeholder="549..." value={editFormData.userPhone} onChange={e => setEditFormData({...editFormData, userPhone: e.target.value})} className="w-full pl-12 pr-4 py-3 bg-white border-2 border-blue-100 focus:border-blue-300 rounded-xl transition-all outline-none font-black text-blue-800 shadow-sm"/>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-600' : 'text-gray-500'}`}>CUIT</label>
                                                            <input value={editFormData.cuit_receptor} onChange={e => setEditFormData({...editFormData, cuit_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className={`text-[10px] font-black uppercase px-1 ${isVenta ? 'text-blue-600' : 'text-gray-500'}`}>Banco / Billetera</label>
                                                            <input value={editFormData.banco_receptor} onChange={e => setEditFormData({...editFormData, banco_receptor: e.target.value})} className="w-full p-3 bg-white border-transparent rounded-xl transition-all outline-none font-bold text-gray-900 shadow-sm"/>
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

            {/* Modal de Asignación de Cliente en 1 Clic (Para comprobantes WhatsApp unassigned) */}
            {assigningRequest && (
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
                            <button onClick={() => setAssigningRequest(null)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl">
                                <Icon name="X" size={20}/>
                            </button>
                        </div>

                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 mb-6 space-y-2 text-xs">
                            <div className="flex justify-between text-gray-600">
                                <span className="font-bold">Remitente WhatsApp:</span>
                                <span className="font-mono">{assigningRequest.senderPhone || assigningRequest.userPhone || 'S/D'}</span>
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
                                onClick={() => setAssigningRequest(null)}
                                className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:bg-gray-50 rounded-xl transition-all"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleAssignClient}
                                disabled={!selectedAssignUserId}
                                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-100 transition-all disabled:opacity-50"
                            >
                                Asignar Ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Conexión y Vinculación WhatsApp */}
            {showWhatsAppModal && <WhatsAppConnectionModal onClose={() => setShowWhatsAppModal(false)} />}
        </div>
    );
};

export default BillingRequestsPage;
