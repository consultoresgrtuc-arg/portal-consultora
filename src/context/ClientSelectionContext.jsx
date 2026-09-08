import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const ClientSelectionContext = createContext();

export const ClientSelectionProvider = ({ children }) => {
    const { user, userData } = useAuth();
    const [clientList, setClientList] = useState([]);
    const [loadingClients, setLoadingClients] = useState(false);

    // Entidad propia del estudio por defecto
    const studioEntity = useMemo(() => ({
        id: user?.uid || 'studio',
        name: userData?.nombre || 'Mi Estudio Contable (GyR)',
        cuit: userData?.cuit || '20-00000000-0',
        email: user?.email || '',
        isStudio: true
    }), [user?.uid, user?.email, userData?.nombre, userData?.cuit]);

    const [activeEntity, setActiveEntity] = useState(studioEntity);

    // Si el usuario cambia o se actualiza el perfil del admin, sincronizamos la entidad del estudio si estaba activa
    useEffect(() => {
        if (activeEntity.isStudio) {
            setActiveEntity(studioEntity);
        }
    }, [studioEntity]);

    // Cargar la lista de clientes si el usuario es Administrador
    // EXCLUSIVAMENTE desde Gestión de Terceros (clientes del estudio que hacen match en Facturación)
    // dejando afuera a los usuarios del panel admin que se usan para fines de gestión de plataforma/accesos.
    useEffect(() => {
        if (!userData?.isAdmin || !user?.uid) {
            setClientList([]);
            setLoadingClients(false);
            return;
        }

        setLoadingClients(true);

        const qTerceros = query(collection(db, 'users', user.uid, 'terceros'));
        const unsubscribe = onSnapshot(qTerceros, (snapshot) => {
            const list = [];
            snapshot.docs.forEach(docSnap => {
                const t = docSnap.data();
                const tipo = (t.tipo || 'Cliente').toLowerCase();
                if (tipo === 'proveedor') return; // Omitir proveedores puros en el selector de clientes
                
                list.push({
                    id: docSnap.id,
                    terceroId: docSnap.id,
                    name: t.nombre || 'Cliente sin nombre',
                    cuit: t.cuit || 'S/D',
                    email: t.email || '',
                    telefono: t.telefono || '',
                    isStudio: false,
                    source: 'tercero',
                    categoriaTributaria: t.categoriaTributaria || 'Monotributo',
                    modoFacturacion: 'estudio'
                });
            });

            list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setClientList(list);
            setLoadingClients(false);
        }, (error) => {
            console.error("Error al cargar lista de clientes de terceros para selector:", error);
            setLoadingClients(false);
        });

        return () => unsubscribe();
    }, [userData?.isAdmin, user?.uid]);

    // Si el usuario no es admin, siempre forzamos su propia entidad
    const targetUserId = useMemo(() => {
        if (!userData?.isAdmin) {
            return user?.uid;
        }
        return activeEntity?.id || user?.uid;
    }, [userData?.isAdmin, activeEntity?.id, user?.uid]);

    const isViewingClient = useMemo(() => {
        return Boolean(userData?.isAdmin && activeEntity && !activeEntity.isStudio);
    }, [userData?.isAdmin, activeEntity]);

    const resetToStudio = () => {
        setActiveEntity(studioEntity);
    };

    const selectClientById = (clientIdOrCuit) => {
        if (!clientIdOrCuit) return false;
        const normSearch = String(clientIdOrCuit).replace(/\D/g, '');
        const found = clientList.find(c => {
            if (c.id === clientIdOrCuit || c.terceroId === clientIdOrCuit || c.userId === clientIdOrCuit) return true;
            if (normSearch && normSearch.length >= 10 && (c.cuit || '').replace(/\D/g, '') === normSearch) return true;
            return false;
        });
        if (found) {
            setActiveEntity(found);
            return true;
        }
        return false;
    };

    const value = {
        activeEntity,
        setActiveEntity,
        studioEntity,
        clientList,
        clients: clientList, // Alias para compatibilidad completa
        loadingClients,
        targetUserId,
        isViewingClient,
        resetToStudio,
        selectClientById
    };

    return (
        <ClientSelectionContext.Provider value={value}>
            {children}
        </ClientSelectionContext.Provider>
    );
};

export const useClientSelection = () => {
    const context = useContext(ClientSelectionContext);
    if (!context) {
        throw new Error('useClientSelection debe ser usado dentro de un ClientSelectionProvider');
    }
    return context;
};
