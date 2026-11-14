import React, { useState } from 'react';
import Icon from '../../Common/Icon';
import { WEBHOOK_URL } from '../../../utils/billingUtils';

/** Modal de configuración de conexión WhatsApp */
const WhatsAppConnectionModal = ({ onClose }) => {
    const [expandedOption, setExpandedOption] = useState(null);
    const [copied, setCopied] = useState(false);

    const copyWebhook = () => {
        navigator.clipboard.writeText(WEBHOOK_URL);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const StepItem = ({ step, title, desc, extra, link, links, color = 'blue' }) => (
        <li className="flex gap-3 items-start">
            <span className={`shrink-0 w-6 h-6 rounded-full bg-${color}-600 text-white text-[10px] font-black flex items-center justify-center mt-0.5`}>{step}</span>
            <div className="space-y-1 flex-1">
                <p className="text-xs font-bold text-gray-800">{title}</p>
                <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
                {extra && (
                    <div className="mt-1 flex items-center gap-2">
                        <code className={`text-[10px] bg-white border border-${color}-200 text-${color}-700 px-2 py-1 rounded-lg font-mono break-all flex-1`}>{extra}</code>
                        <button onClick={copyWebhook} className={`shrink-0 text-${color}-600 hover:text-${color}-800 transition-colors`} title="Copiar URL">
                            <Icon name={copied ? "Check" : "Copy"} size={13}/>
                        </button>
                    </div>
                )}
                {link && (
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[11px] text-${color}-600 font-bold hover:underline mt-0.5`}>
                        <Icon name="ExternalLink" size={12}/> {link.label}
                    </a>
                )}
                {links && (
                    <div className="flex gap-3 mt-1">
                        {links.map(l => (
                            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-[11px] text-${color}-600 font-bold hover:underline`}>
                                <Icon name="ExternalLink" size={12}/> {l.label}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </li>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-xl w-full p-8 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-emerald-100 text-emerald-600 rounded-2xl">
                            <Icon name="MessageCircle" size={28}/>
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-gray-900">Conexión de WhatsApp</h3>
                            <p className="text-xs text-gray-500 font-medium">Recepción y clasificación automática de comprobantes</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-xl">
                        <Icon name="X" size={20}/>
                    </button>
                </div>

                <div className="space-y-5">
                    {/* Cómo funciona */}
                    <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-100 space-y-2">
                        <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Icon name="CheckCircle" size={14}/> ¿Cómo funciona la vinculación?
                        </h4>
                        <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                            ¡Es 100% automática! Los comprobantes que llegan a tu número de WhatsApp Business son reenviados a nuestro Webhook. La IA detecta el emisor, receptor, monto y CUIT; si el remitente o el CUIT coincide con algún cliente del estudio, <strong>se asocia automáticamente</strong>.
                        </p>
                    </div>

                    {/* URL del Webhook */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block px-1">
                            URL de tu Webhook Cloud Functions (Listo para usar)
                        </label>
                        <div className="flex items-center gap-2">
                            <input type="text" readOnly value={WEBHOOK_URL}
                                className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-700 select-all outline-none"
                            />
                            <button onClick={copyWebhook}
                                className={`px-4 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${copied ? 'bg-emerald-500 text-white' : 'bg-gray-800 hover:bg-black text-white'}`}
                            >
                                <Icon name={copied ? "Check" : "Copy"} size={14}/>
                                {copied ? '¡Copiado!' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    {/* Opciones como acordeones */}
                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 px-1">
                            Elegí tu método de conexión
                        </h4>

                        {/* Opción 1 – Evolution API */}
                        <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                            expandedOption === 1 ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/20'
                        }`}>
                            <button onClick={() => setExpandedOption(expandedOption === 1 ? null : 1)}
                                className="w-full p-4 flex items-center gap-3 text-left">
                                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0"><Icon name="Smartphone" size={16}/></div>
                                <div className="flex-1">
                                    <p className="font-black text-gray-800 text-xs">Opción 1: Evolution API / Baileys</p>
                                    <p className="text-[11px] text-gray-500">Recomendada · Escaneo QR único, sin perder tu app</p>
                                </div>
                                <div className={`text-blue-500 transition-transform duration-200 ${expandedOption === 1 ? 'rotate-180' : ''}`}>
                                    <Icon name="ChevronDown" size={18}/>
                                </div>
                            </button>
                            {expandedOption === 1 && (
                                <div className="px-4 pb-5 space-y-4">
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Evolution API es un servidor que conecta tu WhatsApp Business a cualquier webhook. Se instala en un VPS propio o en la nube y solo necesitás escanear el QR una sola vez.
                                    </p>
                                    <ol className="space-y-3">
                                        <StepItem step={1} color="blue"
                                            title="Instalá Evolution API en tu servidor"
                                            desc="Necesitás un VPS (DigitalOcean, Hetzner, etc.) con Docker. Seguí la guía oficial:"
                                            link={{ label: "Ver documentación oficial de Evolution API →", url: "https://doc.evolution-api.com/v2/pt/get-started/introduction" }}
                                        />
                                        <StepItem step={2} color="blue"
                                            title="Creá una instancia de WhatsApp"
                                            desc="Desde el panel de Evolution API (o vía API REST), creás una nueva instancia, escaneás el QR con tu celular y tu número queda vinculado."
                                        />
                                        <StepItem step={3} color="blue"
                                            title="Configurá el Webhook en la instancia"
                                            desc="En la configuración de la instancia, ingresá esta URL en el campo Webhook URL y activá los eventos: MESSAGES_UPSERT y MESSAGES_UPDATE."
                                            extra={WEBHOOK_URL}
                                        />
                                        <StepItem step={4} color="blue"
                                            title="¡Listo! La conexión es automática"
                                            desc="Desde ese momento, cada foto o PDF que recibas en WhatsApp se procesará con la IA y aparecerá en esta bandeja."
                                        />
                                    </ol>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <p className="text-[11px] text-amber-800 font-medium">
                                            💡 <strong>Sin servidor propio:</strong> Podés usar{' '}
                                            <a href="https://app.evolution-api.com" target="_blank" rel="noopener noreferrer" className="underline font-bold">Evolution API Cloud</a>{' '}
                                            (versión gestionada) o un hosting con Docker preconfigurado.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Opción 2 – Make / n8n / Zapier */}
                        <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                            expandedOption === 2 ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50/20'
                        }`}>
                            <button onClick={() => setExpandedOption(expandedOption === 2 ? null : 2)}
                                className="w-full p-4 flex items-center gap-3 text-left">
                                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl shrink-0"><Icon name="Layers" size={16}/></div>
                                <div className="flex-1">
                                    <p className="font-black text-gray-800 text-xs">Opción 2: Make / n8n / Zapier</p>
                                    <p className="text-[11px] text-gray-500">Sin servidor · Conectás tu WhatsApp vía automatización</p>
                                </div>
                                <div className={`text-indigo-500 transition-transform duration-200 ${expandedOption === 2 ? 'rotate-180' : ''}`}>
                                    <Icon name="ChevronDown" size={18}/>
                                </div>
                            </button>
                            {expandedOption === 2 && (
                                <div className="px-4 pb-5 space-y-4">
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Si ya tenés WhatsApp Business conectado a Make, n8n o Zapier, solo necesitás agregar un paso HTTP POST que reenvíe el mensaje a nuestro webhook.
                                    </p>
                                    <ol className="space-y-3">
                                        <StepItem step={1} color="indigo"
                                            title="Abrí tu plataforma de automatización"
                                            desc="Creá un nuevo Escenario (Make), Workflow (n8n) o Zap (Zapier) con el trigger: 'Mensaje entrante de WhatsApp'."
                                            links={[
                                                { label: "Ir a Make →", url: "https://www.make.com" },
                                                { label: "Ir a n8n →", url: "https://n8n.io" },
                                            ]}
                                        />
                                        <StepItem step={2} color="indigo"
                                            title="Agrega un módulo HTTP POST"
                                            desc="Añadí un paso 'HTTP Request' con método POST y la siguiente URL:"
                                            extra={WEBHOOK_URL}
                                        />
                                        <StepItem step={3} color="indigo"
                                            title="Mapeá el cuerpo del mensaje"
                                            desc="En el body, mapeá: número de teléfono del remitente (phone), texto del mensaje (body) y si hay adjunto, su URL (mediaUrl / fileUrl)."
                                        />
                                        <StepItem step={4} color="indigo"
                                            title="Activá y probá el flujo"
                                            desc="Enviá un comprobante de prueba. Debería aparecer en esta bandeja en segundos con la clasificación automática de la IA."
                                        />
                                    </ol>
                                </div>
                            )}
                        </div>
                    </div>

                    <button onClick={onClose}
                        className="w-full py-3.5 bg-gray-900 hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppConnectionModal;
