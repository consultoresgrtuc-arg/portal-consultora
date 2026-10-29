import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientSelectionProvider } from './context/ClientSelectionContext';
import AppLayout from './components/Layout/AppLayout';
import MicrocreditsPanel from './components/Microcredits/MicrocreditsPanel';
import DashboardPage from './components/Dashboard/DashboardPage';
import OperationsPage from './components/Operations/OperationsPage';
import FinancesPage from './components/Finances/FinancesPage';
import ClientCenterPage from './components/ClientCenter/ClientCenterPage';
import ProfilePage from './components/Profile/ProfilePage';
import ReportsPage from './components/Reports/ReportsPage';
import GestionPage from './components/Gestion/GestionPage';
import TercerosPage from './components/Gestion/TercerosPage';
import AdminPage from './components/Admin/AdminPage';
import AdminClientManagementPage from './components/Admin/AdminClientManagementPage';
import BillingRequestsPage from './components/Billing/BillingRequestsPage';
import DeudoresPage from './components/Gestion/DeudoresPage';
import ProveedoresPage from './components/Gestion/ProveedoresPage';
import CuentaCorrienteClientePage from './components/Gestion/CuentaCorrienteClientePage';
import CuentaCorrienteProveedorPage from './components/Gestion/CuentaCorrienteProveedorPage';
import ChequesPage from './components/Gestion/ChequesPage';

import { 
  BarChart3, 
  Chrome, 
  MessageCircle, 
  Shield, 
  Lock,
  Eye,
  EyeOff,
  Mail,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  User,
  CheckCircle2,
  Sparkles,
  FileText,
  Landmark,
  Wallet
} from 'lucide-react';
import { auth, googleProvider } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signInWithPopup,
  updateProfile
} from 'firebase/auth';

const LoginPage = () => {
    const [email, setEmail] = useState(() => localStorage.getItem('gyr_remembered_email') || '');
    const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem('gyr_remembered_email')));
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState('login'); 
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    
    useEffect(() => {
        const expiredMsg = sessionStorage.getItem('gyr_session_expired_msg');
        if (expiredMsg) {
            setMessage(expiredMsg);
            sessionStorage.removeItem('gyr_session_expired_msg');
        }
    }, []);
    
    const handleEmailPassword = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (view === 'register' && password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setLoading(true);
        try {
            if (rememberEmail && email.trim()) {
                localStorage.setItem('gyr_remembered_email', email.trim());
            } else {
                localStorage.removeItem('gyr_remembered_email');
            }

            if (view === 'register') {
                const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
                if (fullName.trim() && cred.user) {
                    await updateProfile(cred.user, { displayName: fullName.trim() });
                }
            } else {
                await signInWithEmailAndPassword(auth, email.trim(), password);
            }
        } catch (err) {
            let friendlyMessage = 'Error al autenticar. Verifica tus datos e intenta nuevamente.';
            if (err.code === 'auth/email-already-in-use') friendlyMessage = 'Este correo electrónico ya está registrado.';
            else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') friendlyMessage = 'Correo o contraseña incorrectos.';
            else if (err.code === 'auth/weak-password') friendlyMessage = 'La contraseña es muy débil (mínimo 6 caracteres).';
            else if (err.code === 'auth/invalid-email') friendlyMessage = 'El formato del correo electrónico no es válido.';
            else if (err.code === 'auth/too-many-requests') friendlyMessage = 'Demasiados intentos fallidos. Espera unos minutos o recupera tu contraseña.';
            setError(friendlyMessage);
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setMessage('Correo de recuperación enviado. Revisa tu bandeja de entrada.');
        } catch (err) {
            setError('No se pudo enviar el correo. Verifica la dirección ingresada.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setMessage('');
        setLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            setError('Error al iniciar sesión con Google.');
        } finally {
            setLoading(false);
        }
    };

    const switchView = (newView) => {
        setView(newView);
        setError('');
        setMessage('');
        setShowPassword(false);
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row bg-slate-950 overflow-x-hidden font-sans">
            {/* Left side: Video presentation (Visible on LG screens and larger) */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center bg-black p-10 xl:p-14">
                {/* Background Video */}
                <video 
                    src="/logo-presentation.mp4" 
                    className="absolute inset-0 w-full h-full object-cover opacity-60" 
                    autoPlay 
                    loop 
                    muted 
                    playsInline
                />
                {/* Glassmorphism Dark Overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-950/75 to-transparent backdrop-blur-[2px]"></div>
                
                {/* Logo and brand text */}
                <div className="relative z-10 w-full max-w-lg flex flex-col items-center text-center">
                    <div className="bg-white/5 border border-white/10 backdrop-blur-xl p-6 rounded-3xl shadow-2xl mb-6 transform hover:scale-105 transition-all duration-500">
                        <img 
                            src="/logo.jpg" 
                            alt="G&R Consultores" 
                            className="w-36 h-36 xl:w-40 xl:h-40 object-cover rounded-2xl shadow-inner border border-white/10"
                        />
                    </div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tight leading-none mb-3 drop-shadow-md">
                        G&R Consultores
                    </h1>
                    <p className="text-blue-400 text-sm font-bold uppercase tracking-widest mb-6 drop-shadow-sm">
                        Excelencia en Asesoría Contable y Financiera
                    </p>
                    <div className="h-1 w-20 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mb-6"></div>
                    <p className="text-slate-300 text-base max-w-md leading-relaxed drop-shadow">
                        Accedé a tu portal para gestionar tus operaciones diarias, facturación, flujo de fondos y reportes contables en tiempo real.
                    </p>
                </div>
            </div>

            {/* Right side: Login Form (100% on mobile, 50% on desktop) */}
            <div className="flex-1 flex items-center justify-center p-5 sm:p-8 lg:p-10 relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 lg:border-l lg:border-white/5 border-transparent overflow-y-auto">
                {/* Background decorative glowing orbs */}
                <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]"></div>
                <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[6000ms]"></div>

                <div className="max-w-md w-full backdrop-blur-2xl bg-slate-900/50 border border-slate-800/90 p-6 sm:p-8 rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.55)] z-10 transition-all duration-300 hover:border-slate-700/80 my-auto">
                    <div className="text-center mb-6">
                        {/* Logo visible on all devices */}
                        <div className="relative inline-block mb-3 group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                            <div className="relative bg-slate-950/80 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/20 shadow-xl overflow-hidden">
                                <img 
                                    src="/logo.jpg" 
                                    alt="Logo" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                            </div>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            {view === 'login' ? 'Iniciar Sesión' : view === 'register' ? 'Crear Cuenta' : 'Recuperar Acceso'}
                        </h2>
                        <p className="mt-1.5 text-xs sm:text-sm text-slate-400 font-medium">
                            {view === 'reset' ? 'Ingresa tu correo para enviarte el enlace de recuperación.' : 'Bienvenido al Portal de G&R Consultores v2.7'}
                        </p>

                        {/* Segmented Tabs for Login / Register */}
                        {view !== 'reset' && (
                            <div className="mt-4 grid grid-cols-2 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => switchView('login')}
                                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                        view === 'login'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    Ingresar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => switchView('register')}
                                    className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                        view === 'register'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    Crear Cuenta
                                </button>
                            </div>
                        )}
                    </div>

                    {view === 'reset' ? (
                        <form onSubmit={handlePasswordReset} className="space-y-4">
                            <div>
                                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Correo Electrónico</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                        <Mail size={16} />
                                    </div>
                                    <input 
                                        type="email" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        placeholder="tu@empresa.com"
                                        required 
                                        disabled={loading}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 text-white text-sm placeholder-slate-500 focus:bg-slate-950/90 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none disabled:opacity-50"
                                    />
                                </div>
                            </div>
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-center">
                                    {error}
                                </div>
                            )}
                            {message && (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-center">
                                    {message}
                                </div>
                            )}
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Enviando...</span>
                                    </>
                                ) : (
                                    'Enviar enlace de recuperación'
                                )}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleEmailPassword} className="space-y-4">
                            {view === 'register' && (
                                <div>
                                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Nombre o Razón Social</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                            <User size={16} />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={fullName} 
                                            onChange={(e) => setFullName(e.target.value)} 
                                            placeholder="Ej: Juan Pérez / Mi Empresa S.R.L."
                                            required={view === 'register'}
                                            disabled={loading}
                                            className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 text-white text-sm placeholder-slate-500 focus:bg-slate-950/90 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none disabled:opacity-50"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Correo Electrónico</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                        <Mail size={16} />
                                    </div>
                                    <input 
                                        type="email" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        placeholder="tu@empresa.com"
                                        required 
                                        disabled={loading}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-950/60 border border-slate-800 text-white text-sm placeholder-slate-500 focus:bg-slate-950/90 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none disabled:opacity-50"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1.5 block">Contraseña</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                                        <Lock size={16} />
                                    </div>
                                    <input 
                                        type={showPassword ? 'text' : 'password'} 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        placeholder="••••••••"
                                        required 
                                        disabled={loading}
                                        className="w-full pl-10 pr-11 py-3 bg-slate-950/60 border border-slate-800 text-white text-sm placeholder-slate-500 focus:bg-slate-950/90 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none disabled:opacity-50"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                                {view === 'register' && (
                                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold">
                                        <CheckCircle2 size={13} className={password.length >= 6 ? 'text-emerald-400' : 'text-slate-600'} />
                                        <span className={password.length >= 6 ? 'text-emerald-400' : 'text-slate-500'}>
                                            Mínimo 6 caracteres ({password.length}/6)
                                        </span>
                                    </div>
                                )}
                            </div>
                            
                            {view === 'login' && (
                                <div className="flex items-center justify-between pt-0.5">
                                    <label className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={rememberEmail}
                                            onChange={(e) => setRememberEmail(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500/30"
                                        />
                                        <span>Recordar mi correo</span>
                                    </label>
                                    <button type="button" onClick={() => switchView('reset')} className="text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer">
                                        ¿Olvidaste tu contraseña?
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-center">
                                    {error}
                                </div>
                            )}

                            {message && (
                                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-center">
                                    {message}
                                </div>
                            )}
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Procesando...</span>
                                    </>
                                ) : (
                                    view === 'login' ? 'Ingresar al Portal' : 'Crear mi Cuenta'
                                )}
                            </button>
                        </form>
                    )}

                    {view !== 'reset' && (
                        <div className="mt-5 flex flex-col gap-3">
                            <div className="relative my-1">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                                <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                    <span className="px-3 bg-slate-900/80 backdrop-blur-xl">O continuar con</span>
                                </div>
                            </div>
                            
                            {/* Animated Google Login Button Container */}
                            <div className="relative group overflow-hidden rounded-xl p-[1px]">
                                <div className="absolute inset-[-1000%] animate-spin-slow bg-[conic-gradient(from_0deg,#4285F4,#EA4335,#FBBC05,#34A853,#4285F4)] opacity-80 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                                <button 
                                    type="button" 
                                    onClick={handleGoogleLogin} 
                                    disabled={loading}
                                    className="w-full relative flex items-center justify-center gap-3 py-3 px-4 bg-slate-950 hover:bg-slate-900 text-slate-200 hover:text-white font-bold text-sm rounded-xl transition-all shadow-sm cursor-pointer border border-transparent disabled:opacity-50"
                                >
                                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    <span>{loading ? 'Conectando...' : 'Acceder con Google'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="mt-5 text-center border-t border-slate-800/80 pt-4 flex flex-col gap-2">
                        <button onClick={() => switchView(view === 'login' ? 'register' : 'login')} className="text-xs sm:text-sm font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer">
                            {view === 'login' ? '¿No tienes cuenta? Regístrate aquí' : '← Volver al inicio de sesión'}
                        </button>
                        <a
                            href="https://wa.me/5493815551234?text=Hola%20G%26R%20Consultores%2C%20necesito%20asistencia%20con%20mi%20acceso."
                            target="_blank"
                            rel="noopener noreferrer"
                            className="lg:hidden inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 mt-1"
                        >
                            <MessageCircle size={13} />
                            <span>Soporte por WhatsApp</span>
                        </a>
                    </div>

                    <div className="text-center mt-4">
                        <p className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1.5 uppercase tracking-tighter">
                            <Shield size={10} className="text-blue-400/80"/>
                            G&R System v2.7 • Seguridad Verificada
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AppContent = () => {
    const { user, userData } = useAuth();
    const [currentRoute, setCurrentRoute] = useState('dashboard');
    const [clientCenterFolder, setClientCenterFolder] = useState(null);

    if (!user) return <LoginPage />;

    const renderContent = () => {
        switch (currentRoute) {
            case 'microcredits':
                return <MicrocreditsPanel userData={userData} />;
            case 'dashboard':
                return <DashboardPage navigate={setCurrentRoute} setClientCenterFolder={setClientCenterFolder} />;
            case 'billing':
                return <BillingRequestsPage navigate={setCurrentRoute} />;
            case 'operations':
                return <OperationsPage />;
            case 'finances':
                return <FinancesPage />;
            case 'client-center':
                return <ClientCenterPage 
                            initialFolder={clientCenterFolder} 
                            onFolderOpened={() => setClientCenterFolder(null)} 
                        />;
            case 'profile':
                return <ProfilePage />;
            case 'reports':
                return <ReportsPage />;
            case 'gestion':
                return <GestionPage navigate={setCurrentRoute} />;
            case 'gestion/terceros':
                return <TercerosPage navigate={setCurrentRoute} />;
            case 'gestion/deudores':
                return <DeudoresPage navigate={setCurrentRoute} />;
            case 'gestion/proveedores':
                return <ProveedoresPage navigate={setCurrentRoute} />;
            case 'gestion/cheques':
                return <ChequesPage navigate={setCurrentRoute} />;

            case 'admin':
                return <AdminPage navigate={setCurrentRoute} />;
            default:
                if (currentRoute.startsWith('gestion/deudores/')) {
                    const id = currentRoute.split('/').pop();
                    return <CuentaCorrienteClientePage terceroId={id} navigate={setCurrentRoute} />;
                }
                if (currentRoute.startsWith('gestion/proveedores/')) {
                    const id = currentRoute.split('/').pop();
                    return <CuentaCorrienteProveedorPage terceroId={id} navigate={setCurrentRoute} />;
                }
                if (currentRoute.startsWith('admin/manage/')) {

                    const userId = currentRoute.split('/').pop();
                    return <AdminClientManagementPage userId={userId} navigate={setCurrentRoute} />;
                }
                return (
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
                        <h2 className="text-xl font-bold mb-2">Sección en Construcción</h2>
                        <p className="text-gray-500">Esta sección se está migrando al nuevo sistema de Vite. Use el menú lateral para navegar.</p>
                    </div>
                );
        }
    };

    return (
        <AppLayout currentRoute={currentRoute} navigate={setCurrentRoute}>
            {renderContent()}
        </AppLayout>
    );
};

function App() {
  return (
    <AuthProvider>
      <ClientSelectionProvider>
        <AppContent />
      </ClientSelectionProvider>
    </AuthProvider>
  );
}

export default App;
