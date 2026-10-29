import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';

const NotificationPanel = ({ navigate, setClientCenterFolder }) => {
    const { notifications, loadingNotifications, user } = useAuth();

    const handleNotificationClick = async (notif) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'users', user.uid, 'notifications', notif.id));
            if (notif.title === "Nuevo Documento del Contador" || notif.type === "info") {
                if (setClientCenterFolder) setClientCenterFolder('documentos_del_contador');
                if (navigate) navigate('client-center');
            }
        } catch (error) {
            console.error("Error al procesar la notificación:", error);
        }
    };

    const getIcon = (type) => {
        switch(type) {
            case 'warning': return 'AlertTriangle';
            case 'info': return 'File';
            default: return 'CheckCircle';
        }
    };

    const getColor = (type) => {
         switch(type) {
            case 'warning': return 'bg-yellow-50 border-yellow-400 text-yellow-700';
            case 'info': return 'bg-blue-50 border-blue-400 text-blue-700';
            default: return 'bg-green-50 border-green-400 text-green-700';
        }
    };

    const handleClearAll = async () => {
        if (!user || !notifications.length) return;
        try {
            await Promise.all(
                notifications.map(notif => deleteDoc(doc(db, 'users', user.uid, 'notifications', notif.id)))
            );
        } catch (error) {
            console.error("Error al limpiar notificaciones:", error);
        }
    };

    return (
        <div id="notification-panel" className="w-full bg-white p-6 sm:p-8 rounded-[32px] shadow-sm border border-slate-100 flex flex-col justify-between">
            <div>
                <div className="flex items-center justify-between gap-2 mb-5">
                    <h3 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight flex items-center">
                        <Icon name="Bell" className="w-5 h-5 mr-2.5 text-blue-600"/>
                        Notificaciones
                        {notifications.length > 0 && (
                            <span className="ml-2 px-2 py-0.5 text-xs font-black bg-blue-600 text-white rounded-full">
                                {notifications.length}
                            </span>
                        )}
                    </h3>
                    {notifications.length > 0 && (
                        <button
                            type="button"
                            onClick={handleClearAll}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                            Marcar todas leídas
                        </button>
                    )}
                </div>

                {loadingNotifications ? (
                    <div className="space-y-4 animate-pulse">
                        {[1,2].map(i => <div key={i} className="h-16 bg-gray-50 rounded-2xl"></div>)}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.length > 0 ? notifications.map(notif => (
                            <div 
                                key={notif.id} 
                                onClick={() => handleNotificationClick(notif)}
                                className={`flex items-start p-4 border-l-4 rounded-r-2xl transition-all hover:translate-x-1 cursor-pointer hover:bg-opacity-95 active:scale-[0.98] ${getColor(notif.type)}`}
                                title="Hacer clic para ver y marcar como leída"
                            >
                                <div className="p-2 bg-white/50 rounded-xl mr-3.5 shrink-0">
                                    <Icon name={getIcon(notif.type)} className="h-5 w-5"/>
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-sm">{notif.title}</p>
                                    <p className="text-xs opacity-90 mt-0.5">{notif.body}</p>
                                    <p className="text-[10px] font-bold uppercase mt-2 opacity-60">
                                        {notif.timestamp?.toLocaleDateString ? notif.timestamp.toLocaleDateString('es-AR') : ''}
                                    </p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 px-4 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                                <Icon name="CheckCircle" className="w-10 h-10 text-emerald-400 mx-auto mb-2"/>
                                <p className="text-slate-700 font-bold text-sm">Todo al día</p>
                                <p className="text-slate-400 text-xs mt-1 mb-4">No tienes notificaciones ni alertas pendientes.</p>
                                {navigate && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('client-center')}
                                        className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                                    >
                                        Ir al Centro Documental
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPanel;
