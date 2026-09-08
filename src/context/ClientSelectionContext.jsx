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
    useEffect(() => {
        if (!userData?.isAdmin) {
            setClientList([]);
            setLoadingClients(false);
            return;
        }

        setLoadingClients(true);
        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const clients = snapshot.docs
                .map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data()
                }))
                // Excluimos la propia cuenta del administrador de la lista de clientes regulares
                .filter(u => u.id !== user?.uid && !u.email?.toLowerCase().includes('admin') && !u.isAdmin)
                .map(c => ({
                    id: c.id,
                    name: c.nombre || c.razonSocial || c.email || 'Cliente sin nombre',
                    cuit: c.cuit || 'S/D',
                    email: c.email || '',
                    isStudio: false,
                    categoriaTributaria: c.categoriaTributaria || 'Monotributo',
                    modoFacturacion: c.modoFacturacion || 'estudio'
                }));

            setClientList(clients);
            setLoadingClients(false);
        }, (error) => {
            console.error("Error al cargar lista de clientes para selector:", error);
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

    const selectClientById = (clientId) => {
        const found = clientList.find(c => c.id === clientId);
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
