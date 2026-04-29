import React, { useState, useContext } from 'react';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  ClipboardList, 
  TrendingUp, 
  BarChart3, 
  FolderArchive, 
  User, 
  Shield, 
  LogOut, 
  Menu,
  Sparkles,
  Calculator
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const AppLayout = ({ children, currentRoute, navigate }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { userData } = useAuth();
    
    const allLinks = [
        { name: 'Dashboard', icon: <LayoutDashboard size={20} />, path: 'dashboard', moduleId: 'dashboard' },
        { name: 'Facturación', icon: <FileText size={20} />, path: 'billing', moduleId: 'facturacion' },
        { name: 'Operaciones', icon: <PlusCircle size={20} />, path: 'operations', moduleId: 'operaciones' },
        { name: 'Gestión', icon: <ClipboardList size={20} />, path: 'gestion', moduleId: 'gestion' },
        { name: 'Finanzas', icon: <TrendingUp size={20} />, path: 'finances', moduleId: 'finanzas' },
        { name: 'Reportes', icon: <BarChart3 size={20} />, path: 'reports', moduleId: 'reportes' },
        { name: 'Microcréditos', icon: <Calculator size={20} />, path: 'microcredits', moduleId: 'microcreditos' },
        { name: 'Cliente', icon: <FolderArchive size={20} />, path: 'client-center', moduleId: 'cliente' },
        { name: 'Perfil', icon: <User size={20} />, path: 'profile', moduleId: 'perfil' },
        { name: 'Admin', icon: <Shield size={20} />, path: 'admin', moduleId: 'admin' }
    ];
    
    const filteredLinks = allLinks.filter(link => {
        // El Admin siempre ve todo
        if (userData?.isAdmin) return true;
        
        // Los clientes nunca ven el panel Admin
        if (link.moduleId === 'admin') return false;
        
        // Regla especial para Facturación (mantiene compatibilidad con 'servicioFacturacion')
        if (link.moduleId === 'facturacion') {
            return userData?.servicioFacturacion || userData?.permisos?.facturacion;
        }

        // Para los demás módulos, se basa en 'permisos'. 
        // Si no existe 'permisos' (usuarios viejos), se asume TRUE por defecto excepto microcréditos.
        if (userData?.permisos) {
            return userData.permisos[link.moduleId];
        } else {
            return link.moduleId !== 'microcreditos';
        }
    });

    const handleLogout = () => {
        signOut(auth);
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
            {/* Overlay móvil */}
            <div 
                className={`fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 transition-opacity duration-300 lg:hidden ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
                onClick={() => setSidebarOpen(false)}
            ></div>

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 w-64 z-50 flex flex-col transition-transform duration-300 ease-out transform 
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                lg:translate-x-0 lg:static lg:inset-0
                bg-gray-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl`}
            >
                <div className="flex items-center justify-center h-20 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                    <div className="flex items-center space-x-3 group">
                        <div className="bg-blue-600/20 p-2 rounded-lg group-hover:bg-blue-600/30 transition-colors">
                            <BarChart3 size={32} className="text-blue-400"/>
                        </div>
                        <div>
                            <span className="block text-lg font-bold text-white tracking-tight leading-none">G&R</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Consultores</span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
                    {filteredLinks.map(link => {
                        const isActive = currentRoute === link.path;
                        return (
                            <button 
                                key={link.name} 
                                onClick={() => { navigate(link.path); setSidebarOpen(false); }}
                                className={`w-full group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden mb-1
                                    ${isActive 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                            >
                                <span className={`mr-3 transition-transform duration-200 ${isActive ? 'text-white scale-110' : 'text-gray-500 group-hover:text-gray-300'}`}>
                                    {link.icon}
                                </span>
                                {link.name}
                            </button>
                        );
                    })}
                </nav>
                
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <button onClick={handleLogout} className="w-full flex items-center justify-center px-4 py-2 text-xs font-bold text-gray-400 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20 group">
                        <LogOut size={16} className="mr-2 group-hover:-translate-x-1 transition-transform"/>
                        Cerrar Sesión
                    </button>
                    <div className="mt-4 text-center">
                        <p className="text-[10px] text-gray-600 font-mono tracking-wider uppercase">Vite Powered ✨ v2.1</p>
                    </div>
                </div>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex justify-between items-center p-4 bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10 no-print">
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 focus:outline-none lg:hidden p-2 rounded-md hover:bg-gray-100">
                        <Menu size={24}/>
                    </button>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-800 truncate ml-2">
                        Bienvenido, <span className="text-blue-600">{userData?.nombre || 'Administrador'}</span>!
                    </h1>
                    <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-widest">
                        <Sparkles size={12}/> Premium
                    </div>
                </header>
                
                <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 relative custom-scrollbar">
                    <div className="fade-in max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default AppLayout;
