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
        <div className="flex h-dvh bg-gray-100 font-sans overflow-hidden">
            <SessionWarningModal />
            {/* Overlay móvil */}
            <div 
                className={`fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 transition-opacity duration-300 lg:hidden ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
                onClick={() => setSidebarOpen(false)}
            ></div>

            {/* Sidebar con Efecto Azul Oscuro Elegante y Transparencia Glaseada */}
            <div className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-all duration-300 ease-out transform 
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                lg:translate-x-0 lg:static lg:inset-0
                ${isCollapsed ? 'lg:w-20' : 'lg:w-64'} w-64
                bg-[#0a1226]/85 backdrop-blur-2xl backdrop-saturate-150 border-r border-blue-500/20 shadow-[4px_0_35px_rgba(2,6,23,0.45)]`}
            >
                <div className={`relative flex items-center h-20 border-b border-blue-500/15 bg-gradient-to-b from-blue-500/[0.08] to-transparent transition-all duration-300 ${
                    isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
                }`}>
                    <div 
                        onClick={() => isCollapsed && setIsCollapsed(false)}
                        className={`flex items-center group overflow-hidden ${
                            isCollapsed ? 'justify-center cursor-pointer' : 'space-x-3'
                        }`}
                        title={isCollapsed ? "Expandir barra lateral" : ""}
                    >
                        <div className="shrink-0 rounded-xl overflow-hidden border border-blue-400/25 shadow-lg shadow-blue-950/60 group-hover:border-blue-400/60 transition-all duration-300 w-11 h-11 bg-blue-950/60 backdrop-blur-md flex items-center justify-center">
                            <img 
                                src="/logo.jpg" 
                                alt="Logo G&R" 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                        </div>
                        {!isCollapsed && (
                            <div className="fade-in select-none">
                                <span className="block text-lg font-black text-white tracking-tight leading-none drop-shadow-sm">G&R</span>
                                <span className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">Consultores</span>
                            </div>
                        )}
                    </div>

                    {/* Botón para colapsar en desktop */}
                    {isCollapsed ? (
                        <button 
                            onClick={() => setIsCollapsed(false)}
                            className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 items-center justify-center rounded-full bg-[#0a1226] border border-blue-400/40 text-blue-200 hover:text-white hover:bg-blue-600 shadow-lg hover:scale-110 transition-all cursor-pointer z-50 backdrop-blur-md"
                            title="Expandir barra lateral"
                        >
                            <ChevronRight size={14} />
                        </button>
                    ) : (
                        <button 
                            onClick={() => setIsCollapsed(true)}
                            className="hidden lg:flex items-center justify-center p-1.5 rounded-lg bg-blue-950/40 border border-blue-500/20 text-blue-200 hover:text-white hover:bg-blue-900/50 transition-all cursor-pointer backdrop-blur-md shadow-xs"
                            title="Colapsar barra lateral"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    )}
                </div>

                <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto sidebar-glass-scrollbar">
                    {filteredLinks.map(link => {
                        const isActive = currentRoute === link.path;
                        return (
                            <button 
                                key={link.name} 
                                onClick={() => { navigate(link.path); setSidebarOpen(false); }}
                                className={`w-full group flex items-center py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden mb-1 cursor-pointer
                                    ${isCollapsed ? 'justify-center px-0' : 'px-4'}
                                    ${isActive 
                                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/35 border border-blue-400/30 backdrop-blur-md' 
                                        : 'text-slate-300 hover:bg-blue-600/15 hover:text-white hover:backdrop-blur-md'
                                    }`}
                                title={isCollapsed ? link.name : ''}
                            >
                                {/* Indicador luminoso izquierdo */}
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-cyan-400 shadow-[0_0_12px_#38bdf8] rounded-r-md"></div>
                                )}

                                <span className={`transition-transform duration-200 ${isCollapsed ? '' : 'mr-3'} ${isActive ? 'text-white scale-110' : 'text-slate-400 group-hover:text-blue-200'}`}>
                                    {link.icon}
                                </span>
                                {!isCollapsed && <span className="fade-in font-medium">{link.name}</span>}
                            </button>
                        );
                    })}
                </nav>
                
                <div className="p-4 border-t border-blue-500/15 bg-[#050b18]/60 backdrop-blur-md">
                    <button 
                        onClick={handleLogout} 
                        className={`flex items-center justify-center py-2 text-xs font-bold text-slate-300 rounded-lg hover:bg-red-500/15 hover:text-red-300 transition-all border border-transparent hover:border-red-500/20 group cursor-pointer ${isCollapsed ? 'w-10 h-10 px-0 mx-auto' : 'w-full px-4'}`}
                        title="Cerrar Sesión"
                    >
                        <LogOut size={16} className={`${isCollapsed ? '' : 'mr-2'} group-hover:-translate-x-1 transition-transform`}/>
                        {!isCollapsed && "Cerrar Sesión"}
                    </button>
                    {!isCollapsed && (
                        <div className="mt-4 text-center fade-in">
                            <p className="text-[10px] text-blue-300/40 font-mono tracking-wider uppercase">G&R Consultores ✨ v2.7</p>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                <header className="flex flex-wrap justify-between items-center px-3 py-2.5 sm:p-4 bg-white/85 backdrop-blur-xl border-b border-gray-200/80 sticky top-0 z-20 no-print gap-2 sm:gap-3">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-500 hover:text-gray-700 focus:outline-none lg:hidden p-2 rounded-xl hover:bg-gray-100 shrink-0 cursor-pointer">
                            <Menu size={22}/>
                        </button>
                        <h1 className="text-sm sm:text-lg md:text-xl font-bold text-gray-800 truncate">
                            Bienvenido, <span className="text-blue-600">{userData?.nombre || 'Administrador'}</span>!
                        </h1>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                        {/* Selector de Entidad Activa (Mi Estudio vs Clientes) para Administradores */}
                        {userData?.isAdmin && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setDropdownOpen(!dropdownOpen)}
                                    className={`flex items-center gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                                        isViewingClient
                                            ? 'bg-blue-50/90 border-blue-300 text-blue-900 hover:bg-blue-100/80 ring-2 ring-blue-500/20'
                                            : 'bg-white border-blue-100 text-slate-800 hover:bg-blue-50/60'
                                    }`}
                                    title="Cambiar entidad contable para ver en Dashboard y Operaciones"
                                >
                                    <div className={`p-1.5 rounded-xl shrink-0 ${isViewingClient ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'}`}>
                                        {isViewingClient ? <User size={14}/> : <Building2 size={14}/>}
                                    </div>
                                    <div className="text-left max-w-[125px] sm:max-w-[220px] truncate">
                                        <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider text-slate-400 leading-none">
                                            {isViewingClient ? 'Cliente Activo' : 'Entidad Contable'}
                                        </p>
                                        <p className="text-[11px] sm:text-xs font-black truncate text-slate-900 leading-tight mt-0.5">
                                            {activeEntity?.name}
                                        </p>
                                    </div>
                                    <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {/* Menú Desplegable con Búsqueda */}
                                {dropdownOpen && (
                                    <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-3xl shadow-2xl border border-blue-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
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
                                                                        {client.isLinked && (
                                                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                                                                                🔗 Vinculado
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
                            className="relative p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all cursor-pointer group shrink-0"
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
                    <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 text-white px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shadow-md text-xs border-b border-blue-800/40 animate-fade-in no-print">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse shrink-0"></span>
                            <span className="font-black text-blue-200 uppercase tracking-widest text-[10px]">
                                Vista Cliente:
                            </span>
                            <span className="font-extrabold text-white text-xs sm:text-sm">
                                {activeEntity.name}
                            </span>
                            <span className="text-sky-200 font-mono text-[10px] sm:text-[11px] bg-white/10 px-2 py-0.5 rounded-lg border border-white/10">
                                CUIT: {activeEntity.cuit}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-blue-200 font-medium hidden sm:inline">
                                El Dashboard y Operaciones reflejan los datos de este cliente
                            </span>
                            <button
                                onClick={resetToStudio}
                                className="bg-white hover:bg-blue-50 text-blue-950 px-3 sm:px-4 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1.5 cursor-pointer"
                            >
                                <Building2 size={13} /> Volver a Mi Estudio
                            </button>
                        </div>
                    </div>
                )}
                
                <main className="flex-1 overflow-y-auto bg-gray-50 p-3 sm:p-4 md:p-6 pb-20 lg:pb-6 relative custom-scrollbar">
                    <div className="fade-in max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>

                {/* Barra de Navegación Inferior Móvil / Tablet Vertical (lg:hidden) */}
                <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/80 z-30 no-print px-2 py-1.5 flex items-center justify-around shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
                    {filteredLinks.slice(0, 5).map(link => {
                        const isActive = currentRoute === link.path || (link.path === 'gestion' && currentRoute?.startsWith('gestion'));
                        return (
                            <button
                                key={link.name}
                                onClick={() => { navigate(link.path); setSidebarOpen(false); }}
                                className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer min-w-[56px] ${
                                    isActive
                                        ? 'text-blue-600 font-black'
                                        : 'text-slate-400 hover:text-slate-700 font-semibold'
                                }`}
                            >
                                <span className={`p-1 rounded-lg transition-transform ${isActive ? 'bg-blue-50 scale-105' : ''}`}>
                                    {React.cloneElement(link.icon, { size: 18 })}
                                </span>
                                <span className="text-[9px] tracking-tight mt-0.5 truncate max-w-[64px]">{link.name}</span>
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="flex flex-col items-center justify-center py-1 px-2 rounded-xl text-slate-400 hover:text-slate-700 font-semibold cursor-pointer min-w-[52px]"
                    >
                        <span className="p-1 rounded-lg">
                            <Menu size={18} />
                        </span>
                        <span className="text-[9px] tracking-tight mt-0.5">Menú</span>
                    </button>
                </nav>
            </div>
        </div>
    );
};

export default AppLayout;

