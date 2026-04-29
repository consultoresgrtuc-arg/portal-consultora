import React from 'react';
import Icon from './Icon';

const ConfirmModal = ({ message, onConfirm, onCancel, confirmText = 'Confirmar', isDestructive = false }) => {
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-200">
                <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center mb-6 ${isDestructive ? 'bg-red-50' : 'bg-yellow-50'}`}>
                    <Icon name="AlertTriangle" className={`h-8 w-8 ${isDestructive ? 'text-red-500' : 'text-yellow-500'}`}/>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{message}</h3>
                <div className="flex justify-center gap-4">
                    <button 
                        onClick={onCancel} 
                        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={onConfirm} 
                        className={`flex-1 py-3 px-4 text-white rounded-xl font-bold transition-all shadow-lg ${isDestructive ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;
