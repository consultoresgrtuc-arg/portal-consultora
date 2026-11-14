import React, { useEffect } from 'react';
import {
    ShieldCheck,
    Lock,
    X,
    ExternalLink,
    CheckCircle2,
    Scale,
    KeyRound,
    UserCheck,
    Server
} from 'lucide-react';

const PrivacySecurityModal = ({ isOpen, onClose, whatsappUrl }) => {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-modal-title"
            onClick={onClose}
        >
            <div
                className="max-w-3xl w-full max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl shadow-black/70 text-slate-200 relative overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative background glows */}
                <div className="absolute -top-24 -left-24 w-56 h-56 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

                {/* Header */}
                <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-800 bg-slate-950/60 relative z-10">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                            <ShieldCheck size={22} />
                        </div>
                        <div>
                            <h3 id="privacy-modal-title" className="text-lg sm:text-xl font-black text-white tracking-tight">
                                Política de Privacidad, Seguridad y Uso de Google Sign-In
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Gramajo &amp; Romero Consultores • Cumplimiento Normativo Nacional e Internacional
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar política de privacidad y seguridad"
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs sm:text-sm leading-relaxed text-slate-300 relative z-10">
                    {/* Intro */}
                    <div className="bg-slate-950/60 border border-slate-800/90 rounded-2xl p-4">
                        <p>
                            En <strong className="text-white">Gramajo &amp; Romero Consultores (G&amp;R Consultores)</strong>,
                            la ética profesional, la confidencialidad y el cumplimiento estricto de las leyes nacionales e
                            internacionales constituyen pilares fundamentales de nuestra práctica. Esta política explica
                            de manera transparente cómo protegemos tu información y qué sucede cuando utilizás el servicio
                            de inicio de sesión con <strong className="text-white">Google</strong> para acceder al portal.
                        </p>
                    </div>

                    {/* Section 1: Google Sign-In & Limited Use */}
                    <section className="space-y-2.5">
                        <h4 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                            <KeyRound size={17} className="text-blue-400 shrink-0" />
                            <span>1. Inicio de Sesión con Google (OAuth 2.0 / Firebase Authentication)</span>
                        </h4>
                        <p>
                            Al seleccionar <span className="text-white font-semibold">&ldquo;Acceder con Google&rdquo;</span>,
                            la autenticación se realiza directamente a través de la infraestructura oficial de{' '}
                            <strong className="text-white">Google Identity / Firebase Authentication (Google LLC)</strong>{' '}
                            mediante el protocolo estándar <strong className="text-white">OAuth 2.0 / OpenID Connect</strong>.
                        </p>
                        <ul className="space-y-2 pl-1">
                            <li className="flex items-start gap-2">
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-slate-100">Datos mínimos solicitados:</strong> Únicamente
                                    accedemos a tu información básica de identidad provista por Google (nombre completo,
                                    dirección de correo electrónico verificada, foto de perfil opcional e identificador único
                                    de usuario). <strong className="text-white">Nunca</strong> conocemos ni almacenamos tu
                                    contraseña de Google, ni solicitamos acceso a Gmail, Google Drive, Contactos o Calendario.
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-slate-100">Uso Limitado (Google API Services User Data Policy):</strong>{' '}
                                    La información obtenida mediante el inicio de sesión con Google se emplea de forma exclusiva
                                    para verificar tu identidad, administrar tu sesión segura y habilitar las funcionalidades
                                    autorizadas dentro del Portal G&amp;R Consultores. No vendemos, alquilamos ni cedemos tus
                                    datos a terceros con fines comerciales o publicitarios, ni los utilizamos para entrenar
                                    modelos de inteligencia artificial ajenos.
                                </span>
                            </li>
                            <li className="flex items-start gap-2">
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-slate-100">Condiciones de Google y reCAPTCHA v3:</strong> El flujo
                                    de autenticación de Google y los controles anti-bots integrados (Firebase App Check con
                                    reCAPTCHA v3) están sujetos asimismo a la{' '}
                                    <a
                                        href="https://policies.google.com/privacy"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-0.5"
                                    >
                                        Política de Privacidad de Google
                                        <ExternalLink size={11} />
                                    </a>{' '}
                                    y a las{' '}
                                    <a
                                        href="https://policies.google.com/terms"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-0.5"
                                    >
                                        Condiciones del Servicio de Google
                                        <ExternalLink size={11} />
                                    </a>
                                    .
                                </span>
                            </li>
                        </ul>
                    </section>

                    {/* Section 2: Legal Compliance */}
                    <section className="space-y-2.5">
                        <h4 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                            <Scale size={17} className="text-indigo-400 shrink-0" />
                            <span>2. Marco Legal Nacional e Internacional</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                                <p className="font-bold text-xs uppercase tracking-wider text-blue-300">
                                    Normativa Argentina
                                </p>
                                <p className="text-xs text-slate-300">
                                    Tratamiento ajustado a la <strong className="text-white">Ley N° 25.326</strong> de
                                    Protección de los Datos Personales, su Decreto Reglamentario N° 1558/2001, las
                                    disposiciones de la <strong className="text-white">Agencia de Acceso a la Información
                                    Pública (AAIP)</strong> y el deber de <strong className="text-white">Secreto Profesional</strong>{' '}
                                    aplicable a las Ciencias Económicas (Ley N° 20.488).
                                </p>
                            </div>
                            <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-3.5 space-y-1.5">
                                <p className="font-bold text-xs uppercase tracking-wider text-emerald-300">
                                    Estándares Internacionales
                                </p>
                                <p className="text-xs text-slate-300">
                                    Alineado con los principios del <strong className="text-white">RGPD / GDPR</strong>{' '}
                                    (Reglamento UE 2016/679) de minimización, licitud, limitación de finalidad y
                                    responsabilidad proactiva, así como controles de seguridad inspirados en{' '}
                                    <strong className="text-white">ISO/IEC 27001</strong> y{' '}
                                    <strong className="text-white">OWASP</strong>.
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400">
                            La infraestructura cloud utilizada (Google Cloud / Firebase y Vercel) aplica cifrado en
                            tránsito y en reposo y salvaguardas contractuales internacionales adecuadas para proteger los
                            datos alojados.
                        </p>
                    </section>

                    {/* Section 3: Technical Security */}
                    <section className="space-y-2.5">
                        <h4 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                            <Server size={17} className="text-emerald-400 shrink-0" />
                            <span>3. Medidas Técnicas de Seguridad de la Información</span>
                        </h4>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <li className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2">
                                <Lock size={14} className="text-blue-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-white">Cifrado TLS / HTTPS:</strong> Comunicaciones cifradas y
                                    cabeceras HTTP estrictas (HSTS, CSP, protección contra clickjacking).
                                </span>
                            </li>
                            <li className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2">
                                <ShieldCheck size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-white">Arquitectura Zero-Trust:</strong> Aislamiento estricto
                                    por cliente/entidad y verificación criptográfica de permisos en servidor.
                                </span>
                            </li>
                            <li className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2">
                                <ShieldCheck size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-white">Protección Anti-Abuso:</strong> Validación automática con
                                    Firebase App Check (reCAPTCHA v3) frente a accesos automatizados.
                                </span>
                            </li>
                            <li className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 flex items-start gap-2">
                                <Lock size={14} className="text-amber-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong className="text-white">Control de Sesión:</strong> Expiración automática de
                                    sesiones activas y resguardo de tokens de autenticación.
                                </span>
                            </li>
                        </ul>
                    </section>

                    {/* Section 4: User Rights & Revocation */}
                    <section className="space-y-2">
                        <h4 className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                            <UserCheck size={17} className="text-amber-400 shrink-0" />
                            <span>4. Derechos del Titular y Revocación de Acceso</span>
                        </h4>
                        <p>
                            Podés ejercer en cualquier momento tus derechos de <strong className="text-white">acceso,
                            rectificación, actualización o supresión</strong> de tus datos personales, o solicitar la baja
                            de tu cuenta contactando a nuestra consultora. Asimismo, podés revocar la vinculación con
                            Google Sign-In cuando lo desees desde{' '}
                            <a
                                href="https://myaccount.google.com/permissions"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-0.5"
                            >
                                permisos de tu Cuenta de Google
                                <ExternalLink size={11} />
                            </a>
                            . En la República Argentina, la Agencia de Acceso a la Información Pública (AAIP) es el
                            órgano de control competente ante reclamos vinculados a la Ley N° 25.326.
                        </p>
                    </section>
                </div>

                {/* Footer */}
                <div className="p-4 sm:px-6 border-t border-slate-800 bg-slate-950/70 flex flex-col sm:flex-row items-center justify-between gap-3 relative z-10">
                    <div className="text-[11px] text-slate-400 text-center sm:text-left">
                        ¿Consultas sobre privacidad o cumplimiento?{' '}
                        {whatsappUrl && (
                            <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 hover:text-emerald-300 font-semibold underline"
                            >
                                Contactar por WhatsApp (+54 9 381 201-9137)
                            </a>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PrivacySecurityModal;
