import React from 'react';
import { ShieldAlert, Clock, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const SessionWarningModal = () => {
    const { showSessionWarning, sessionSecondsLeft, extendSession, logoutNow } = useAuth();

    if (!showSessionWarning) return null;

    const formatTime = (totalSeconds) => {
        if (!totalSeconds || totalSeconds <= 0) return '00:00';
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
            <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-900/20 text-white relative overflow-hidden">
                {/* Decorative glowing gradient */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400 animate-pulse">
                        <ShieldAlert size={32} />
                    </div>

                    <h3 className="text-xl font-black tracking-tight text-white mb-2">
                        Sesión Próxima a Expirar
                    </h3>

                    <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                        Por motivos de seguridad, tu sesión finaliza automáticamente después de 4 horas de uso continuo.
                    </p>

                    {/* Timer Box */}
                    <div className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            <Clock size={16} className="text-amber-400" />
                            Tiempo restante:
                        </div>
                        <div className="font-mono text-2xl font-black text-amber-400 tracking-wider">
                            {formatTime(sessionSecondsLeft)}
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                        <button
                            onClick={extendSession}
                            className="flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-sm"
                        >
                            <RefreshCw size={16} />
                            Continuar Sesión
                        </button>
                        
                        <button
                            onClick={logoutNow}
                            className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl border border-slate-700 transition-all cursor-pointer text-sm"
                        >
                            <LogOut size={16} />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionWarningModal;
