import React from 'react';
import Icon from '../Common/Icon';
import { useAuth } from '../../context/AuthContext';

const GestionPage = ({ navigate }) => {
    const { userData } = useAuth();

    const sections = [
        {
            id: 'terceros',
            title: 'Terceros',
            description: 'Gestiona tus Clientes y Proveedores.',
            icon: 'Users',
            color: 'bg-blue-500',
            path: 'gestion/terceros'
        },
        {
            id: 'deudores',
            title: 'Deudores',
            description: 'Cuentas Corrientes de Clientes (Ventas).',
            icon: 'ArrowDownRight',
            color: 'bg-red-500',
            path: 'gestion/deudores'
        },
        {
            id: 'proveedores',
            title: 'Proveedores',
            description: 'Cuentas Corrientes de Proveedores (Compras).',
            icon: 'ArrowUpRight',
            color: 'bg-orange-500',
            path: 'gestion/proveedores'
        },
        {
            id: 'cheques',
            title: 'Valores / Cheques',
            description: 'Control de cheques en cartera y emitidos.',
            icon: 'Landmark',
            color: 'bg-indigo-500',
            path: 'gestion/cheques'
        }
    ];

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header>
                <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Centro de Gestión</h2>
                <p className="text-gray-500 mt-1 font-medium italic">Administra tus vínculos comerciales y flujos de caja.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => navigate(section.path)}
                        className="group bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
                    >
                        <div className={`absolute top-0 right-0 w-32 h-32 ${section.color} opacity-5 rounded-bl-full transform translate-x-8 -translate-y-8 group-hover:scale-110 transition-transform duration-500`}></div>
                        
                        <div className={`${section.color} w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-${section.color.split('-')[1]}-100`}>
                            <Icon name={section.icon} size={32} />
                        </div>
                        
                        <h3 className="text-xl font-black text-gray-800 mb-2">{section.title}</h3>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed">{section.description}</p>
                        
                        <div className="mt-6 flex items-center text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-900 transition-colors">
                            Acceder <Icon name="ArrowRight" size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default GestionPage;
