import React from 'react';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const NotificationPanel = () => {
    const { notifications, loadingNotifications } = useAuth();

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

    return (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6 flex items-center">
                <Icon name="Bell" className="w-5 h-5 mr-3 text-blue-500"/>
                Centro de Notificaciones
            </h3>
            {loadingNotifications ? (
                <div className="space-y-4 animate-pulse">
                    {[1,2].map(i => <div key={i} className="h-16 bg-gray-50 rounded-2xl"></div>)}
                </div>
            ) : (
                <div className="space-y-4">
                    {notifications.length > 0 ? notifications.map(notif => (
                        <div key={notif.id} className={`flex items-start p-4 border-l-4 rounded-r-2xl transition-all hover:translate-x-1 ${getColor(notif.type)}`}>
                            <div className="p-2 bg-white/50 rounded-xl mr-4">
                                <Icon name={getIcon(notif.type)} className="h-6 w-6"/>
                            </div>
                            <div>
                                <p className="font-bold">{notif.title}</p>
                                <p className="text-sm opacity-90">{notif.body}</p>
                                <p className="text-[10px] font-bold uppercase mt-2 opacity-60">
                                    {notif.timestamp?.toLocaleDateString ? notif.timestamp.toLocaleDateString('es-AR') : ''}
                                </p>
                            </div>
                        </div>
                    )) : (
                        <div className="text-center py-10">
                            <Icon name="CheckCircle" className="w-12 h-12 text-gray-100 mx-auto mb-2"/>
                            <p className="text-gray-400 font-medium italic">No hay notificaciones nuevas.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationPanel;
