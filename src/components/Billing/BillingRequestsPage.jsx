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
  getDocs,
  Timestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import Icon from '../Common/Icon';
import ConfirmModal from '../Common/ConfirmModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { openWhatsApp, cleanWhatsAppNumber } from '../../utils/whatsapp';
import WhatsAppConnectionModal from './Modals/WhatsAppConnectionModal';
import CreateBillingRequestModal from './Modals/CreateBillingRequestModal';
import EditBillingRequestModal from './Modals/EditBillingRequestModal';
import AssignClientModal from './Modals/AssignClientModal';
import {
    MONTHS,
    MAX_FILES,
    MAX_FILE_SIZE,
    MAX_TOTAL_SIZE,
    SAFE_IMAGE_MIMES,
    SAFE_IMAGE_EXTS,
    parseAmount,
    parseLocalDate,
    checkSuspiciousDate,
    cleanCuit,
    formatCurrency
} from '../../utils/billingUtils';

const BillingRequestsPage = ({ navigate }) => {
    const { user, userData } = useAuth();
    const { 
        clients, 
        clientList, 
        selectClientById, 
        setActiveEntity, 
        activeEntity, 
        targetUserId, 
        isViewingClient 
    } = useClientSelection();

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
    const [periodPreset, setPeriodPreset] = useState('mes_actual'); // 'mes_actual' | 'mes_anterior' | 'ultimos_12_meses' | 'anio_actual' | 'personalizado' | 'especifico' | 'todos'
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [selectedYear, setSelectedYear] = useState('todos');
    const [selectedMonth, setSelectedMonth] = useState('todos');
    const [selectedConsolidatedClient, setSelectedConsolidatedClient] = useState(null);

    // Gestión de Terceros del estudio contable para matching y alta rápida
    const [tercerosList, setTercerosList] = useState([]);
    const [creatingTerceroCuit, setCreatingTerceroCuit] = useState(null);

    useEffect(() => {
        if (!user?.uid) return;
        const qTerceros = query(collection(db, 'users', user.uid, 'terceros'));
        const unsubscribe = onSnapshot(qTerceros, (snapshot) => {
            const items = snapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));
            setTercerosList(items);
        }, (err) => {
            console.error("Error al cargar terceros en facturación:", err);
        });
        return () => unsubscribe();
    }, [user?.uid]);

    const tercerosByCuit = useMemo(() => {
        const map = {};
        tercerosList.forEach(t => {
            const c = cleanCuit(t.cuit);
            if (c && c.length >= 10) {
                map[c] = t;
            }
        });
        return map;
    }, [tercerosList]);

    // Alta rápida de un cliente en Gestión de Terceros
    const handleCreateTerceroQuick = async (clientData) => {
        if (!user?.uid) return;
        const cNorm = cleanCuit(clientData.cuit);
        if (!cNorm || cNorm.length < 10) {
            alert("No se puede registrar sin un CUIT válido.");
            return;
        }
        setCreatingTerceroCuit(cNorm);
        try {
            const dataToSave = {
                nombre: (clientData.name || clientData.nombre || 'Nuevo Cliente').trim(),
                cuit: clientData.cuit || '',
                email: clientData.email || '',
                telefono: clientData.phone || clientData.telefono || '',
                tipo: 'Cliente',
                createdAt: Timestamp.now()
            };
            await addDoc(collection(db, 'users', user.uid, 'terceros'), dataToSave);
            alert(`✅ Cliente "${dataToSave.nombre}" dado de alta con éxito en Gestión de Terceros.`);
        } catch (err) {
            console.error("Error al crear cliente en Gestión de Terceros:", err);
            alert("Error al dar de alta el cliente en Gestión: " + (err.message || ''));
        } finally {
            setCreatingTerceroCuit(null);
        }
    };

    const handleInspectClient = (clientObj, destination = 'dashboard') => {
        if (!clientObj) return;
        const rawCuit = cleanCuit(clientObj.cuit);
        const clientPool = clients || clientList || [];
        const matchedClient = clientPool.find(c => {
            const cCuit = cleanCuit(c.cuit);
            if (clientObj.terceroId && (c.id === clientObj.terceroId || c.terceroId === clientObj.terceroId)) return true;
            if (clientObj.userId && c.id === clientObj.userId) return true;
            if (rawCuit && rawCuit.length >= 10 && cCuit && rawCuit === cCuit) return true;
            if (c.name && clientObj.name && c.name.toLowerCase().trim() === clientObj.name.toLowerCase().trim()) return true;
            return false;
        });

        if (matchedClient) {
            setActiveEntity(matchedClient);
        } else {
            setActiveEntity({
                id: clientObj.terceroId || clientObj.userId || clientObj.key || 'client_temp',
                name: clientObj.name,
                cuit: clientObj.cuit || '',
                isStudio: false,
                source: clientObj.terceroId ? 'tercero' : 'billing'
            });
        }
        if (navigate) {
            navigate(destination);
        }
    };

    useEffect(() => {
        setSelectedConsolidatedClient(null);
    }, [selectedClient, selectedYear, selectedMonth, periodPreset, customStartDate, customEndDate]);

    const availableYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = 0; i <= 10; i++) {
            years.push(currentYear - i);
        }
        return years;
    }, []);

    const getRequestDate = (req) => {
        if (!req) return null;
        if (req.timestamp?.toDate) {
            try { return req.timestamp.toDate(); } catch (e) {}
        }
        if (req.timestamp instanceof Date) {
            return req.timestamp;
        }
        if (req.timestamp && typeof req.timestamp === 'string') {
            const d = new Date(req.timestamp);
            if (!isNaN(d.getTime())) return d;
        }
        const rawFecha = req.manualData?.fecha || req.aiData?.fecha;
        if (rawFecha) {
            const d = new Date(rawFecha);
            if (!isNaN(d.getTime())) return d;
        }
        if (req.createdAt?.toDate) {
            try { return req.createdAt.toDate(); } catch (e) {}
        }
        return null;
    };

    const isRequestInPeriod = (req) => {
        if (periodPreset === 'todos') return true;

        const reqDate = getRequestDate(req);
        if (!reqDate) return false;

        const now = new Date();

        if (periodPreset === 'mes_actual') {
            return reqDate.getFullYear() === now.getFullYear() && reqDate.getMonth() === now.getMonth();
        }

        if (periodPreset === 'mes_anterior') {
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            return reqDate.getFullYear() === prevMonthDate.getFullYear() && reqDate.getMonth() === prevMonthDate.getMonth();
        }

        if (periodPreset === 'ultimos_12_meses') {
            const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate(), 0, 0, 0, 0);
            const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            return reqDate >= twelveMonthsAgo && reqDate <= endOfToday;
        }

        if (periodPreset === 'anio_actual') {
            return reqDate.getFullYear() === now.getFullYear();
        }

        if (periodPreset === 'personalizado') {
            if (!customStartDate && !customEndDate) return true;
            
            let startOk = true;
            let endOk = true;

            if (customStartDate) {
                const [sY, sM, sD] = customStartDate.split('-').map(Number);
                const startDate = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
                startOk = reqDate >= startDate;
            }

            if (customEndDate) {
                const [eY, eM, eD] = customEndDate.split('-').map(Number);
                const endDate = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
                endOk = reqDate <= endDate;
            }

            return startOk && endOk;
        }

        if (periodPreset === 'especifico') {
            if (selectedYear !== 'todos') {
                const y = parseInt(selectedYear, 10);
                if (reqDate.getFullYear() !== y) return false;
            }
            if (selectedMonth !== 'todos') {
                const m = parseInt(selectedMonth, 10);
                if ((reqDate.getMonth() + 1) !== m) return false;
            }
            return true;
        }

        return true;
    };

    const getPeriodLabel = () => {
        const now = new Date();
        if (periodPreset === 'mes_actual') {
            const monthObj = MONTHS.find(m => m.value === String(now.getMonth() + 1));
            return `(${monthObj?.label || 'Mes Actual'} ${now.getFullYear()})`;
        }
        if (periodPreset === 'mes_anterior') {
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const monthObj = MONTHS.find(m => m.value === String(prevMonthDate.getMonth() + 1));
            return `(Mes Anterior: ${monthObj?.label || ''} ${prevMonthDate.getFullYear()})`;
        }
        if (periodPreset === 'ultimos_12_meses') {
            return '(Últimos 12 Meses)';
        }
        if (periodPreset === 'anio_actual') {
            return `(Año ${now.getFullYear()})`;
        }
        if (periodPreset === 'personalizado') {
            if (customStartDate && customEndDate) {
                const fStart = customStartDate.split('-').reverse().join('/');
                const fEnd = customEndDate.split('-').reverse().join('/');
                return `(${fStart} al ${fEnd})`;
            }
            if (customStartDate) {
                const fStart = customStartDate.split('-').reverse().join('/');
                return `(Desde ${fStart})`;
            }
            if (customEndDate) {
                const fEnd = customEndDate.split('-').reverse().join('/');
                return `(Hasta ${fEnd})`;
            }
            return '(Rango Personalizado)';
        }
        if (periodPreset === 'especifico') {
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
            return '(Histórico Completo)';
        }
        return '(Histórico Completo)';
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
    const [autoSyncCtaCte, setAutoSyncCtaCte] = useState(true);
    const [ctaCteSyncMode, setCtaCteSyncMode] = useState('factura_y_pago'); // 'factura_y_pago' | 'solo_factura' | 'solo_pago'
    const [autoSyncCashFlow, setAutoSyncCashFlow] = useState(true);
    const [syncingCtaCteId, setSyncingCtaCteId] = useState(null);

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

    const adminPhones = useMemo(() => {
        const phones = new Set();
        const addP = (p) => {
            if (!p) return;
            const c = String(p).replace(/\D/g, '');
            if (c) {
                phones.add(c);
                if (c.length >= 8) phones.add(c.slice(-8));
            }
        };
        if (userData?.telefono) addP(userData.telefono);
        systemUsers.forEach(u => {
            if (u.isAdmin || u.role === 'admin') {
                if (u.telefono) addP(u.telefono);
            }
        });
        return phones;
    }, [userData, systemUsers]);

    const isAdminPhone = (phone) => {
        if (!phone) return false;
        const c = String(phone).replace(/\D/g, '');
        if (!c) return false;
        if (adminPhones.has(c)) return true;
        if (c.length >= 8 && adminPhones.has(c.slice(-8))) return true;
        return false;
    };

    const userProfilePhoneDictionary = useMemo(() => {
        const dict = {};
        systemUsers.forEach(u => {
            // Excluir administradores para que no se use su teléfono en clientes
            if (u.isAdmin || u.role === 'admin') return;
            const rawCuit = u.cuit || '';
            const cuit = rawCuit.replace(/\D/g, '');
            if (cuit && u.telefono && !isAdminPhone(u.telefono)) {
                dict[cuit] = u.telefono;
            }
        });
        return dict;
    }, [systemUsers, adminPhones]);

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
            const cuitEmisorNorm = cleanCuit(req.aiData?.cuit_emisor || req.manualData?.cuitEmisor || '');
            const cuitReceptorNorm = cleanCuit(req.aiData?.cuit_receptor || req.manualData?.cuitReceptor || req.manualData?.cuitCliente || '');
            const matchEmisor = cuitEmisorNorm && cuitEmisorNorm.length >= 10 ? tercerosByCuit[cuitEmisorNorm] : null;
            const matchReceptor = cuitReceptorNorm && cuitReceptorNorm.length >= 10 ? tercerosByCuit[cuitReceptorNorm] : null;

            // En una FACTURA DE VENTA: el cliente del estudio es el EMISOR (quien vende y factura).
            // En una TRANSFERENCIA / COBRO RECIBIDO o COBRO EN EFECTIVO: el cliente del estudio es quien recibe los fondos.
            let clienteEsEmisor = !isTransfer;

            if (matchEmisor && !matchReceptor) {
                clienteEsEmisor = true;
            } else if (matchReceptor && !matchEmisor) {
                clienteEsEmisor = false;
            } else if (cuitEmisorNorm && !cuitReceptorNorm) {
                clienteEsEmisor = true;
            } else if (cuitReceptorNorm && !cuitEmisorNorm) {
                clienteEsEmisor = false;
            } else if (req.isManualEntry || tipoComp.includes('manual') || tipoComp.includes('efectivo')) {
                clienteEsEmisor = false;
            } else if ((req.aiData?.nombre_emisor || '').toLowerCase().includes('consumidor')) {
                clienteEsEmisor = false;
            } else if ((req.aiData?.nombre_receptor || '').toLowerCase().includes('consumidor')) {
                clienteEsEmisor = true;
            } else if (activeEntity && !activeEntity.isStudio) {
                const activeCuit = cleanCuit(activeEntity.cuit);
                if (activeCuit && cuitEmisorNorm === activeCuit) {
                    clienteEsEmisor = true;
                } else if (activeCuit && cuitReceptorNorm === activeCuit) {
                    clienteEsEmisor = false;
                }
            } else if (req.userCuit) {
                const uCuit = cleanCuit(req.userCuit);
                if (uCuit && cuitEmisorNorm === uCuit) {
                    clienteEsEmisor = true;
                } else if (uCuit && cuitReceptorNorm === uCuit) {
                    clienteEsEmisor = false;
                }
            }

            const rawCuit = (clienteEsEmisor 
                ? (req.aiData?.cuit_emisor || req.manualData?.cuitEmisor) 
                : (req.aiData?.cuit_receptor || req.manualData?.cuitReceptor || req.manualData?.cuitCliente)
            ) || (activeEntity && !activeEntity.isStudio ? activeEntity.cuit : '') || req.userCuit || 'S/D';
            
            const normCuit = cleanCuit(rawCuit);
            const terceroMatch = (clienteEsEmisor ? matchEmisor : matchReceptor) || (normCuit && normCuit.length >= 10 ? tercerosByCuit[normCuit] : null);

            // Buscar usuario en systemUsers por CUIT
            const userByCuit = normCuit && normCuit.length >= 10 
                ? systemUsers.find(u => cleanCuit(u.cuit) === normCuit) 
                : null;

            // Usuario que creó la solicitud
            const userById = (req.userId && req.userId !== 'unassigned') 
                ? systemUsers.find(u => u.id === req.userId) 
                : null;

            const isUserAdmin = Boolean(
                userById?.isAdmin || 
                userById?.role === 'admin' || 
                (req.userId === user?.uid && userData?.isAdmin)
            );

            const adminCuit = cleanCuit(userData?.cuit || userById?.cuit);
            const isComprobanteDelAdmin = Boolean(normCuit && adminCuit && normCuit === adminCuit);

            const adminNames = [
                userData?.nombre, 
                userById?.nombre, 
                'gustavo eduardo gramajo', 
                'g&r consultores'
            ].filter(Boolean).map(n => n.trim().toLowerCase());

            const rawNombreReceptor = req.aiData?.nombre_receptor;
            const isReceptorAdmin = adminNames.some(an => 
                (rawNombreReceptor || '').trim().toLowerCase().includes(an)
            );
            const validNombreReceptor = (rawNombreReceptor && (!isReceptorAdmin || isComprobanteDelAdmin))
                ? rawNombreReceptor
                : (req.aiData?.nombre_fantasia || null);

            let clienteNombre = null;
            if (terceroMatch?.nombre) {
                clienteNombre = terceroMatch.nombre;
            } else if (userByCuit?.nombre && (!userByCuit.isAdmin || isComprobanteDelAdmin)) {
                clienteNombre = userByCuit.nombre;
            } else if (activeEntity && !activeEntity.isStudio && activeEntity.name) {
                clienteNombre = activeEntity.name;
            } else if (clienteEsEmisor && req.aiData?.nombre_emisor) {
                clienteNombre = req.aiData.nombre_emisor;
            } else if (!clienteEsEmisor && validNombreReceptor && validNombreReceptor !== 'S/D' && validNombreReceptor !== 'null') {
                clienteNombre = validNombreReceptor;
            } else if (req.manualData?.nombreCliente) {
                clienteNombre = req.manualData.nombreCliente;
            } else if (userById && (!isUserAdmin || isComprobanteDelAdmin) && userById.nombre) {
                clienteNombre = userById.nombre;
            } else if (req.userName && (!isUserAdmin || isComprobanteDelAdmin) && !req.userName.includes('Sin Asignar')) {
                clienteNombre = req.userName;
            } else if (req.aiData?.nombre_fantasia && req.aiData.nombre_fantasia !== 'null') {
                clienteNombre = req.aiData.nombre_fantasia;
            } else {
                clienteNombre = 'Cliente';
            }

            let nombreFantasia = req.aiData?.nombre_fantasia || null;
            if (nombreFantasia) {
                const normFant = nombreFantasia.trim().toLowerCase();
                const normCli = clienteNombre.trim().toLowerCase();
                if (normFant === normCli || normFant === 'null' || normFant === 's/d' || adminNames.some(an => normFant.includes(an))) {
                    nombreFantasia = null;
                }
            }

            const contraparteNombre = (clienteEsEmisor 
                ? (req.aiData?.nombre_receptor || req.manualData?.nombreReceptor || req.manualData?.nombreCliente) 
                : (req.aiData?.nombre_emisor || req.manualData?.nombreEmisor)
            ) || 'Comprador';

            const contraparteCuit = (clienteEsEmisor 
                ? (req.aiData?.cuit_receptor || req.manualData?.cuitReceptor || req.manualData?.cuitCliente) 
                : (req.aiData?.cuit_emisor || req.manualData?.cuitEmisor)
            ) || 'S/D';

            return {
                tipo,
                isVenta: true,
                clienteLabel: 'Cliente del Estudio (Vendedor / Destino de Fondos)',
                clienteNombre,
                nombreFantasia,
                clienteCuit: rawCuit,
                clienteBanco: (clienteEsEmisor ? req.aiData?.banco_origen : req.aiData?.banco_receptor) || req.aiData?.aplicacion_pago || '-',
                terceroMatch,
                userMatch: (!userByCuit?.isAdmin && userByCuit?.role !== 'admin') ? userByCuit : null,
                contraparteLabel: 'Comprador (Pagador / Origen Fondos)',
                contraparteNombre,
                contraparteCuit,
                contraparteBanco: (clienteEsEmisor ? req.aiData?.banco_receptor : req.aiData?.banco_origen) || '-'
            };
        } else {
            // Compra o Gasto: Inversión Contable de Roles
            const userById = (req.userId && req.userId !== 'unassigned') 
                ? systemUsers.find(u => u.id === req.userId) 
                : null;

            const isUserAdmin = Boolean(
                userById?.isAdmin || 
                userById?.role === 'admin' || 
                (req.userId === user?.uid && userData?.isAdmin)
            );

            const cuitEmisorNorm = cleanCuit(req.aiData?.cuit_emisor || '');
            const cuitReceptorNorm = cleanCuit(req.aiData?.cuit_receptor || '');
            const matchEmisor = cuitEmisorNorm && cuitEmisorNorm.length >= 10 ? tercerosByCuit[cuitEmisorNorm] : null;
            const matchReceptor = cuitReceptorNorm && cuitReceptorNorm.length >= 10 ? tercerosByCuit[cuitReceptorNorm] : null;

            let clienteEsEmisor = isTransfer || req.aiData?.tipo_ticket_pos === 'ticket_cliente';
            if (matchEmisor && !matchReceptor) {
                clienteEsEmisor = true;
            } else if (matchReceptor && !matchEmisor) {
                clienteEsEmisor = false;
            }

            const fallbackCuit = !isUserAdmin ? (userById?.cuit || '') : '';
            const fallbackNombre = !isUserAdmin ? (userById?.nombre || userById?.email || '') : '';

            let rawCuit = (clienteEsEmisor ? req.aiData?.cuit_emisor : req.aiData?.cuit_receptor) || req.manualData?.cuitCliente;
            if (!rawCuit || rawCuit === 'S/D' || rawCuit === 'null') {
                rawCuit = fallbackCuit || (activeEntity && !activeEntity.isStudio ? activeEntity.cuit : '') || 'S/D';
            }
            const normCuit = cleanCuit(rawCuit);
            const terceroMatch = (clienteEsEmisor ? matchEmisor : matchReceptor) || (normCuit && normCuit.length >= 10 ? tercerosByCuit[normCuit] : null);
            const userByCuit = normCuit && normCuit.length >= 10 ? systemUsers.find(u => cleanCuit(u.cuit) === normCuit) : null;

            let clienteNombre = terceroMatch?.nombre 
                || (userByCuit && (!userByCuit.isAdmin || (normCuit && cleanCuit(userData?.cuit) === normCuit)) ? userByCuit.nombre : null)
                || (activeEntity && !activeEntity.isStudio && activeEntity.name ? activeEntity.name : null)
                || (clienteEsEmisor ? req.aiData?.nombre_emisor : req.aiData?.nombre_receptor) 
                || req.manualData?.nombreCliente;

            if (!clienteNombre || clienteNombre === 'Cliente' || clienteNombre.includes('Consumidor') || clienteNombre.includes('Tarjeta')) {
                if (fallbackNombre) {
                    clienteNombre = fallbackNombre;
                } else if (req.userName && req.userId !== 'unassigned' && !isUserAdmin) {
                    clienteNombre = req.userName;
                } else {
                    clienteNombre = 'Cliente';
                }
            }

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
                clienteCuit: rawCuit,
                clienteBanco,
                terceroMatch,
                userMatch: (!userByCuit?.isAdmin && userByCuit?.role !== 'admin') ? userByCuit : null,
                contraparteLabel: 'Proveedor / Comercio / Servicio',
                contraparteNombre,
                contraparteCuit,
                contraparteBanco
            };
        }
    };

    // Helper unificado para resolver todos los UIDs contables donde debe asentarse una operación
    const resolveTargetClientUids = (req, party) => {
        const uids = new Set();
        const normCuit = cleanCuit(party?.clienteCuit);

        // 1. Tercero asignado o coincidente en tercerosByCuit (usado por el selector del admin y Libro/Dashboard)
        if (party?.terceroMatch?.id) {
            uids.add(party.terceroMatch.id);
        }
        if (normCuit && tercerosByCuit[normCuit]?.id) {
            uids.add(tercerosByCuit[normCuit].id);
        }

        // 2. Si el administrador tiene seleccionado un cliente en el dropdown global
        if (activeEntity && !activeEntity.isStudio && activeEntity.id) {
            const normActiveCuit = cleanCuit(activeEntity.cuit);
            if (!normCuit || !normActiveCuit || normCuit === normActiveCuit || activeEntity.id === party?.terceroMatch?.id) {
                uids.add(activeEntity.id);
            }
        }

        // 3. Si la solicitud fue subida por un cliente con cuenta en Auth (no admin)
        if (req.userId && req.userId !== 'unassigned') {
            const userById = systemUsers.find(u => u.id === req.userId);
            const isReqUserAdmin = Boolean(
                userById?.isAdmin || 
                userById?.role === 'admin' || 
                (req.userId === user?.uid && userData?.isAdmin)
            );
            if (!isReqUserAdmin) {
                uids.add(req.userId);
            }
        }

        // 4. Usuario registrado en Auth (systemUsers) por CUIT
        if (normCuit && normCuit.length >= 10) {
            const userByCuit = systemUsers.find(u => cleanCuit(u.cuit) === normCuit);
            if (userByCuit && !userByCuit.isAdmin && userByCuit.role !== 'admin') {
                uids.add(userByCuit.id);
            }
        }

        // 5. Coincidencia en la lista de clientes del selector (clientList / clients)
        if (normCuit && normCuit.length >= 10) {
            const cliMatch = (clientList || clients || []).find(c => cleanCuit(c.cuit) === normCuit);
            if (cliMatch?.id) {
                uids.add(cliMatch.id);
            }
        }

        // 6. Si no hay UIDs detectados, fallback a targetUserId del contexto si se está auditando un cliente
        if (uids.size === 0 && isViewingClient && targetUserId) {
            uids.add(targetUserId);
        }

        // 7. Si aún está vacío y hay un filtro local seleccionado en la página
        if (uids.size === 0 && selectedClient && selectedClient !== 'todos') {
            uids.add(selectedClient);
        }

        return Array.from(uids).filter(Boolean);
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
    }, [visibleRequests, tercerosByCuit]);

    const clientPhoneDictionary = useMemo(() => {
        const dict = {}; 
        // 1. Prioridad: Fichas de Terceros (Clientes del estudio ya cargados en el sistema)
        tercerosList.forEach(t => {
            const c = cleanCuit(t.cuit);
            const phone = t.telefono || t.celular || t.whatsapp || t.phone;
            if (c && c.length >= 10 && phone && !isAdminPhone(phone)) {
                dict[c] = phone;
            }
        });
        // 2. Usuarios del sistema clientes (no administradores)
        systemUsers.forEach(u => {
            if (u.isAdmin || u.role === 'admin') return;
            const c = cleanCuit(u.cuit);
            const phone = u.telefono || u.celular || u.whatsapp || u.phone;
            if (c && c.length >= 10 && phone && !isAdminPhone(phone)) {
                if (!dict[c]) {
                    dict[c] = phone;
                }
            }
        });
        return dict;
    }, [tercerosList, systemUsers, adminPhones]);

    const clientPhoneByNameDictionary = useMemo(() => {
        const dict = {};
        const normN = (s) => (s || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        tercerosList.forEach(t => {
            const name = normN(t.nombre);
            const phone = t.telefono || t.celular || t.whatsapp || t.phone;
            if (name && phone && !isAdminPhone(phone)) {
                dict[name] = phone;
            }
        });
        systemUsers.forEach(u => {
            if (u.isAdmin || u.role === 'admin') return;
            const name = normN(u.nombre);
            const phone = u.telefono || u.celular || u.whatsapp || u.phone;
            if (name && phone && !isAdminPhone(phone)) {
                if (!dict[name]) {
                    dict[name] = phone;
                }
            }
        });
        return dict;
    }, [tercerosList, systemUsers, adminPhones]);

    const getUnifiedName = (req) => {
        const party = getPartyDetails(req);
        if (party.terceroMatch?.nombre) {
            return party.terceroMatch.nombre;
        }
        if (party.clienteNombre && party.clienteNombre !== 'Desconocido' && party.clienteNombre !== 'Cliente') {
            return party.clienteNombre;
        }
        const rawCuit = party.clienteCuit || '';
        const cuit = rawCuit.replace(/\D/g, '');
        if (cuit && clientDictionary[cuit]) return clientDictionary[cuit];
        if (req.userName && req.userId && req.userId !== 'unassigned' && !userData?.isAdmin) {
            return req.userName;
        }
        return party.clienteNombre || 'Desconocido';
    };

    const getReceptorPhone = (req) => {
        const party = getPartyDetails(req);
        const rawCuit = party.clienteCuit || '';
        const cuit = rawCuit.replace(/\D/g, '');
        const normN = (s) => (s || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const clientNameNorm = normN(party.clienteNombre);

        // 1. Ficha de Tercero vinculada directamente en party (cliente del estudio)
        const tDirectPhone = party.terceroMatch?.telefono || party.terceroMatch?.celular || party.terceroMatch?.whatsapp || party.terceroMatch?.phone;
        if (tDirectPhone && !isAdminPhone(tDirectPhone)) {
            return tDirectPhone;
        }

        // 2. Diccionario de Clientes del Sistema por CUIT (Terceros del estudio y usuarios clientes)
        if (cuit && clientPhoneDictionary[cuit] && !isAdminPhone(clientPhoneDictionary[cuit])) {
            return clientPhoneDictionary[cuit];
        }

        // 3. Diccionario de Clientes del Sistema por Nombre (Terceros y usuarios clientes)
        if (clientNameNorm && clientPhoneByNameDictionary[clientNameNorm] && !isAdminPhone(clientPhoneByNameDictionary[clientNameNorm])) {
            return clientPhoneByNameDictionary[clientNameNorm];
        }

        // 4. Perfil de Usuario por CUIT (en caso de existir en systemUsers)
        if (cuit && userProfilePhoneDictionary[cuit] && !isAdminPhone(userProfilePhoneDictionary[cuit])) {
            return userProfilePhoneDictionary[cuit];
        }

        // 5. Usuario asignado en la solicitud si es un cliente del portal (no admin)
        if (req.userId && req.userId !== 'unassigned') {
            const u = systemUsers.find(sysU => sysU.id === req.userId);
            if (u && !u.isAdmin && u.role !== 'admin' && u.telefono && !isAdminPhone(u.telefono)) {
                return u.telefono;
            }
        }

        // 6. Teléfono específico del cliente guardado en la solicitud (clientPhone)
        if (req.clientPhone && !isAdminPhone(req.clientPhone)) {
            return req.clientPhone;
        }

        // 7. Si fue enviado por WhatsApp por el cliente (senderPhone que no coincida con el admin)
        if (req.senderPhone && !isAdminPhone(req.senderPhone)) {
            return req.senderPhone;
        }

        // 8. userPhone o telefono solo si pertenece genuinamente a un cliente y NO al admin
        if (req.userPhone && !isAdminPhone(req.userPhone)) {
            return req.userPhone;
        }
        if (req.telefono && !isAdminPhone(req.telefono)) {
            return req.telefono;
        }

        return '';
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
        
        // Filtrado por Período
        data = data.filter(isRequestInPeriod);

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
            return (periodPreset !== 'todos') 
                ? data.filter(r => r.status === 'completed') 
                : data.filter(r => r.status === 'completed').slice(0, 30);
        } else {
            return data.filter(r => r.status !== 'completed');
        }
    }, [visibleRequests, selectedClient, periodPreset, customStartDate, customEndDate, selectedYear, selectedMonth, filterStatus, activeModule, subFilterExpense, clientDictionary]);

    const metrics = useMemo(() => {
        let baseData = visibleRequests;
        if (selectedClient !== 'todos') {
            baseData = baseData.filter(req => getUnifiedName(req) === selectedClient);
        }
        
        const reqs = baseData.filter(isRequestInPeriod);

        const isExpenseModule = activeModule === 'compras_gastos';
        const isConsolidatedModule = activeModule === 'summary';
        const filteredByModule = reqs.filter(r => {
            const tipo = r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta';
            if (activeModule === 'ventas') return tipo === 'venta';
            if (activeModule === 'compras_gastos') return tipo === 'compra' || tipo === 'gasto';
            return true;
        });

        return {
            isExpenseModule,
            isConsolidatedModule,
            totalFacturado: filteredByModule.filter(r => r.status === 'completed' && (isConsolidatedModule ? (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'venta' : true)).reduce((sum, r) => sum + (r.aiData?.monto_total || r.manualData?.monto || 0), 0),
            totalComprasGastos: filteredByModule.filter(r => r.status === 'completed' && ((r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'compra' || (r.clasificacionContable || r.aiData?.clasificacion_contable || 'venta') === 'gasto')).reduce((sum, r) => sum + (r.aiData?.monto_total || r.manualData?.monto || 0), 0),
            totalPendiente: filteredByModule.filter(r => r.status !== 'completed' && r.status !== 'duplicate').reduce((sum, r) => sum + (r.aiData?.monto_total || r.manualData?.monto || 0), 0)
        };
    }, [visibleRequests, selectedClient, periodPreset, customStartDate, customEndDate, selectedYear, selectedMonth, activeModule, clientDictionary]);

    const clientBillingSummary = useMemo(() => {
        const summaryMap = {};
        
        let targetRequests = requests;

        // 1. Filtrado por Cliente Seleccionado en la cabecera
        if (selectedClient !== 'todos') {
            const normSelected = cleanCuit(selectedClient);
            targetRequests = targetRequests.filter(req => {
                const party = getPartyDetails(req);
                const uName = getUnifiedName(req);
                const normReqCuit = cleanCuit(party.clienteCuit || '');
                if (normSelected && normReqCuit && normSelected === normReqCuit) {
                    return true;
                }
                return uName === selectedClient;
            });
        }

        // 2. Filtrado por Período
        targetRequests = targetRequests.filter(isRequestInPeriod);

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

            const tipo = req.clasificacionContable || req.aiData?.clasificacion_contable || (party.isVenta ? 'venta' : 'compra');
            const isVenta = tipo === 'venta';
            const isCompraGasto = tipo === 'compra' || tipo === 'gasto';

            const normCuit = cuit !== 'Sin CUIT' ? cuit : '';
            const terceroMatch = party.terceroMatch || (normCuit && normCuit.length >= 10 ? tercerosByCuit[normCuit] : null);
            
            if (!summaryMap[key]) {
                summaryMap[key] = {
                    key,
                    name: terceroMatch?.nombre || clientName,
                    cuit: cuit,
                    terceroId: terceroMatch?.id || null,
                    isInTerceros: Boolean(terceroMatch),
                    userId: req.userId && req.userId !== 'unassigned' && !userData?.isAdmin ? req.userId : null,
                    totalFacturado: 0,
                    totalComprasGastos: 0,
                    totalPendiente: 0,
                    pendienteVentas: 0,
                    pendienteComprasGastos: 0,
                    countVentas: 0,
                    countComprasGastos: 0,
                    count: 0,
                    lastActivity: null
                };
            }
            if (terceroMatch && !summaryMap[key].terceroId) {
                summaryMap[key].terceroId = terceroMatch.id;
                summaryMap[key].isInTerceros = true;
                summaryMap[key].name = terceroMatch.nombre;
            }
            if (!summaryMap[key].userId && req.userId && req.userId !== 'unassigned' && !userData?.isAdmin) {
                summaryMap[key].userId = req.userId;
            }
            
            const clientData = summaryMap[key];

            if (isVenta) {
                if (isCompleted) {
                    clientData.totalFacturado += monto;
                }
                if (isPending) {
                    clientData.totalPendiente += monto;
                    clientData.pendienteVentas += monto;
                }
                clientData.countVentas += 1;
            } else if (isCompraGasto) {
                if (isCompleted) {
                    clientData.totalComprasGastos += monto;
                }
                if (isPending) {
                    clientData.totalPendiente += monto;
                    clientData.pendienteComprasGastos += monto;
                }
                clientData.countComprasGastos += 1;
            } else {
                if (isCompleted) {
                    clientData.totalFacturado += monto;
                }
                if (isPending) {
                    clientData.totalPendiente += monto;
                }
            }

            clientData.count += 1;
            
            const reqDate = req.timestamp?.toDate();
            if (reqDate) {
                if (!clientData.lastActivity || reqDate > clientData.lastActivity) {
                    clientData.lastActivity = reqDate;
                }
            }
        });
        
        return Object.values(summaryMap).sort((a, b) => (b.totalFacturado + b.totalComprasGastos) - (a.totalFacturado + a.totalComprasGastos));
    }, [requests, selectedClient, periodPreset, customStartDate, customEndDate, selectedYear, selectedMonth, clientDictionary, tercerosByCuit, userData?.isAdmin]);

    const consolidatedClientRequests = useMemo(() => {
        if (!selectedConsolidatedClient) return [];
        let data = requests.filter(req => {
            const party = getPartyDetails(req);
            const uName = getUnifiedName(req);
            const normReqCuit = cleanCuit(party.clienteCuit || '');
            const clientCuit = cleanCuit(selectedConsolidatedClient.cuit);
            if (clientCuit && normReqCuit && clientCuit === normReqCuit) return true;
            return uName === selectedConsolidatedClient.name;
        });

        // Filtrado por Período
        data = data.filter(isRequestInPeriod);
        return data;
    }, [requests, selectedConsolidatedClient, periodPreset, customStartDate, customEndDate, selectedYear, selectedMonth, clientDictionary, tercerosByCuit]);

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
                            userPhone: userData?.isAdmin ? "" : (userData.telefono || ""),
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
                    userPhone: userData?.isAdmin ? "" : (userData.telefono || ""),
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

    /** Garantiza la existencia del cliente titular en Gestión de Terceros del estudio. */
    const ensureStudioTercero = async (party) => {
        const normCuit = cleanCuit(party.clienteCuit);
        let terceroMatch = party.terceroMatch || (normCuit && normCuit.length >= 10 ? tercerosByCuit[normCuit] : null);
        if (!terceroMatch && normCuit && normCuit.length >= 10 && user?.uid && userData?.isAdmin) {
            try {
                const nuevoNombre = (party.clienteNombre && party.clienteNombre !== 'Cliente' && party.clienteNombre !== 'Desconocido')
                    ? party.clienteNombre
                    : `Cliente ${normCuit}`;
                const nuevoTerceroRef = await addDoc(collection(db, 'users', user.uid, 'terceros'), {
                    nombre: nuevoNombre.trim(),
                    cuit: party.clienteCuit || normCuit,
                    tipo: 'Cliente',
                    email: '',
                    telefono: '',
                    categoriaTributaria: 'Monotributo',
                    createdAt: Timestamp.now()
                });
                terceroMatch = {
                    id: nuevoTerceroRef.id,
                    nombre: nuevoNombre,
                    cuit: party.clienteCuit || normCuit
                };
                party.terceroMatch = terceroMatch;
            } catch (createErr) {
                console.warn("No se pudo auto-crear tercero en estudio:", createErr);
            }
        }
        return terceroMatch;
    };

    /** Busca o crea la contraparte comercial (Deudor o Proveedor) en la entidad contable destino. */
    const upsertCounterpartyTercero = async (targetId, { isVenta, counterpartyName, counterpartyCuit }) => {
        const desiredTipo = isVenta ? 'Cliente' : 'Proveedor';
        const normCuit = cleanCuit(counterpartyCuit);
        const safeName = (counterpartyName && !['Desconocido', 'null', 'S/D'].includes(String(counterpartyName).trim()))
            ? String(counterpartyName).trim()
            : (isVenta ? 'Comprador Eventual' : 'Proveedor Eventual');
        const normName = safeName.toLowerCase();

        const snap = await getDocs(collection(db, 'users', targetId, 'terceros'));
        const matchedDoc = snap.docs.find(d => {
            const data = d.data();
            const dCuit = cleanCuit(data.cuit);
            if (normCuit.length >= 10 && dCuit === normCuit) return true;
            return (data.nombre || '').trim().toLowerCase() === normName;
        });

        if (matchedDoc) {
            const currentTipo = matchedDoc.data().tipo;
            if (currentTipo && currentTipo !== desiredTipo && currentTipo !== 'Ambos') {
                await updateDoc(matchedDoc.ref, { tipo: 'Ambos' });
            }
            return matchedDoc.id;
        }

        const newRef = await addDoc(collection(db, 'users', targetId, 'terceros'), {
            nombre: safeName,
            cuit: normCuit.length >= 10 ? (counterpartyCuit || normCuit) : '',
            tipo: desiredTipo,
            email: '',
            telefono: '',
            createdAt: Timestamp.now(),
            origen: 'facturacion_360'
        });
        return newRef.id;
    };

    /** Crea, actualiza o elimina documentos vinculados por billingRequestId garantizando idempotencia. */
    const syncBillingLinkedDoc = async (colRef, billingRequestId, shouldCreate, payload) => {
        const snap = await getDocs(query(colRef, where('billingRequestId', '==', billingRequestId)));
        if (!shouldCreate) {
            for (const d of snap.docs) {
                await deleteDoc(d.ref);
            }
            return null;
        }
        if (!snap.empty) {
            const primaryRef = snap.docs[0].ref;
            await updateDoc(primaryRef, payload);
            for (let i = 1; i < snap.docs.length; i++) {
                await deleteDoc(snap.docs[i].ref);
            }
            return primaryRef.id;
        }
        const created = await addDoc(colRef, payload);
        return created.id;
    };

    /** Concilia o registra un movimiento en Cash Flow (users/{targetId}/cashflow_items) de forma idempotente. */
    const syncCashflowForBilling = async (targetId, req, cashflowPayload, partyDesc) => {
        const cfCol = collection(db, 'users', targetId, 'cashflow_items');
        const existingSnap = await getDocs(query(cfCol, where('billingRequestId', '==', req.id)));

        if (!existingSnap.empty) {
            const primaryDoc = existingSnap.docs[0];
            const isReconciled = Boolean(primaryDoc.data()?.reconciledExistingForecast);
            await updateDoc(primaryDoc.ref, isReconciled
                ? {
                    status: cashflowPayload.status,
                    executedAmount: cashflowPayload.executedAmount,
                    executedAt: cashflowPayload.executedAt,
                    updatedAt: Timestamp.now()
                }
                : cashflowPayload
            );
            for (let i = 1; i < existingSnap.docs.length; i++) {
                await deleteDoc(existingSnap.docs[i].ref);
            }
            return true;
        }

        const allCfSnap = await getDocs(cfCol);
        const periodYM = cashflowPayload.date.slice(0, 7);
        const normParty = String(partyDesc || '').trim().toLowerCase();
        const tolerance = Math.max(100, cashflowPayload.amount * 0.05);

        const pendingMatch = allCfSnap.docs.find(d => {
            const cf = d.data();
            if (cf.status === 'executed' || cf.type !== cashflowPayload.type) return false;
            const amtDiff = Math.abs((Number(cf.amount) || 0) - cashflowPayload.amount);
            if (amtDiff > tolerance) return false;
            const sameMonth = String(cf.date || '').startsWith(periodYM);
            const sameDesc = normParty.length >= 4 && String(cf.description || '').toLowerCase().includes(normParty);
            return sameMonth || sameDesc;
        });

        if (pendingMatch) {
            await updateDoc(pendingMatch.ref, {
                status: cashflowPayload.status,
                executedAmount: cashflowPayload.executedAmount,
                executedAt: cashflowPayload.executedAt,
                billingRequestId: req.id,
                reconciledExistingForecast: true,
                updatedAt: Timestamp.now()
            });
            return true;
        }

        await addDoc(cfCol, {
            ...cashflowPayload,
            reconciledExistingForecast: false,
            createdAt: Timestamp.now()
        });
        return true;
    };

    /**
     * Orquestador Contable 360° idempotente (Facturación -> Operaciones + Cta. Cte. + Cash Flow).
     * Evita duplicados mediante `billingRequestId` y soporta re-sincronización segura.
     */
    const syncAccountingOrchestration = async (req, options = {}) => {
        const {
            party: providedParty,
            syncOperations = true,
            syncCtaCte = true,
            syncCashFlow = true,
            ctaCteMode = ctaCteSyncMode,
            markCompleted = false
        } = options;

        const party = providedParty || getPartyDetails(req);
        const terceroMatch = await ensureStudioTercero(party);
        const enrichedParty = { ...party, terceroMatch };
        const targetUids = resolveTargetClientUids(req, enrichedParty);

        if (targetUids.length === 0) {
            return { synced: false, reason: 'no_targets' };
        }

        const rawMonto = req.aiData?.monto_total ?? req.manualData?.monto ?? 0;
        const parsedMonto = parseAmount(rawMonto);
        if (!parsedMonto || parsedMonto <= 0) {
            return { synced: false, reason: 'invalid_amount', targetUids };
        }

        const clasif = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
        const isVenta = clasif === 'venta';
        const tipo = clasif === 'gasto' ? 'gasto' : (clasif === 'compra' ? 'compra' : 'venta');
        const partyDesc = isVenta ? (party.contraparteNombre || 'Comprador') : (party.contraparteNombre || 'Proveedor');
        const desc = req.aiData?.concepto_detectado
            ? `[${tipo.toUpperCase()}] ${partyDesc} - ${req.aiData.concepto_detectado}`
            : `${tipo.toUpperCase()} - ${partyDesc}`;

        const fechaRaw = req.aiData?.fecha_pago || req.manualData?.fecha || req.timestamp || new Date();
        const localDate = parseLocalDate(fechaRaw);
        const fechaTimestamp = Timestamp.fromDate(localDate);
        const pad2 = (n) => String(n).padStart(2, '0');
        const dateISO = `${localDate.getFullYear()}-${pad2(localDate.getMonth() + 1)}-${pad2(localDate.getDate())}`;

        const operationPayload = {
            type: tipo,
            amount: parsedMonto,
            description: desc,
            fechaEmision: fechaTimestamp,
            year: localDate.getFullYear(),
            month: localDate.getMonth() + 1,
            day: localDate.getDate(),
            billingRequestId: req.id,
            terceroId: terceroMatch?.id || null,
            clienteCuit: party.clienteCuit || null,
            clienteNombre: party.clienteNombre || null,
            bancoOrigen: req.aiData?.banco_origen || null,
            bancoReceptor: req.aiData?.banco_receptor || null,
            medioPago: req.aiData?.medio_pago_detalle || req.aiData?.aplicacion_pago || (req.aiData?.tipo_comprobante === 'Transferencia' ? 'Transferencia' : null),
            cuotas: req.aiData?.cuotas || null,
            aplicacionPago: req.aiData?.aplicacion_pago || null,
            tipoTicketPos: req.aiData?.tipo_ticket_pos || null,
            source: req.source || 'web'
        };

        let opsSynced = false;
        let ctaCteSynced = false;
        let cashFlowSynced = false;
        let lastCtaCteTerceroId = req.lastCtaCteTerceroId || null;

        for (const targetId of targetUids) {
            let syncedOpId = null;
            if (syncOperations) {
                try {
                    syncedOpId = await syncBillingLinkedDoc(
                        collection(db, 'users', targetId, 'operations'),
                        req.id,
                        true,
                        operationPayload
                    );
                    opsSynced = true;
                } catch (errOp) {
                    console.error(`Error al asentar operación en users/${targetId}/operations:`, errOp);
                }
            } else {
                try {
                    const existingOpSnap = await getDocs(
                        query(collection(db, 'users', targetId, 'operations'), where('billingRequestId', '==', req.id))
                    );
                    if (!existingOpSnap.empty) {
                        syncedOpId = existingOpSnap.docs[0].id;
                    }
                } catch (e) { /* Ignorar búsqueda auxiliar */ }
            }

            if (syncCtaCte) {
                try {
                    const counterpartyId = await upsertCounterpartyTercero(targetId, {
                        isVenta,
                        counterpartyName: partyDesc,
                        counterpartyCuit: party.contraparteCuit
                    });
                    lastCtaCteTerceroId = counterpartyId;

                    const invoiceCol = isVenta ? 'facturasVenta' : 'facturasCompra';
                    const paymentCol = isVenta ? 'pagosRecibidos' : 'pagosRealizados';
                    const shouldInvoice = ctaCteMode === 'factura_y_pago' || ctaCteMode === 'solo_factura';
                    const shouldPay = ctaCteMode === 'factura_y_pago' || ctaCteMode === 'solo_pago';
                    const compNumber = String(
                        req.aiData?.numero_operacion || req.aiData?.codigo_identificacion || `CMP-${req.id.slice(0, 6).toUpperCase()}`
                    );

                    await syncBillingLinkedDoc(
                        collection(db, 'users', targetId, invoiceCol),
                        req.id,
                        shouldInvoice,
                        {
                            terceroId: counterpartyId,
                            numeroComprobante: compNumber,
                            fechaEmision: fechaTimestamp,
                            fechaVencimiento: fechaTimestamp,
                            montoTotal: parsedMonto,
                            saldoPendiente: shouldPay ? 0 : parsedMonto,
                            estado: shouldPay ? 'Pagada' : 'Pendiente',
                            billingRequestId: req.id,
                            origen: 'facturacion_360',
                            updatedAt: Timestamp.now()
                        }
                    );

                    await syncBillingLinkedDoc(
                        collection(db, 'users', targetId, paymentCol),
                        req.id,
                        shouldPay,
                        {
                            terceroId: counterpartyId,
                            fechaPago: fechaTimestamp,
                            montoPagado: parsedMonto,
                            medioDePago: req.aiData?.medio_pago_detalle || req.aiData?.aplicacion_pago || req.aiData?.tipo_comprobante || 'Transferencia',
                            referencia: compNumber,
                            operationId: syncedOpId || null,
                            billingRequestId: req.id,
                            origen: 'facturacion_360',
                            updatedAt: Timestamp.now()
                        }
                    );
                    ctaCteSynced = true;
                } catch (errCta) {
                    console.error(`Error al sincronizar Cta. Cte. en users/${targetId}:`, errCta);
                }
            }

            if (syncCashFlow) {
                try {
                    const isPaidInCash = syncCtaCte
                        ? (ctaCteMode === 'factura_y_pago' || ctaCteMode === 'solo_pago')
                        : true;
                    const cfDescription = `${partyDesc} (${req.aiData?.tipo_comprobante || 'Comprobante'}${req.aiData?.numero_operacion ? ` #${req.aiData.numero_operacion}` : ''})`;
                    await syncCashflowForBilling(
                        targetId,
                        req,
                        {
                            type: isVenta ? 'ingreso' : 'egreso',
                            category: isVenta ? 'Ventas' : (tipo === 'compra' ? 'Proveedores' : 'Gastos Operativos'),
                            description: cfDescription,
                            amount: parsedMonto,
                            date: dateISO,
                            periodicity: 'once',
                            status: isPaidInCash ? 'executed' : 'pending',
                            executedAmount: isPaidInCash ? parsedMonto : null,
                            executedAt: isPaidInCash ? dateISO : null,
                            billingRequestId: req.id,
                            source: 'facturacion_360',
                            updatedAt: Timestamp.now()
                        },
                        partyDesc
                    );
                    cashFlowSynced = true;
                } catch (errCf) {
                    console.error(`Error al conciliar Cash Flow en users/${targetId}/cashflow_items:`, errCf);
                }
            }
        }

        const billingUpdates = {
            ...(markCompleted ? { status: 'completed', completedAt: req.completedAt || Timestamp.now() } : {}),
            ...(opsSynced ? { exportedToOperations: true } : {}),
            ...(ctaCteSynced ? {
                syncedToCtaCte: true,
                ctaCteSyncMode: ctaCteMode,
                lastCtaCteTerceroId,
                lastCtaCteTipo: isVenta ? 'cliente' : 'proveedor'
            } : {}),
            ...(cashFlowSynced ? { syncedToCashFlow: true } : {})
        };

        if (Object.keys(billingUpdates).length > 0) {
            await updateDoc(doc(db, 'billing_requests', req.id), billingUpdates);
        }

        return {
            synced: opsSynced || ctaCteSynced || cashFlowSynced,
            opsSynced,
            ctaCteSynced,
            cashFlowSynced,
            lastCtaCteTerceroId,
            tipo,
            targetNombre: party.clienteNombre || terceroMatch?.nombre || 'el cliente',
            parsedMonto
        };
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

            const party = getPartyDetails(req);

            await updateDoc(doc(db, 'billing_requests', id), { 
                status: 'completed', 
                ...(url ? { invoiceUrl: url } : {}), 
                completedAt: Timestamp.now()
            }); 

            const shouldExportBook = autoRegisterInBook || !isVenta;
            if (shouldExportBook || autoSyncCtaCte || autoSyncCashFlow) {
                await syncAccountingOrchestration(req, {
                    party,
                    syncOperations: shouldExportBook,
                    syncCtaCte: autoSyncCtaCte,
                    syncCashFlow: autoSyncCashFlow,
                    ctaCteMode: ctaCteSyncMode
                });
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

        const party = getPartyDetails(req);
        const isVenta = (req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta') === 'venta';
        const phoneToShow = getReceptorPhone(req);
        const initialApp = (req.aiData?.aplicacion_pago && req.aiData.aplicacion_pago.toLowerCase() !== 'otro')
            ? req.aiData.aplicacion_pago
            : (req.aiData?.banco_receptor || '');

        const cleanSD = (val) => (!val || val === 'S/D' || val === 'null' || val === 'undefined') ? '' : String(val);

        setEditFormData({
            clasificacion_contable: req.clasificacionContable || req.aiData?.clasificacion_contable || (party.isVenta ? 'venta' : 'compra'),
            fecha_pago: req.aiData?.fecha_pago || req.manualData?.fecha || '',
            hora_pago: req.aiData?.hora_pago || '', 
            monto_total: req.aiData?.monto_total ?? req.manualData?.monto ?? 0,
            tipo_comprobante: req.aiData?.tipo_comprobante || '',
            aplicacion_pago: initialApp,
            numero_operacion: req.aiData?.numero_operacion || '', 
            codigo_identificacion: req.aiData?.codigo_identificacion || '',
            cuit_emisor: cleanSD(req.aiData?.cuit_emisor || req.manualData?.cuitEmisor || (!isVenta ? party.clienteCuit : '')),
            nombre_emisor: cleanSD(req.aiData?.nombre_emisor || req.manualData?.nombreEmisor || (!isVenta ? party.clienteNombre : '')),
            banco_origen: req.aiData?.banco_origen || '',
            cuit_receptor: cleanSD(!isVenta ? (req.aiData?.cuit_proveedor || req.aiData?.cuit_receptor || party.contraparteCuit) : (req.aiData?.cuit_receptor || party.clienteCuit)) || req.manualData?.cuitCliente || '',
            nombre_receptor: cleanSD(!isVenta ? (req.aiData?.nombre_proveedor || req.aiData?.nombre_receptor || party.contraparteNombre) : (req.aiData?.nombre_receptor || party.clienteNombre)) || req.manualData?.nombreCliente || '',
            banco_receptor: req.aiData?.banco_receptor || '',
            userPhone: phoneToShow || (!isAdminPhone(req.userPhone) ? req.userPhone : '') || '', 
            concepto_detectado: req.aiData?.concepto_detectado || '',
            cuotas: req.aiData?.cuotas || '',
            medio_pago_detalle: req.aiData?.medio_pago_detalle || '',
            nombre_fantasia: req.aiData?.nombre_fantasia || '',
            note: req.note || ''
        });
        setEditingRequest(req);
    };

    const handleSaveEdits = async (e) => { 
        e.preventDefault(); 
        if (!editingRequest) return; 
        try { 
            const safeFloat = (val) => {
                if (val === undefined || val === null || val === '') return 0;
                const cleanStr = String(val).replace(/\s/g, '').replace(',', '.');
                const parsed = parseFloat(cleanStr);
                return isNaN(parsed) ? 0 : parsed;
            };
            const safeStr = (val) => (val === undefined || val === null) ? '' : String(val).trim();

            const finalClasif = editFormData.clasificacion_contable || 'venta';
            const isVenta = finalClasif === 'venta';

            const cleanedAiData = {
                ...(editingRequest.aiData || {}),
                clasificacion_contable: finalClasif,
                fecha_pago: safeStr(editFormData.fecha_pago),
                hora_pago: safeStr(editFormData.hora_pago),
                monto_total: safeFloat(editFormData.monto_total),
                tipo_comprobante: safeStr(editFormData.tipo_comprobante),
                aplicacion_pago: safeStr(editFormData.aplicacion_pago),
                numero_operacion: safeStr(editFormData.numero_operacion),
                codigo_identificacion: safeStr(editFormData.codigo_identificacion),
                cuit_emisor: safeStr(editFormData.cuit_emisor),
                nombre_emisor: safeStr(editFormData.nombre_emisor),
                banco_origen: safeStr(editFormData.banco_origen),
                cuit_receptor: safeStr(editFormData.cuit_receptor),
                nombre_receptor: safeStr(editFormData.nombre_receptor),
                banco_receptor: safeStr(editFormData.banco_receptor),
                concepto_detectado: safeStr(editFormData.concepto_detectado),
                cuotas: safeStr(editFormData.cuotas),
                medio_pago_detalle: safeStr(editFormData.medio_pago_detalle),
                nombre_fantasia: safeStr(editFormData.nombre_fantasia)
            };

            // En gastos y compras, sincronizar proveedor explícitamente
            if (!isVenta) {
                cleanedAiData.nombre_proveedor = safeStr(editFormData.nombre_receptor);
                cleanedAiData.cuit_proveedor = safeStr(editFormData.cuit_receptor);
            }

            // Asegurar que ninguna clave tenga valor undefined
            Object.keys(cleanedAiData).forEach(k => {
                if (cleanedAiData[k] === undefined) cleanedAiData[k] = '';
            });

            const updatePayload = { 
                clasificacionContable: finalClasif,
                aiData: cleanedAiData,
                userPhone: safeStr(editFormData.userPhone),
                note: safeStr(editFormData.note)
            };

            // Si es un comprobante manual o posee manualData, sincronizarlo también
            if (editingRequest.isManualEntry || editingRequest.manualData) {
                updatePayload.manualData = {
                    ...(editingRequest.manualData || {}),
                    monto: safeFloat(editFormData.monto_total),
                    fecha: safeStr(editFormData.fecha_pago) || editingRequest.manualData?.fecha || '',
                    cuitCliente: isVenta ? safeStr(editFormData.cuit_receptor) : (safeStr(editFormData.cuit_emisor) || safeStr(editFormData.cuit_receptor)),
                    nombreCliente: isVenta ? safeStr(editFormData.nombre_receptor) : (safeStr(editFormData.nombre_emisor) || safeStr(editFormData.nombre_receptor)),
                    cuitEmisor: safeStr(editFormData.cuit_emisor),
                    nombreEmisor: safeStr(editFormData.nombre_emisor)
                };
            }

            await updateDoc(doc(db, 'billing_requests', editingRequest.id), updatePayload); 

            // Si el comprobante ya estaba asentado en el Libro de Operaciones, sincronizar la operación contable vinculada
            if (editingRequest.exportedToOperations) {
                try {
                    const party = getPartyDetails(editingRequest);
                    const targetUids = resolveTargetClientUids(editingRequest, party);
                    const candidateUids = new Set([
                        ...targetUids,
                        editingRequest.userId,
                        user?.uid,
                        party.terceroMatch?.id
                    ].filter(Boolean));

                    const fechaStr = safeStr(editFormData.fecha_pago) || editingRequest.aiData?.fecha_pago || new Date().toISOString().split('T')[0];
                    const localDate = parseLocalDate(fechaStr);
                    const tipo = finalClasif;
                    const partyDesc = isVenta ? (party.contraparteNombre || 'Comprador') : (party.contraparteNombre || 'Proveedor');
                    const newDesc = editFormData.concepto_detectado 
                        ? `[${tipo.toUpperCase()}] ${partyDesc} - ${editFormData.concepto_detectado}`
                        : `${tipo.toUpperCase()} - ${partyDesc}`;

                    for (const cUid of candidateUids) {
                        try {
                            const qOp = query(
                                collection(db, 'users', cUid, 'operations'), 
                                where('billingRequestId', '==', editingRequest.id)
                            );
                            const qSnap = await getDocs(qOp);
                            for (const opDoc of qSnap.docs) {
                                await updateDoc(opDoc.ref, {
                                    type: tipo,
                                    amount: parseAmount(editFormData.monto_total),
                                    description: newDesc,
                                    fechaEmision: Timestamp.fromDate(localDate),
                                    year: localDate.getFullYear(),
                                    month: localDate.getMonth() + 1,
                                    day: localDate.getDate(),
                                    clienteCuit: party.clienteCuit || null,
                                    clienteNombre: party.clienteNombre || null,
                                    bancoOrigen: safeStr(editFormData.banco_origen) || null,
                                    bancoReceptor: safeStr(editFormData.banco_receptor) || null,
                                    medioPago: safeStr(editFormData.medio_pago_detalle) || safeStr(editFormData.aplicacion_pago) || null,
                                    cuotas: safeStr(editFormData.cuotas) || null
                                });
                            }
                        } catch (errSyncOp) {
                            console.error(`Error al sincronizar operación vinculada en ${cUid}:`, errSyncOp);
                        }
                    }
                } catch (syncErr) {
                    console.warn("Advertencia al sincronizar operación contable vinculada:", syncErr);
                }
            }

            setEditingRequest(null); 
        } catch (err) { 
            console.error("Error al guardar edición de comprobante:", err);
            alert(`Error al guardar comprobante: ${err.message || 'Verifique los datos ingresados'}`); 
        } 
    };

    const handleQuickFixDate = async (req, newDateStr) => {
        if (!req || !newDateStr) return;
        try {
            const safeDate = String(newDateStr).trim();
            const localDate = parseLocalDate(safeDate);

            const updatePayload = {
                'aiData.fecha_pago': safeDate
            };
            if (req.manualData) {
                updatePayload['manualData.fecha'] = safeDate;
            }

            await updateDoc(doc(db, 'billing_requests', req.id), updatePayload);

            // Si el comprobante ya estaba asentado en el Libro de Operaciones, sincronizar la fecha
            if (req.exportedToOperations) {
                try {
                    const party = getPartyDetails(req);
                    const targetUids = resolveTargetClientUids(req, party);
                    const candidateUids = new Set([
                        ...targetUids,
                        req.userId,
                        user?.uid,
                        party.terceroMatch?.id
                    ].filter(Boolean));

                    for (const cUid of candidateUids) {
                        try {
                            const qOp = query(
                                collection(db, 'users', cUid, 'operations'),
                                where('billingRequestId', '==', req.id)
                            );
                            const qSnap = await getDocs(qOp);
                            for (const opDoc of qSnap.docs) {
                                await updateDoc(opDoc.ref, {
                                    fechaEmision: Timestamp.fromDate(localDate),
                                    year: localDate.getFullYear(),
                                    month: localDate.getMonth() + 1,
                                    day: localDate.getDate()
                                });
                            }
                        } catch (errSync) {
                            console.error(`Error al actualizar fecha en operación vinculada para ${cUid}:`, errSync);
                        }
                    }
                } catch (syncErr) {
                    console.warn("Advertencia al sincronizar operación:", syncErr);
                }
            }

            alert(`✅ Fecha actualizada correctamente a ${safeDate}.`);
        } catch (err) {
            console.error("Error al actualizar fecha de comprobante:", err);
            alert(`Error al actualizar la fecha: ${err.message || ''}`);
        }
    };

    const handleDeleteRequest = async () => 
    { 
        if (!requestToDelete) return;
        try { 
            const req = requests.find(r => r.id === requestToDelete);
            
            // 1. Limpiar impactos 360° en Operaciones, Cuentas Corrientes y Cash Flow
            if (req) {
                const party = getPartyDetails(req);
                const targetUids = resolveTargetClientUids(req, party);
                const candidateUids = new Set([
                    ...targetUids,
                    req.userId,
                    user?.uid,
                    party.terceroMatch?.id
                ].filter(Boolean));

                const billingLinkedCollections = [
                    'operations',
                    'facturasVenta',
                    'pagosRecibidos',
                    'facturasCompra',
                    'pagosRealizados'
                ];

                for (const cUid of candidateUids) {
                    for (const colName of billingLinkedCollections) {
                        try {
                            const qLinked = query(
                                collection(db, 'users', cUid, colName),
                                where('billingRequestId', '==', requestToDelete)
                            );
                            const qSnap = await getDocs(qLinked);
                            for (const linkedDoc of qSnap.docs) {
                                await deleteDoc(linkedDoc.ref);
                            }
                        } catch (errCol) {
                            console.error(`Error al eliminar registros en ${colName} (${cUid}):`, errCol);
                        }
                    }

                    // Cash Flow: revertir si conciliaba una estimación previa del usuario, o eliminar si fue auto-creado
                    try {
                        const qCf = query(
                            collection(db, 'users', cUid, 'cashflow_items'),
                            where('billingRequestId', '==', requestToDelete)
                        );
                        const cfSnap = await getDocs(qCf);
                        for (const cfDoc of cfSnap.docs) {
                            if (cfDoc.data()?.reconciledExistingForecast) {
                                await updateDoc(cfDoc.ref, {
                                    status: 'pending',
                                    executedAmount: null,
                                    executedAt: null,
                                    billingRequestId: null,
                                    reconciledExistingForecast: false,
                                    updatedAt: Timestamp.now()
                                });
                            } else {
                                await deleteDoc(cfDoc.ref);
                            }
                        }
                    } catch (errCf) {
                        console.error(`Error al limpiar cashflow_items en ${cUid}:`, errCf);
                    }
                }
            }

            // 2. Eliminar archivos asociados en Firebase Storage para no dejar archivos residuales
            if (req) {
                const urlsToDelete = [req.requestImageUrl, req.invoiceUrl].filter(Boolean);
                for (const fileUrl of urlsToDelete) {
                    if (typeof fileUrl === 'string' && fileUrl.includes('firebasestorage.googleapis.com')) {
                        try {
                            const storageRef = ref(storage, fileUrl);
                            await deleteObject(storageRef);
                        } catch (storageErr) {
                            console.warn("Aviso al eliminar archivo físico de storage:", storageErr.message);
                        }
                    }
                }
            }

            // 3. Eliminar el comprobante de billing_requests
            await deleteDoc(doc(db, 'billing_requests', requestToDelete)); 
        } catch (error) {
            console.error("Error deleting request:", error);
            alert("No se pudo eliminar el comprobante: " + (error.message || ''));
        } finally { 
            setRequestToDelete(null); 
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
            const isGasto = (assigningRequest.clasificacionContable || assigningRequest.aiData?.clasificacion_contable) === 'gasto' || 
                            (assigningRequest.clasificacionContable || assigningRequest.aiData?.clasificacion_contable) === 'compra';
            
            const updatedAiData = assigningRequest.aiData ? { ...assigningRequest.aiData } : null;
            if (updatedAiData) {
                if (isGasto) {
                    if (!updatedAiData.cuit_emisor || updatedAiData.cuit_emisor === 'S/D') {
                        updatedAiData.cuit_emisor = targetUser.cuit || '';
                    }
                    if (!updatedAiData.nombre_emisor || updatedAiData.nombre_emisor.includes('Consumidor') || updatedAiData.nombre_emisor.includes('Cliente')) {
                        updatedAiData.nombre_emisor = targetUser.nombre || targetUser.email || 'Cliente Asignado';
                    }
                } else {
                    if (!updatedAiData.cuit_receptor || updatedAiData.cuit_receptor === 'S/D') {
                        updatedAiData.cuit_receptor = targetUser.cuit || '';
                    }
                    if (!updatedAiData.nombre_receptor || updatedAiData.nombre_receptor === 'Cliente') {
                        updatedAiData.nombre_receptor = targetUser.nombre || targetUser.email || 'Cliente Asignado';
                    }
                }
            }

            await updateDoc(doc(db, 'billing_requests', assigningRequest.id), {
                userId: targetUser.id,
                userName: targetUser.nombre || targetUser.email || 'Cliente Asignado',
                userCuit: targetUser.cuit || '',
                userPhone: targetUser.telefono || assigningRequest.userPhone || '',
                userModoFacturacion: targetUser.modoFacturacion || 'estudio',
                status: assigningRequest.aiData ? 'analyzed' : 'pending',
                ...(updatedAiData ? { aiData: updatedAiData } : {})
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
        const party = getPartyDetails(req);
        const terceroMatch = await ensureStudioTercero(party);
        const enrichedParty = { ...party, terceroMatch };

        const targetUids = resolveTargetClientUids(req, enrichedParty);
        if (targetUids.length === 0) {
            return alert("No se pudo determinar el cliente destino. Por favor asigna el comprobante a un cliente de la lista.");
        }

        const rawMonto = req.aiData?.monto_total ?? req.manualData?.monto ?? 0;
        const parsedMonto = parseAmount(rawMonto);
        if (!parsedMonto) return alert("El comprobante no tiene un monto válido registrado.");

        const clasif = req.clasificacionContable || req.aiData?.clasificacion_contable || 'venta';
        const tipo = clasif === 'gasto' ? 'gasto' : (clasif === 'compra' ? 'compra' : 'venta');
        const fechaRaw = req.aiData?.fecha_pago || req.manualData?.fecha || req.timestamp || new Date();
        const localDate = parseLocalDate(fechaRaw);

        const targetNombre = party.clienteNombre || terceroMatch?.nombre || 'el cliente';
        const suspiciousInfo = checkSuspiciousDate(fechaRaw);
        let confirmMsg = `¿Deseas asentar este registro de ${formatCurrency(parsedMonto)} como '${tipo.toUpperCase()}' en el Libro de Operaciones${autoSyncCtaCte ? ' + Cta. Cte.' : ''}${autoSyncCashFlow ? ' + Cash Flow' : ''} de ${targetNombre}?`;
        if (suspiciousInfo) {
            confirmMsg = `⚠️ ATENCIÓN: VERIFICAR FECHA DEL COMPROBANTE\n\nEl comprobante detectado tiene fecha ${suspiciousInfo.originalDateFormatted} (año ${suspiciousInfo.detectedYear}), pero el ejercicio fiscal actual es ${suspiciousInfo.currentYear}.\n\nSi la IA leyó incorrectamente el año o se subió un comprobante de un año anterior, puedes cancelar y usar los botones de sugerencia rápida o 'Corregir' para modificarlo.\n\nFecha asignada a la operación: ${localDate.toLocaleDateString('es-AR')}\n\n¿Deseas continuar y registrar de todas formas?`;
        }
        if (!confirm(confirmMsg)) {
            return;
        }

        try {
            const res = await syncAccountingOrchestration(req, {
                party: enrichedParty,
                syncOperations: true,
                syncCtaCte: autoSyncCtaCte,
                syncCashFlow: autoSyncCashFlow,
                ctaCteMode: ctaCteSyncMode,
                markCompleted: true
            });

            const syncedModules = [
                res.opsSynced ? 'Libro de Operaciones' : null,
                res.ctaCteSynced ? 'Cuenta Corriente' : null,
                res.cashFlowSynced ? 'Cash Flow' : null
            ].filter(Boolean).join(', ');

            alert(`✅ Operación de ${tipo.toUpperCase()} asentada con éxito (${syncedModules}) para ${targetNombre}.`);
        } catch (err) {
            console.error("Error al exportar operación:", err);
            alert("Error al registrar la operación en el libro diario: " + (err.message || ''));
        }
    };

    /** Sincroniza bajo demanda un comprobante ya completado hacia Cuenta Corriente y Cash Flow */
    const handleSyncCtaCteAndCashFlow = async (req) => {
        if (!req || syncingCtaCteId) return;
        const party = getPartyDetails(req);
        const targetUids = resolveTargetClientUids(req, party);
        if (targetUids.length === 0) {
            return alert("No se pudo determinar el cliente destino. Por favor asigna el comprobante a un cliente de la lista.");
        }
        const parsedMonto = parseAmount(req.aiData?.monto_total ?? req.manualData?.monto ?? 0);
        if (!parsedMonto || parsedMonto <= 0) {
            return alert("El comprobante no tiene un monto válido para sincronizar.");
        }

        setSyncingCtaCteId(req.id);
        try {
            const res = await syncAccountingOrchestration(req, {
                party,
                syncOperations: !req.exportedToOperations && autoRegisterInBook,
                syncCtaCte: true,
                syncCashFlow: true,
                ctaCteMode: ctaCteSyncMode
            });
            if (!res.synced) {
                alert("No se pudieron sincronizar los módulos contables destino.");
            }
        } catch (err) {
            console.error("Error al sincronizar Cta. Cte. y Cash Flow:", err);
            alert("Error al sincronizar Cta. Cte. y Cash Flow: " + (err.message || ''));
        } finally {
            setSyncingCtaCteId(null);
        }
    };

    /** Bloque compartido de controles 360° (Libro + Cuenta Corriente + Cash Flow) */
    const renderOrchestrationControls = (isVenta) => (
        <div className="space-y-2.5 bg-slate-50/90 p-3 rounded-2xl border border-slate-200/80">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-1 flex items-center gap-1.5">
                <Icon name="Layers" size={11} className="text-indigo-500"/> Orquestación Contable 360°
            </p>

            {/* Toggle: Libro de Operaciones (en ventas; compras siempre imputa en libro) */}
            {isVenta && (
                <div
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                        autoRegisterInBook
                            ? 'bg-indigo-50 border-indigo-200'
                            : 'bg-white border-gray-200'
                    }`}
                    onClick={() => setAutoRegisterInBook(!autoRegisterInBook)}
                >
                    <div className="flex items-center gap-2">
                        <Icon name="BookOpen" size={14} className={autoRegisterInBook ? 'text-indigo-600' : 'text-gray-400'}/>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${autoRegisterInBook ? 'text-indigo-800' : 'text-gray-500'}`}>
                            Libro de Operaciones
                        </span>
                    </div>
                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${autoRegisterInBook ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${autoRegisterInBook ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                    </div>
                </div>
            )}

            {/* Toggle: Cuenta Corriente (Deudores / Proveedores) + Selector de Modo */}
            <div className={`rounded-xl border transition-all ${autoSyncCtaCte ? 'bg-blue-50/70 border-blue-200' : 'bg-white border-gray-200'}`}>
                <div
                    className="flex items-center justify-between p-2.5 cursor-pointer select-none"
                    onClick={() => setAutoSyncCtaCte(!autoSyncCtaCte)}
                >
                    <div className="flex items-center gap-2">
                        <Icon name="Users" size={14} className={autoSyncCtaCte ? 'text-blue-600' : 'text-gray-400'}/>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${autoSyncCtaCte ? 'text-blue-800' : 'text-gray-500'}`}>
                            Cta. Cte. ({isVenta ? 'Deudores' : 'Proveedores'})
                        </span>
                    </div>
                    <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${autoSyncCtaCte ? 'bg-blue-600' : 'bg-gray-300'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${autoSyncCtaCte ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                    </div>
                </div>

                {autoSyncCtaCte && (
                    <div className="px-2.5 pb-2.5 flex gap-1">
                        {[
                            { id: 'factura_y_pago', label: 'Fact. + Pago' },
                            { id: 'solo_factura', label: 'Solo Fact.' },
                            { id: 'solo_pago', label: 'Solo Pago' }
                        ].map((modeOpt) => (
                            <button
                                key={modeOpt.id}
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCtaCteSyncMode(modeOpt.id);
                                }}
                                className={`flex-1 py-1.5 px-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                    ctaCteSyncMode === modeOpt.id
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'bg-white text-gray-600 hover:bg-blue-100/60 border border-blue-100'
                                }`}
                            >
                                {modeOpt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Toggle: Cash Flow */}
            <div
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                    autoSyncCashFlow
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-white border-gray-200'
                }`}
                onClick={() => setAutoSyncCashFlow(!autoSyncCashFlow)}
            >
                <div className="flex items-center gap-2">
                    <Icon name="TrendingUp" size={14} className={autoSyncCashFlow ? 'text-emerald-600' : 'text-gray-400'}/>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${autoSyncCashFlow ? 'text-emerald-800' : 'text-gray-500'}`}>
                        Conciliar Cash Flow ({isVenta ? 'Ingreso' : 'Egreso'})
                    </span>
                </div>
                <div className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${autoSyncCashFlow ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ${autoSyncCashFlow ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                </div>
            </div>
        </div>
    );

    /** Bloque compartido de estado post-imputación con accesos directos 360° */
    const renderCompletedSyncStatus = (req, party) => {
        const resolvedUid = resolveTargetClientUids(req, party)[0];
        const inspectPayload = {
            terceroId: party.terceroMatch?.id || resolvedUid,
            userId: resolvedUid || (req.userId !== 'unassigned' ? req.userId : null),
            cuit: party.clienteCuit,
            name: party.clienteNombre
        };
        const ctaCteRoute = req.lastCtaCteTerceroId
            ? `${party.isVenta ? 'gestion/deudores' : 'gestion/proveedores'}/${req.lastCtaCteTerceroId}`
            : (party.isVenta ? 'gestion/deudores' : 'gestion/proveedores');

        return (
            <div className="space-y-2 mt-2">
                {!req.exportedToOperations ? (
                    <button
                        onClick={() => handleExportToOperations(req)}
                        className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border border-indigo-200 flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-xs"
                    >
                        <Icon name="BookOpen" size={14}/> Asentar en Libro y Cta. Cte.
                    </button>
                ) : (
                    <div className="w-full bg-emerald-50 text-emerald-800 py-2.5 px-3 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-emerald-200 flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Icon name="CheckCircle" size={14} className="text-emerald-600"/> Asentado en Libro Diario</span>
                        <button
                            onClick={() => handleInspectClient(inspectPayload, 'operations')}
                            className="text-emerald-900 hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
                            title="Ver en Libro de Operaciones"
                        >
                            Ver Libro <Icon name="ArrowRight" size={12}/>
                        </button>
                    </div>
                )}

                {req.syncedToCtaCte && (
                    <div className="w-full bg-blue-50 text-blue-800 py-2 px-3 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-blue-200 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Icon name="Users" size={13} className="text-blue-600"/>
                            Cta. Cte. ({party.isVenta ? 'Deudores' : 'Proveedores'})
                        </span>
                        <button
                            onClick={() => handleInspectClient(inspectPayload, ctaCteRoute)}
                            className="text-blue-900 hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
                            title="Abrir Cuenta Corriente"
                        >
                            Ver Cta. Cte. <Icon name="ArrowRight" size={12}/>
                        </button>
                    </div>
                )}

                {req.syncedToCashFlow && (
                    <div className="w-full bg-teal-50 text-teal-800 py-2 px-3 rounded-xl font-bold text-[10px] uppercase tracking-wider border border-teal-200 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                            <Icon name="TrendingUp" size={13} className="text-teal-600"/>
                            Cash Flow Conciliado
                        </span>
                        <button
                            onClick={() => handleInspectClient(inspectPayload, 'finances')}
                            className="text-teal-900 hover:underline font-extrabold flex items-center gap-1 cursor-pointer"
                            title="Abrir Módulo Financiero"
                        >
                            Ver Cash Flow <Icon name="ArrowRight" size={12}/>
                        </button>
                    </div>
                )}

                {(!req.syncedToCtaCte || !req.syncedToCashFlow) && (
                    <button
                        onClick={() => handleSyncCtaCteAndCashFlow(req)}
                        disabled={syncingCtaCteId === req.id}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 px-3 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <Icon name="RefreshCw" size={13} className={syncingCtaCteId === req.id ? 'animate-spin' : ''}/>
                        {syncingCtaCteId === req.id ? 'Sincronizando...' : 'Sincronizar Cta. Cte. y Cash Flow'}
                    </button>
                )}
            </div>
        );
    };

    const toggleDetails = (id) => setExpandedRowId(expandedRowId === id ? null : id);

    const sendWhatsAppNotification = (req) => {
        let phone = getReceptorPhone(req);
        if (!phone) {
            phone = prompt(
                "Ingresa el número de WhatsApp del cliente (ej: 381 555 1234):\nO deja el campo vacío y presiona 'Aceptar' para elegir el contacto directamente en WhatsApp:"
            );
            if (phone === null) return;
        }

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

        openWhatsApp(phone, mensaje);
    };

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
                    {/* Filtro por Cliente */}
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

                    {/* Selector de Período Temporal */}
                    <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2">
                        <Icon name="Calendar" className="w-4 h-4 text-blue-600 ml-2"/>
                        <select 
                            value={periodPreset} 
                            onChange={(e) => setPeriodPreset(e.target.value)} 
                            className="bg-transparent border-none text-sm font-bold text-gray-800 focus:ring-0 outline-none pr-8 cursor-pointer"
                        >
                            <option value="mes_actual">📅 Mes en Curso</option>
                            <option value="mes_anterior">⏮️ Mes Anterior</option>
                            <option value="ultimos_12_meses">📈 Últimos 12 Meses</option>
                            <option value="anio_actual">📆 Año en Curso ({new Date().getFullYear()})</option>
                            <option value="personalizado">🗓️ Rango de Fechas Personalizado</option>
                            <option value="especifico">🔍 Año / Mes Específico</option>
                            <option value="todos">🌐 Histórico Completo</option>
                        </select>
                    </div>

                    {/* Inputs de Rango Personalizado */}
                    {periodPreset === 'personalizado' && (
                        <div className="bg-white px-3 py-2 rounded-2xl shadow-sm border border-blue-200 flex items-center gap-2 animate-in fade-in duration-200">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Desde</span>
                            <input 
                                type="date" 
                                value={customStartDate} 
                                onChange={(e) => setCustomStartDate(e.target.value)} 
                                className="bg-slate-50 border border-slate-200 text-xs font-bold text-gray-700 rounded-xl px-2 py-1 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                            />
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Hasta</span>
                            <input 
                                type="date" 
                                value={customEndDate} 
                                onChange={(e) => setCustomEndDate(e.target.value)} 
                                className="bg-slate-50 border border-slate-200 text-xs font-bold text-gray-700 rounded-xl px-2 py-1 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                            />
                            {(customStartDate || customEndDate) && (
                                <button 
                                    onClick={() => { setCustomStartDate(''); setCustomEndDate(''); }}
                                    className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-slate-100 transition-all text-xs font-bold"
                                    title="Limpiar fechas"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    )}

                    {/* Controles para Año / Mes Específico */}
                    {periodPreset === 'especifico' && (
                        <>
                            <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2 animate-in fade-in duration-200">
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
                            <div className="bg-white p-2 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-2 animate-in fade-in duration-200">
                                <Icon name="Clock" className="w-4 h-4 text-gray-400 ml-2"/>
                                <select 
                                    value={selectedMonth} 
                                    onChange={(e) => setSelectedMonth(e.target.value)} 
                                    className="bg-transparent border-none text-sm font-bold text-gray-700 focus:ring-0 outline-none pr-8 cursor-pointer"
                                >
                                    {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </>
                    )}
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
            {metrics.isConsolidatedModule ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex items-center gap-6 group overflow-hidden relative">
                        <div className="absolute -right-4 -top-4 text-blue-50/40 group-hover:scale-110 transition-transform">
                            <Icon name="TrendingUp" size={120} />
                        </div>
                        <div className="p-4 rounded-2xl relative z-10 bg-blue-50 text-blue-600 border border-blue-100/60">
                            <Icon name="TrendingUp" size={32} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                Total Facturado (Ventas) {getPeriodLabel()}
                            </p>
                            <h3 className="text-3xl font-black text-blue-700 tracking-tight">{formatCurrency(metrics.totalFacturado)}</h3>
                        </div>
                    </div>
                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex items-center gap-6 group overflow-hidden relative">
                        <div className="absolute -right-4 -top-4 text-rose-50/40 group-hover:scale-110 transition-transform">
                            <Icon name="ShoppingBag" size={120} />
                        </div>
                        <div className="p-4 rounded-2xl relative z-10 bg-rose-50 text-rose-600 border border-rose-100/60">
                            <Icon name="ShoppingBag" size={32} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                Total Compras y Gastos {getPeriodLabel()}
                            </p>
                            <h3 className="text-3xl font-black text-rose-600 tracking-tight">{formatCurrency(metrics.totalComprasGastos || 0)}</h3>
                        </div>
                    </div>
                    <div className="bg-white p-8 rounded-[32px] shadow-sm border border-blue-50/80 flex items-center gap-6 group overflow-hidden relative">
                        <div className="absolute -right-4 -top-4 text-amber-50/40 group-hover:scale-110 transition-transform">
                            <Icon name="Clock" size={120} />
                        </div>
                        <div className="bg-amber-50 p-4 rounded-2xl text-amber-600 border border-amber-100/60 relative z-10">
                            <Icon name="History" size={32} />
                        </div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                Pendientes Globales {getPeriodLabel()}
                            </p>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{formatCurrency(metrics.totalPendiente)}</h3>
                        </div>
                    </div>
                </div>
            ) : (
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
            )}

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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 p-8 bg-blue-50/10 border-b border-blue-50">
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
                                        <div className="bg-rose-50 p-3 rounded-xl text-rose-600 border border-rose-100">
                                            <Icon name="ShoppingBag" size={24}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compras / Gastos</p>
                                            <p className="text-xl font-black text-rose-600 mt-0.5">{formatCurrency(selectedConsolidatedClient.totalComprasGastos || 0)}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white p-6 rounded-2xl border border-blue-50 shadow-xs flex items-center gap-4 group hover:shadow-md transition-all">
                                        <div className="bg-amber-50 p-3 rounded-xl text-amber-600 border border-amber-100">
                                            <Icon name="Clock" size={24}/>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pendiente</p>
                                            <p className="text-xl font-black text-amber-700 mt-0.5">{formatCurrency(selectedConsolidatedClient.totalPendiente)}</p>
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
                                                                    <div className="flex flex-col">
                                                                        <span>{req.aiData?.fecha_pago || req.timestamp?.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                                                        {(() => {
                                                                            const susp = checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha);
                                                                            if (!susp) return null;
                                                                            return (
                                                                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300 mt-1 w-fit shadow-xs animate-pulse" title={susp.reason}>
                                                                                    <Icon name="AlertTriangle" size={11} className="text-amber-600" /> Año {susp.detectedYear} (Actual: {susp.currentYear})
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-black uppercase tracking-widest" title="Entidad / Destino donde cobró el Cliente">
                                                                            {req.isManualEntry 
                                                                                ? 'Manual' 
                                                                                : (party.clienteBanco && party.clienteBanco !== '-' 
                                                                                    ? party.clienteBanco 
                                                                                    : (party.isVenta 
                                                                                        ? (req.aiData?.banco_receptor || req.aiData?.aplicacion_pago) 
                                                                                        : (req.aiData?.banco_origen || req.aiData?.aplicacion_pago)) || 'Extraído')}
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
                                                                                    <div className="flex justify-between items-center mb-6">
                                                                                        <div>
                                                                                            <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Detalle Técnico Extraído</h4>
                                                                                            <span className={`inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${party.isVenta ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                                                                                                {party.isVenta ? 'Ingreso Comercial / Venta' : `Egreso / ${party.tipoClasificacion === 'compra' ? 'Compra' : 'Gasto'}`}
                                                                                            </span>
                                                                                        </div>
                                                                                        <button 
                                                                                            onClick={() => openEditModal(req)} 
                                                                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${req.status === 'pending' && !req.aiData && !req.isManualEntry ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-50 cursor-pointer'}`}
                                                                                        >
                                                                                            <Icon name="Edit" size={14}/> {req.status === 'pending' && !req.aiData && !req.isManualEntry ? 'Procesando...' : 'Corregir'}
                                                                                        </button>
                                                                                    </div>

                                                                                    {/* Banner de alerta interactivo si la fecha es sospechosa */}
                                                                                    {(() => {
                                                                                        const susp = checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha);
                                                                                        if (!susp) return null;
                                                                                        return (
                                                                                            <div className="mb-6 p-4 bg-amber-50/95 border-2 border-amber-300 rounded-2xl shadow-sm text-amber-950 animate-in fade-in duration-300">
                                                                                                <div className="flex items-start gap-3">
                                                                                                    <div className="p-2 bg-amber-200/90 rounded-xl text-amber-800 shrink-0 mt-0.5">
                                                                                                        <Icon name="AlertTriangle" size={18} />
                                                                                                    </div>
                                                                                                    <div className="flex-1">
                                                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                                                            <h5 className="font-black text-xs text-amber-900 tracking-tight">
                                                                                                                Atención: Fecha detectada en {susp.detectedYear} (Año actual: {susp.currentYear})
                                                                                                            </h5>
                                                                                                            <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-black text-[9px] uppercase rounded-full tracking-wider">
                                                                                                                Verificar Fecha
                                                                                                            </span>
                                                                                                        </div>
                                                                                                        <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                                                                                                            {susp.reason}
                                                                                                        </p>
                                                                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => handleQuickFixDate(req, susp.suggestedCorrectedDate)}
                                                                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                                                                                                title={`Cambiar año ${susp.detectedYear} a ${susp.currentYear} manteniendo día y mes`}
                                                                                                            >
                                                                                                                <Icon name="Calendar" size={13} /> Corregir a {susp.suggestedCorrectedDisplay}
                                                                                                            </button>
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => handleQuickFixDate(req, susp.todayDate)}
                                                                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                                                                                                title="Asignar la fecha de hoy"
                                                                                                            >
                                                                                                                <Icon name="Clock" size={13} /> Usar Hoy ({susp.todayDisplay})
                                                                                                            </button>
                                                                                                            <button
                                                                                                                type="button"
                                                                                                                onClick={() => openEditModal(req)}
                                                                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/80 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                                                                                                title="Modificar manualmente en el panel de edición"
                                                                                                            >
                                                                                                                <Icon name="Edit" size={13} /> Modificar manual
                                                                                                            </button>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    })()}

                                                                                    <div className="grid grid-cols-2 gap-6 mb-8">
                                                                                        <div>
                                                                                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fecha de Pago</p>
                                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                                <p className={`font-bold ${checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha) ? 'text-amber-800 font-black' : 'text-gray-800'}`}>
                                                                                                    {req.aiData?.fecha_pago || 'S/D'}
                                                                                                </p>
                                                                                                {checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha) && (
                                                                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black rounded-md">
                                                                                                        ⚠️ {checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha).detectedYear}
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
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
                                                                                                {/* Orquestación Contable 360° */}
                                                                                                {renderOrchestrationControls(true)}
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

                                                                                                {renderOrchestrationControls(false)}

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
                                                                                            {renderCompletedSyncStatus(req, party)}
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
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            Total Facturado <span className="text-blue-600 font-bold lowercase">{getPeriodLabel()}</span>
                                        </th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            Total Compras / Gastos <span className="text-rose-600 font-bold lowercase">{getPeriodLabel()}</span>
                                        </th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Pendiente</th>
                                        <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Comprobantes</th>
                                        <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Último Movimiento</th>
                                        <th className="px-8 py-5"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-50">
                                    {loading ? (
                                        <tr><td colSpan="8" className="text-center py-24 text-gray-400 font-bold animate-pulse">Sincronizando consolidado...</td></tr>
                                    ) : clientBillingSummary.length === 0 ? (
                                        <tr><td colSpan="8" className="text-center py-24 text-gray-400 font-bold italic">No se encontraron clientes.</td></tr>
                                    ) : (
                                        clientBillingSummary.map(client => (
                                            <tr key={client.key} className="hover:bg-blue-50/30 transition-all">
                                                <td className="px-8 py-6 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-black text-gray-900 leading-tight">{client.name}</span>
                                                        {client.isInTerceros ? (
                                                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200" title="Registrado en Gestión de Terceros">
                                                                <Icon name="CheckCircle" size={10} /> En Gestión
                                                            </span>
                                                        ) : (
                                                            userData?.isAdmin && client.cuit && client.cuit !== 'Sin CUIT' && (
                                                                <button
                                                                    onClick={() => handleCreateTerceroQuick(client)}
                                                                    disabled={creatingTerceroCuit === cleanCuit(client.cuit)}
                                                                    className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer shadow-2xs active:scale-95"
                                                                    title="Dar de alta como Cliente en Gestión de Terceros"
                                                                >
                                                                    <Icon name="UserPlus" size={10} />
                                                                    {creatingTerceroCuit === cleanCuit(client.cuit) ? 'Creando...' : '+ Crear en Gestión'}
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 whitespace-nowrap text-sm font-bold text-gray-500 font-mono">
                                                    {client.cuit}
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="text-sm font-black text-blue-600 tracking-tight">
                                                        {formatCurrency(client.totalFacturado)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="text-sm font-black text-rose-600 tracking-tight">
                                                        {formatCurrency(client.totalComprasGastos || 0)}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right whitespace-nowrap">
                                                    <div className="text-sm font-black text-amber-600 tracking-tight">
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
                                                    <div className="flex flex-col">
                                                        <span>{req.aiData?.fecha_pago || req.timestamp?.toDate().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                                                        {(() => {
                                                            const susp = checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha);
                                                            if (!susp) return null;
                                                            return (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300 mt-1 w-fit shadow-xs animate-pulse" title={susp.reason}>
                                                                    <Icon name="AlertTriangle" size={11} className="text-amber-600" /> Año {susp.detectedYear} (Actual: {susp.currentYear})
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>
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
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-black text-gray-900 leading-tight">{party.clienteNombre}</span>
                                                            {party.terceroMatch ? (
                                                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0" title="Registrado en Gestión de Terceros">
                                                                    Gestión
                                                                </span>
                                                            ) : (
                                                                userData?.isAdmin && party.clienteCuit && party.clienteCuit !== 'S/D' && (
                                                                    <button 
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleCreateTerceroQuick({
                                                                                name: party.clienteNombre,
                                                                                cuit: party.clienteCuit,
                                                                                phone: getReceptorPhone(req)
                                                                            });
                                                                        }}
                                                                        disabled={creatingTerceroCuit === cleanCuit(party.clienteCuit)}
                                                                        className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all cursor-pointer shrink-0"
                                                                        title="Dar de alta como Cliente en Gestión de Terceros"
                                                                    >
                                                                        <Icon name="UserPlus" size={9} />
                                                                        {creatingTerceroCuit === cleanCuit(party.clienteCuit) ? '...' : '+ En Gestión'}
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-gray-400 font-black uppercase tracking-tighter mt-0.5">
                                                            CUIT: {party.clienteCuit}
                                                        </div>
                                                        {party.nombreFantasia && (
                                                            <div className="text-[10px] text-blue-600 font-bold tracking-tight">
                                                                Local / Fantasía: {party.nombreFantasia}
                                                            </div>
                                                        )}
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
                                                        {/* Badge de Banco / Medio de Cobro o Pago del Cliente */}
                                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[9px] font-bold uppercase tracking-wider" title="Entidad / Destino donde cobró el Cliente">
                                                            {req.isManualEntry 
                                                                ? 'Manual' 
                                                                : (party.clienteBanco && party.clienteBanco !== '-' 
                                                                    ? party.clienteBanco 
                                                                    : (party.isVenta 
                                                                        ? (req.aiData?.banco_receptor || req.aiData?.aplicacion_pago) 
                                                                        : (req.aiData?.banco_origen || req.aiData?.aplicacion_pago)) || 'Extraído')}
                                                        </span>
                                                        {/* Badge de Terminal POS (si aplica) */}
                                                        {req.aiData?.tipo_ticket_pos && req.aiData.tipo_ticket_pos !== 'no_aplica' && (
                                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-[9px] font-black uppercase tracking-wider">
                                                                {req.aiData.tipo_ticket_pos === 'copia_comercio' ? 'Copia Comercio' : 'Ticket Cliente'}
                                                            </span>
                                                        )}
                                                        {req.aiData?.cuotas && (
                                                            <span className="px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded-full text-[9px] font-black uppercase tracking-wider">
                                                                {req.aiData.cuotas}
                                                            </span>
                                                        )}
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
                                                                            title="Volver a analizar con IA Gemini 3.8 Flash"
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

                                                                {/* Banner de alerta interactivo si la fecha es sospechosa */}
                                                                {(() => {
                                                                    const susp = checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha);
                                                                    if (!susp) return null;
                                                                    return (
                                                                        <div className="mb-6 p-4 bg-amber-50/95 border-2 border-amber-300 rounded-2xl shadow-sm text-amber-950 animate-in fade-in duration-300">
                                                                            <div className="flex items-start gap-3">
                                                                                <div className="p-2 bg-amber-200/90 rounded-xl text-amber-800 shrink-0 mt-0.5">
                                                                                    <Icon name="AlertTriangle" size={18} />
                                                                                </div>
                                                                                <div className="flex-1">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <h5 className="font-black text-xs text-amber-900 tracking-tight">
                                                                                            Atención: Fecha detectada en {susp.detectedYear} (Año actual: {susp.currentYear})
                                                                                        </h5>
                                                                                        <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-black text-[9px] uppercase rounded-full tracking-wider">
                                                                                            Verificar Fecha
                                                                                        </span>
                                                                                    </div>
                                                                                    <p className="text-[11px] text-amber-800 mt-1 leading-relaxed">
                                                                                        {susp.reason}
                                                                                    </p>
                                                                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleQuickFixDate(req, susp.suggestedCorrectedDate)}
                                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                                                                            title={`Cambiar año ${susp.detectedYear} a ${susp.currentYear} manteniendo día y mes`}
                                                                                        >
                                                                                            <Icon name="Calendar" size={13} /> Corregir a {susp.suggestedCorrectedDisplay}
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleQuickFixDate(req, susp.todayDate)}
                                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                                                                                            title="Asignar la fecha de hoy"
                                                                                        >
                                                                                            <Icon name="Clock" size={13} /> Usar Hoy ({susp.todayDisplay})
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => openEditModal(req)}
                                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/80 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                                                                            title="Modificar manualmente en el panel de edición"
                                                                                        >
                                                                                            <Icon name="Edit" size={13} /> Modificar manual
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}

                                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Fecha de Pago</p>
                                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                                            <p className={`font-bold text-sm ${checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha) ? 'text-amber-800 font-black' : 'text-gray-800'}`}>
                                                                                {req.aiData?.fecha_pago || 'S/D'}
                                                                            </p>
                                                                            {checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha) && (
                                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black rounded-md">
                                                                                    ⚠️ {checkSuspiciousDate(req.aiData?.fecha_pago || req.manualData?.fecha).detectedYear}
                                                                                </span>
                                                                            )}
                                                                        </div>
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

                                                                {(req.aiData?.medio_pago_detalle || req.aiData?.cuotas || (req.aiData?.tipo_ticket_pos && req.aiData.tipo_ticket_pos !== 'no_aplica')) && (
                                                                    <div className="mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-base">💳</span>
                                                                            <span className="font-bold text-gray-800">{req.aiData.medio_pago_detalle || 'Cobro con tarjeta / POS'}</span>
                                                                            {req.aiData.cuotas && (
                                                                                <span className="px-2 py-0.5 bg-violet-100 text-violet-800 rounded-lg text-[10px] font-black uppercase">
                                                                                    {req.aiData.cuotas}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        {req.aiData.tipo_ticket_pos && req.aiData.tipo_ticket_pos !== 'no_aplica' && (
                                                                            <span className="text-[10px] font-mono font-bold text-gray-600 uppercase bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                                                                                {req.aiData.tipo_ticket_pos === 'copia_comercio' ? 'Copia Comercio (Venta)' : 'Ticket Cliente (Gasto)'}
                                                                            </span>
                                                                        )}
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
                                                                                {/* Orquestación Contable 360° */}
                                                                                {renderOrchestrationControls(true)}
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

                                                                            {renderOrchestrationControls(false)}

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

                                                                        {renderCompletedSyncStatus(req, party)}
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
            
            {/* Modal de Creación (Multi-archivo Drag & Drop + Carga Manual + Lightbox) */}
            <CreateBillingRequestModal
                isOpen={showModal}
                onClose={resetModalState}
                createMode={createMode}
                setCreateMode={setCreateMode}
                manualData={manualData}
                setManualData={setManualData}
                newRequestFiles={newRequestFiles}
                newRequestNote={newRequestNote}
                setNewRequestNote={setNewRequestNote}
                fileError={fileError}
                uploadProgress={uploadProgress}
                uploading={uploading}
                isDragging={isDragging}
                previewItem={previewItem}
                setPreviewItem={setPreviewItem}
                onSubmit={handleCreateRequest}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onFileSelection={handleFileSelection}
                onRemoveFile={handleRemoveFile}
            />

            {/* Modal de Edición Completo */}
            <EditBillingRequestModal
                editingRequest={editingRequest}
                editFormData={editFormData}
                setEditFormData={setEditFormData}
                onClose={() => setEditingRequest(null)}
                onSubmit={handleSaveEdits}
            />

            {/* Modal de Asignación de Cliente en 1 Clic */}
            <AssignClientModal
                assigningRequest={assigningRequest}
                selectedAssignUserId={selectedAssignUserId}
                setSelectedAssignUserId={setSelectedAssignUserId}
                systemUsers={systemUsers}
                isAdminPhone={isAdminPhone}
                onClose={() => setAssigningRequest(null)}
                onAssign={handleAssignClient}
            />

            {/* Modal de Conexión y Vinculación WhatsApp */}
            {showWhatsAppModal && <WhatsAppConnectionModal onClose={() => setShowWhatsAppModal(false)} />}
        </div>
    );
};

export default BillingRequestsPage;
