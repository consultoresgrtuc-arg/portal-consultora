import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Icon from '../Common/Icon';
import ClientCenterPage from '../ClientCenter/ClientCenterPage';

const AdminClientManagementPage = ({ userId, navigate }) => {
    const [clientData, setClientData] = useState(null);
    const [loading, setLoading] = useState(true);

    const toggleModule = async (moduleId) => {
        const currentPerms = clientData?.permisos || {
            dashboard: true, operaciones: true, gestion: true, finanzas: true, reportes: true, cliente: true, perfil: true, microcreditos: false, facturacion: false
        };
        
        const newPerms = { ...currentPerms, [moduleId]: !currentPerms[moduleId] };
        try {
            await updateDoc(doc(db, "users", userId), { permisos: newPerms });
            setClientData({ ...clientData, permisos: newPerms });
        } catch(err) {
            alert("Error actualizando permiso: " + err.message);
        }
    };

    useEffect(() => {
        const fetchClientData = async () => {
            if (!userId) return;
            setLoading(true);
            try {
                const clientDocRef = doc(db, "users", userId);
                const clientDoc = await getDoc(clientDocRef);
                if (clientDoc.exists()) {
                    setClientData(clientDoc.data());
                }
            } catch (error) {
                console.error("Error fetching client data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchClientData();
    }, [userId]);

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-4">
                <button 
                    onClick={() => navigate('admin')} 
                    className="flex items-center gap-3 px-5 py-2.5 bg-white text-gray-700 rounded-2xl hover:bg-gray-50 font-bold transition-all shadow-sm border border-gray-100 group"
                >
                    <Icon name="ArrowLeft" className="w-5 h-5 group-hover:-translate-x-1 transition-transform text-blue-500"/> 
                    Volver al Panel Admin
                </button>
                {clientData && (
                    <div className="flex items-center gap-4 bg-blue-600 text-white p-4 rounded-3xl shadow-lg shadow-blue-200">
                        <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center font-black text-lg">
                            {clientData.nombre?.[0] || '?'}
                        </div>
                        <div>
                            <h2 className="text-xl font-black leading-none">{clientData.nombre}</h2>
                            <p className="text-xs font-bold text-blue-100 mt-1 uppercase tracking-widest">{clientData.email}</p>
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="text-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto"></div>
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-[30px] p-6 border border-gray-100 shadow-sm mb-6">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center mb-4">
                            <Icon name="LayoutDashboard" className="w-5 h-5 mr-2 text-blue-500" />
                            Gestión de Accesos a Módulos
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { id: 'dashboard', name: 'Dashboard' },
                                { id: 'facturacion', name: 'Facturación' },
                                { id: 'operaciones', name: 'Operaciones' },
                                { id: 'gestion', name: 'Gestión' },
                                { id: 'finanzas', name: 'Finanzas' },
                                { id: 'reportes', name: 'Reportes' },
                                { id: 'microcreditos', name: 'Microcréditos' },
                                { id: 'cliente', name: 'Cliente' },
                                { id: 'perfil', name: 'Perfil' }
                            ].map(mod => {
                                const currentPerms = clientData?.permisos || {
                                    dashboard: true, operaciones: true, gestion: true, finanzas: true, reportes: true, cliente: true, perfil: true, microcreditos: false, facturacion: false
                                };
                                const isEnabled = currentPerms[mod.id];
                                return (
                                    <div key={mod.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                        <span className="text-sm font-bold text-gray-700">{mod.name}</span>
                                        <button 
                                            onClick={() => toggleModule(mod.id)}
                                            className={`relative inline-flex items-center h-6 rounded-full w-12 transition-all duration-300 focus:outline-none ${isEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ${isEnabled ? 'translate-x-7' : 'translate-x-1'}`}/>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="bg-gray-50/50 rounded-[40px] p-2 border border-gray-100">
                        <ClientCenterPage 
                            isManagedView={true} 
                            managedUserId={userId} 
                            managedClientName={clientData?.nombre} 
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default AdminClientManagementPage;
