import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
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
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { auth, googleProvider } from './firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signInWithPopup 
} from 'firebase/auth';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState('login'); 
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    
    const handleEmailPassword = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        try {
            if (view === 'register') {
                await createUserWithEmailAndPassword(auth, email, password);
            } else {
                await signInWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            let friendlyMessage = 'Error al autenticar.';
            if (err.code === 'auth/email-already-in-use') friendlyMessage = 'Este email ya está registrado.';
            else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') friendlyMessage = 'Email o contraseña incorrectos.';
            setError(friendlyMessage);
        }
    };

    const handlePasswordReset = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        try {
            await sendPasswordResetEmail(auth, email);
            setMessage('Correo de recuperación enviado. Revisa tu bandeja.');
        } catch (err) {
            setError('No se pudo enviar el correo.');
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
        } catch (err) {
            setError('Error al iniciar sesión con Google.');
        }
    };

    const switchView = (newView) => {
        setView(newView);
        setError('');
        setMessage('');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
            {/* Glowing background orbs */}
            <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[8000ms]"></div>
            <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none animate-pulse duration-[6000ms]"></div>

            <div className="max-w-md w-full backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 p-8 rounded-3xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] z-10 transition-all">
                <div className="text-center mb-8">
                    <div className="bg-blue-600/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/20 shadow-lg shadow-blue-500/5">
                        <BarChart3 size={32} className="text-blue-400 animate-pulse"/>
                    </div>
                    <h2 className="text-3xl font-black text-white tracking-tight">
                        {view === 'login' ? 'Iniciar Sesión' : view === 'register' ? 'Crear Cuenta' : 'Recuperar'}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400 font-medium">
                        {view === 'reset' ? 'Ingresa tu email para recuperar el acceso.' : 'Bienvenido a G&R Consultores v2.1'}
                    </p>
                </div>

                {view === 'reset' ? (
                    <form onSubmit={handlePasswordReset} className="space-y-5">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Email</label>
                            <input 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                placeholder="tu@ejemplo.com"
                                required 
                                className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800/80 text-white placeholder-slate-600 focus:bg-slate-950/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none"
                            />
                        </div>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs font-semibold text-center">
                                {error}
                            </div>
                        )}
                        {message && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-xl text-xs font-semibold text-center">
                                {message}
                            </div>
                        )}
                        <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                            Enviar correo
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleEmailPassword} className="space-y-5">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Email</label>
                            <input 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                placeholder="tu@ejemplo.com"
                                required 
                                className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800/80 text-white placeholder-slate-600 focus:bg-slate-950/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Contraseña</label>
                            <input 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                placeholder="••••••••"
                                required 
                                className="w-full px-4 py-3 bg-slate-950/40 border border-slate-800/80 text-white placeholder-slate-600 focus:bg-slate-950/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition-all outline-none"
                            />
                        </div>
                        
                        {view === 'login' && (
                            <div className="text-right">
                                <button type="button" onClick={() => switchView('reset')} className="text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors">
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs font-semibold text-center">
                                {error}
                            </div>
                        )}
                        <button type="submit" className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer">
                            {view === 'login' ? 'Ingresar' : 'Registrarse'}
                        </button>
                    </form>
                )}

                {view !== 'reset' && (
                    <div className="mt-6 flex flex-col gap-3">
                        <div className="relative my-3">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
                            <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-500 tracking-widest">
                                <span className="px-3 bg-slate-900/20 backdrop-blur-xl">O continuar con</span>
                            </div>
                        </div>
                        <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-slate-950/20 border border-slate-800/80 rounded-xl font-bold text-slate-300 hover:bg-slate-800/40 hover:text-white transition-all shadow-sm cursor-pointer">
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Acceder con Google
                        </button>
                    </div>
                )}

                <div className="mt-8 text-center border-t border-slate-800/80 pt-6">
                    <button onClick={() => switchView(view === 'login' ? 'register' : 'login')} className="text-sm font-bold text-blue-400 hover:text-blue-300 hover:underline transition-colors cursor-pointer">
                        {view === 'login' ? '¿No tienes cuenta? Regístrate' : 'Volver al inicio'}
                    </button>
                </div>

                <div className="text-center mt-6">
                    <p className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1.5 uppercase tracking-tighter">
                        <Shield size={10} className="text-blue-400/80"/>
                        G&R System v2.1 • Seguridad Verificada
                    </p>
                </div>
            </div>
        </div>
    );
};

const AppContent = () => {
    const { user, userData } = useAuth();
    const [currentRoute, setCurrentRoute] = useState('dashboard');

    if (!user) return <LoginPage />;

    const renderContent = () => {
        switch (currentRoute) {
            case 'microcredits':
                return <MicrocreditsPanel userData={userData} />;
            case 'dashboard':
                return <DashboardPage />;
            case 'billing':
                return <BillingRequestsPage />;
            case 'operations':
                return <OperationsPage />;
            case 'finances':
                return <FinancesPage />;
            case 'client-center':
                return <ClientCenterPage />;
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
      <AppContent />
    </AuthProvider>
  );
}

export default App;
