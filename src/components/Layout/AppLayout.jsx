import React, { useState, useContext, useRef, useEffect } from 'react';
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
  Calculator,
  ChevronLeft,
  ChevronRight,
  Bell,
  Building2,
  Users,
  ChevronDown,
  Check,
  Search,
  ArrowLeftRight
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useClientSelection } from '../../context/ClientSelectionContext';
import SessionWarningModal from './SessionWarningModal';

const AppLayout = ({ children, currentRoute, navigate }) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { userData, notifications, logoutNow } = useAuth();
    const { 
        activeEntity, 
        setActiveEntity, 
        studioEntity, 
        clientList, 
        isViewingClient, 
        resetToStudio 
    } = useClientSelection();

    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    // Cerrar dropdown al hacer clic afuera
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredClients = clientList.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.cuit?.includes(searchTerm)
    );
    
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
        
        // Facturación aparece por defecto (ON), salvo que el admin lo haya escondido (false)
        if (link.moduleId === 'facturacion') {
            return userData?.servicioFacturacion !== false && userData?.permisos?.facturacion !== false;
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
        if (logoutNow) {
            logoutNow();
        } else {
            signOut(auth);
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">
            <SessionWarningModal />
            {/* Overlay móvil */}
            <div 
                className={`fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 transition-opacity duration-300 lg:hidden ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
                onClick={() => setSidebarOpen(false)}
            ></div>

            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-out transform 
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                lg:translate-x-0 lg:static lg:inset-0
                ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-64
                bg-gray-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl`}
            >
                <div className="flex items-center justify-between px-4 h-20 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                    <div className="flex items-center space-x-3 group overflow-hidden">
                        <div className="shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg shadow-black/40 group-hover:border-blue-500/50 transition-colors duration-300 w-11 h-11 bg-slate-950/80 flex items-center justify-center">
                            <img 
                                src="/logo.jpg" 
                                alt="Logo G&R" 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                        </div>
                        {!isCollapsed && (
                            <div className="fade-in select-none">
                                <span className="block text-lg font-black text-white tracking-tight leading-none text-white">G&R</span>
                                <span className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">Consultores</span>
                            </div>
                        )}
                    </div>
                    {/* Botón para colapsar en desktop */}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="hidden lg:flex items-center justify-center p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                    >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                    </button>
                </div>

                <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto custom-scrollbar">
                    {filteredLinks.map(link => {
                        const isActive = currentRoute === link.path;
                        return (
                            <button 
                                key={link.name} 
                                onClick={() => { navigate(link.path); setSidebarOpen(false); }}
                                className={`w-full group flex items-center py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden mb-1
                                    ${isCollapsed ? 'justify-center px-0' : 'px-4'}
                                    ${isActive 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                    }`}
                                title={isCollapsed ? link.name : ''}
                            >
                                {/* Indicador luminoso izquierdo */}
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-400 rounded-r-md"></div>
                                )}

                                <span className={`transition-transform duration-200 ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-white scale-110' : 'text-gray-500 group-hover:text-gray-300'}`}>
                                    {link.icon}
                                </span>
                                {!isCollapsed && <span className="fade-in">{link.name}</span>}
                            </button>
                        );
                    })}
                </nav>
                
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <button 
                        onClick={handleLogout} 
                        className={`flex items-center justify-center py-2 text-xs font-bold text-gray-400 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all border border-transparent hover:border-red-500/20 group cursor-pointer ${isCollapsed ? 'w-10 h-10 px-0 mx-auto' : 'w-full px-4'}`}
                        title="Cerrar Sesión"
                    >
                        <LogOut size={16} className={`${isCollapsed ? '' : 'mr-2'} group-hover:-translate-x-1 transition-transform`}/>
                        {!isCollapsed && "Cerrar Sesión"}
                    </button>
                    {!isCollapsed && (
                        <div className="mt-4 text-center fade-in">
                            <p className="text-[10px] text-gray-600 font-mono tracking-wider uppercase">Vite Powered ✨ v2.7</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="flex flex-wrap justify-between items-center p-4 bg-white/80 backdrop-blur-xl border-b border-gray-200/80 sticky top-0 z-20 no-print gap-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 focus:outline-none lg:hidden p-2 rounded-md hover:bg-gray-100">
                            <Menu size={24}/>
                        </button>
                        <h1 className="text-lg md:text-xl font-bold text-gray-800 truncate">
                            Bienvenido, <span className="text-blue-600">{userData?.nombre || 'Administrador'}</span>!
                        </h1>
                    </div>

                    {/* Selector de Entidad Activa (Mi Estudio vs Clientes) para Administradores */}
                    {userData?.isAdmin && (
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                                    isViewingClient
                                        ? 'bg-blue-50/90 border-blue-300 text-blue-900 hover:bg-blue-100/80 ring-2 ring-blue-500/20'
                                        : 'bg-white border-blue-100 text-slate-800 hover:bg-blue-50/60'
                                }`}
                                title="Cambiar entidad contable para ver en Dashboard y Operaciones"
                            >
                                <div className={`p-1.5 rounded-xl ${isViewingClient ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'}`}>
                                    {isViewingClient ? <User size={15}/> : <Building2 size={15}/>}
                                </div>
                                <div className="text-left max-w-[180px] sm:max-w-[240px] truncate">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        {isViewingClient ? 'Cliente en Auditoría' : 'Entidad Contable'}
                                    </p>
                                    <p className="text-xs font-black truncate text-slate-900 leading-tight">
                                        {activeEntity?.name}
                                    </p>
                                </div>
                                <ChevronDown size={14} className={`text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Menú Desplegable con Búsqueda */}
                            {dropdownOpen && (
                                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-blue-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                                    <div className="p-3 border-b border-gray-100 bg-blue-50/30">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input 
                                                type="text"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                placeholder="Buscar cliente por nombre o CUIT..."
                                                className="w-full pl-9 pr-3 py-2 bg-white border border-blue-100 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                                autoFocus
                                            />
                                        </div>
                                    </div>

                                    <div className="max-h-72 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                        {/* Opción Fija: Mi Estudio Contable */}
                                        <button
                                            onClick={() => {
                                                resetToStudio();
                                                setDropdownOpen(false);
                                            }}
                                            className={`w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                                                activeEntity.isStudio 
                                                    ? 'bg-blue-600 text-white shadow-sm' 
                                                    : 'hover:bg-blue-50 text-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 truncate">
                                                <div className={`p-2 rounded-xl ${activeEntity.isStudio ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                                    <Building2 size={16} />
                                                </div>
                                                <div className="truncate">
                                                    <p className={`text-xs font-black truncate leading-tight ${activeEntity.isStudio ? 'text-white' : 'text-slate-900'}`}>
                                                        {studioEntity.name}
                                                    </p>
                                                    <p className={`text-[10px] font-mono mt-0.5 ${activeEntity.isStudio ? 'text-blue-100' : 'text-slate-400'}`}>
                                                        Mi Estudio Propio (Honorarios & Gastos)
                                                    </p>
                                                </div>
                                            </div>
                                            {activeEntity.isStudio && <Check size={16} className="text-white shrink-0 ml-2" />}
                                        </button>

                                        {/* Separador de Clientes */}
                                        <div className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                                            <span>Clientes del Estudio ({clientList.length})</span>
                                            {isViewingClient && (
                                                <button
                                                    onClick={() => {
                                                        resetToStudio();
                                                        setDropdownOpen(false);
                                                    }}
                                                    className="text-blue-600 hover:underline cursor-pointer"
                                                >
                                                    Restablecer a Mi Estudio
                                                </button>
                                            )}
                                        </div>

                                        {filteredClients.length === 0 ? (
                                            <p className="text-center py-4 text-xs font-bold text-slate-400 italic">
                                                No se encontraron clientes.
                                            </p>
                                        ) : (
                                            filteredClients.map(client => {
                                                const isSelected = activeEntity?.id === client.id;
                                                return (
                                                    <button
                                                        key={client.id}
                                                        onClick={() => {
                                                            setActiveEntity(client);
                                                            setDropdownOpen(false);
                                                        }}
                                                        className={`w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                                                            isSelected 
                                                                ? 'bg-blue-600 text-white shadow-sm' 
                                                                : 'hover:bg-blue-50 text-slate-800'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3 truncate">
                                                            <div className={`p-2 rounded-xl ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                                                                <User size={16} />
                                                            </div>
                                                            <div className="truncate">
                                                                <div className="flex items-center gap-1.5 truncate">
                                                                    <p className={`text-xs font-black truncate leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                                                        {client.name}
                                                                    </p>
                                                                    {client.source === 'tercero' && (
                                                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                                                                            Gestión
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                                                    CUIT: {client.cuit}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {isSelected && <Check size={16} className="text-white shrink-0 ml-2" />}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-widest">
                            <Sparkles size={12}/> Premium
                        </div>
                        {/* Campanita de notificaciones */}
                        <button 
                            onClick={() => {
                                navigate('dashboard');
                                setTimeout(() => {
                                    const element = document.getElementById('notification-panel');
                                    if (element) {
                                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }, 100);
                            }} 
                            className="relative p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all cursor-pointer group"
                            title="Notificaciones"
                        >
                            <Bell size={20} className="transition-transform group-hover:scale-110" />
                            {notifications && notifications.length > 0 && (
                                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
                            )}
                        </button>
                    </div>
                </header>

                {/* Banner de Modo Auditoría / Vista Cliente Activa */}
                {isViewingClient && (
                    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 text-white px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md text-xs border-b border-blue-800/40 animate-fade-in no-print">
                        <div className="flex items-center gap-3">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse"></span>
                            <span className="font-black text-blue-200 uppercase tracking-widest text-[10px]">
                                Vista Contable de Cliente:
                            </span>
                            <span className="font-extrabold text-white text-sm">
                                {activeEntity.name}
                            </span>
                            <span className="text-sky-200 font-mono text-[11px] bg-white/10 px-2.5 py-0.5 rounded-lg border border-white/10">
                                CUIT: {activeEntity.cuit}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-blue-200 font-medium hidden sm:inline">
                                El Dashboard y Operaciones reflejan los datos de este cliente
                            </span>
                            <button
                                onClick={resetToStudio}
                                className="bg-white hover:bg-blue-50 text-blue-950 px-4 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
                            >
                                <Building2 size={13} /> Volver a Mi Estudio
                            </button>
                        </div>
                    </div>
                )}
                
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

