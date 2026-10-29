import React, { useState, useMemo } from 'react';
import Icon from '../Common/Icon';

const FixedDepositCalculator = ({ dollarRates = [], onScheduleInCashFlow }) => {
    const [capital, setCapital] = useState('1000000');
    const [days, setDays] = useState(30);
    const [tna, setTna] = useState('37');
    const [inflacionMensual, setInflacionMensual] = useState('2.5');
    const [selectedDollarCasa, setSelectedDollarCasa] = useState('bolsa'); // MEP o Blue

    const formatCurrency = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return '$0,00';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    };

    const formatUSD = (value) => {
        if (value === null || typeof value === 'undefined' || isNaN(value)) return 'USD 0,00';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(value);
    };

    const selectedDollarRate = useMemo(() => {
        if (!dollarRates || dollarRates.length === 0) return null;
        return (
            dollarRates.find(r => r.casa === selectedDollarCasa) ||
            dollarRates.find(r => r.casa === 'blue') ||
            dollarRates[0]
        );
    }, [dollarRates, selectedDollarCasa]);

    const metrics = useMemo(() => {
        const numCapital = parseFloat(capital) || 0;
        const numDays = Math.max(1, parseInt(days, 10) || 0);
        const numTna = parseFloat(tna) || 0;
        const numInfMensual = parseFloat(inflacionMensual) || 0;

        const maturityDate = new Date();
        maturityDate.setDate(maturityDate.getDate() + numDays);
        const maturityDateISO = maturityDate.toISOString().split('T')[0];
        const maturityDateDisplay = maturityDate.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        if (numCapital <= 0 || numDays <= 0 || numTna <= 0) {
            return {
                interest: 0,
                total: numCapital > 0 ? numCapital : 0,
                dailyInterest: 0,
                periodRatePct: 0,
                temPct: 0,
                teaPct: 0,
                inflationPeriodPct: 0,
                inflationCapitalNeeded: numCapital,
                realGainArs: 0,
                realReturnPct: 0,
                usdInitial: 0,
                usdFinalAtCurrentRate: 0,
                breakevenDollar: 0,
                maturityDateISO,
                maturityDateDisplay
            };
        }

        const periodRate = (numTna / 100) * (numDays / 365);
        const interest = numCapital * periodRate;
        const total = numCapital + interest;
        const dailyInterest = interest / numDays;

        // Tasa Efectiva Mensual (equivalente a 30 días) y TEA con capitalización del período
        const periodsPerYear = 365 / numDays;
        const teaPct = (Math.pow(1 + periodRate, periodsPerYear) - 1) * 100;
        const temPct = (Math.pow(1 + periodRate, 30 / numDays) - 1) * 100;

        // Comparativa contra inflación compuesta en los días de plazo
        const inflationPeriodRate = Math.pow(1 + (numInfMensual / 100), numDays / 30) - 1;
        const inflationPeriodPct = inflationPeriodRate * 100;
        const inflationCapitalNeeded = numCapital * (1 + inflationPeriodRate);
        const realGainArs = total - inflationCapitalNeeded;
        const realReturnPct = (((1 + periodRate) / (1 + inflationPeriodRate)) - 1) * 100;

        // Equivalencia en USD y Dólar de equilibrio (Carry Trade)
        const rateVenta = selectedDollarRate?.venta || 0;
        const usdInitial = rateVenta > 0 ? numCapital / rateVenta : 0;
        const usdFinalAtCurrentRate = rateVenta > 0 ? total / rateVenta : 0;
        const breakevenDollar = usdInitial > 0 ? total / usdInitial : 0;

        return {
            interest,
            total,
            dailyInterest,
            periodRatePct: periodRate * 100,
            temPct,
            teaPct,
            inflationPeriodPct,
            inflationCapitalNeeded,
            realGainArs,
            realReturnPct,
            usdInitial,
            usdFinalAtCurrentRate,
            breakevenDollar,
            maturityDateISO,
            maturityDateDisplay
        };
    }, [capital, days, tna, inflacionMensual, selectedDollarRate]);

    return (
        <div className="bg-gradient-to-br from-indigo-950 via-blue-950 to-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl text-white relative overflow-hidden group transition-all flex flex-col gap-6">
            <div className="absolute top-0 right-0 w-72 h-72 bg-blue-400 opacity-5 mix-blend-overlay rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4 z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2.5 rounded-2xl border border-blue-400/20">
                        <Icon name="PieChart" className="w-6 h-6 text-blue-300" />
                    </div>
                    <div>
                        <h3 className="text-lg sm:text-xl font-black tracking-tight">
                            Simulador de Rendimiento y Tasa Real
                        </h3>
                        <p className="text-xs text-blue-200/70 font-medium">
                            Plazo Fijo, Lecaps y Fondos Money Market vs. Inflación y Dólar
                        </p>
                    </div>
                </div>

                {onScheduleInCashFlow && metrics.total > 0 && (
                    <button
                        type="button"
                        onClick={() => onScheduleInCashFlow({
                            type: 'ingreso',
                            category: 'Inversiones',
                            description: `Cobro Vto. Plazo Fijo (${days}d al ${tna}% TNA)`,
                            amount: metrics.total,
                            date: metrics.maturityDateISO,
                            periodicity: 'once'
                        })}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/40 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
                    >
                        <Icon name="Calendar" size={14} /> Agendar Vto. en Cash Flow ({metrics.maturityDateDisplay})
                    </button>
                )}
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 z-10">
                {/* Capital Inicial */}
                <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-md border border-white/10 focus-within:bg-white/15 focus-within:border-blue-400/40 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">
                        Capital Inicial (ARS)
                    </label>
                    <div className="flex items-center">
                        <span className="text-blue-300 font-bold mr-1.5">$</span>
                        <input
                            type="number"
                            value={capital}
                            onChange={e => setCapital(e.target.value)}
                            onFocus={e => e.target.select()}
                            className="w-full bg-transparent border-none text-white font-black text-base focus:ring-0 placeholder-blue-300/40 outline-none font-mono"
                            placeholder="1000000"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                        {[500000, 1000000, 5000000].map(preset => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => setCapital(String(preset))}
                                className="text-[9px] font-bold bg-white/10 hover:bg-white/20 text-blue-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                            >
                                ${preset >= 1000000 ? `${preset / 1000000}M` : `${preset / 1000}k`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Plazo en Días */}
                <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-md border border-white/10 focus-within:bg-white/15 focus-within:border-blue-400/40 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">
                        Plazo (Días) • Vto: {metrics.maturityDateDisplay}
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={days}
                        onChange={e => setDays(e.target.value)}
                        onFocus={e => e.target.select()}
                        className="w-full bg-transparent border-none text-white font-black text-base focus:ring-0 outline-none font-mono"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/10">
                        {[30, 60, 90, 180, 365].map(d => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDays(d)}
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${Number(days) === d ? 'bg-blue-500 text-white' : 'bg-white/10 hover:bg-white/20 text-blue-100'}`}
                            >
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* TNA % */}
                <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-md border border-white/10 focus-within:bg-white/15 focus-within:border-blue-400/40 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">
                        Tasa Nominal Anual (TNA)
                    </label>
                    <div className="flex items-center">
                        <input
                            type="number"
                            step="0.1"
                            value={tna}
                            onChange={e => setTna(e.target.value)}
                            onFocus={e => e.target.select()}
                            className="w-full bg-transparent border-none text-white font-black text-base focus:ring-0 placeholder-blue-300/40 outline-none font-mono"
                            placeholder="37.0"
                        />
                        <span className="text-blue-300 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-blue-200/70 mt-2 pt-2 border-t border-white/10">
                        Tasa del período: <strong className="text-white">{metrics.periodRatePct.toFixed(2)}%</strong>
                    </p>
                </div>

                {/* Inflación Mensual Estimada */}
                <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-md border border-white/10 focus-within:bg-white/15 focus-within:border-amber-400/40 transition-colors">
                    <label className="block text-[10px] font-bold text-amber-200 uppercase tracking-widest mb-1">
                        Inflación Mensual Est.
                    </label>
                    <div className="flex items-center">
                        <input
                            type="number"
                            step="0.1"
                            value={inflacionMensual}
                            onChange={e => setInflacionMensual(e.target.value)}
                            onFocus={e => e.target.select()}
                            className="w-full bg-transparent border-none text-white font-black text-base focus:ring-0 placeholder-amber-300/40 outline-none font-mono"
                            placeholder="2.5"
                        />
                        <span className="text-amber-300 font-bold">%</span>
                    </div>
                    <p className="text-[10px] text-amber-200/80 mt-2 pt-2 border-t border-white/10">
                        Inflación en {days || 0}d: <strong className="text-white">{metrics.inflationPeriodPct.toFixed(2)}%</strong>
                    </p>
                </div>
            </div>

            {/* Tarjeta Principal de Resultados */}
            <div className="bg-black/30 rounded-2xl p-5 sm:p-6 backdrop-blur-sm border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center z-10">
                <div className="text-center md:text-left">
                    <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">
                        Interés Ganado ({days || 0} días)
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-400">
                        +{formatCurrency(metrics.interest)}
                    </p>
                    <p className="text-xs text-slate-300 mt-1">
                        Ganancia diaria: <strong className="text-white">{formatCurrency(metrics.dailyInterest)}/día</strong>
                    </p>
                </div>

                <div className="flex justify-center gap-4 border-y md:border-y-0 md:border-x border-white/10 py-4 md:py-0">
                    <div className="text-center">
                        <span className="text-[10px] font-bold text-blue-200 uppercase tracking-wider block">TEM (30d)</span>
                        <span className="text-lg sm:text-xl font-black text-white">{metrics.temPct.toFixed(2)}%</span>
                        <span className="text-[9px] text-slate-400 block">Efectiva mensual</span>
                    </div>
                    <div className="text-center pl-4 border-l border-white/10">
                        <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider block">TEA Anual</span>
                        <span className="text-lg sm:text-xl font-black text-indigo-300">{metrics.teaPct.toFixed(2)}%</span>
                        <span className="text-[9px] text-slate-400 block">Renovando c/{days || 30}d</span>
                    </div>
                </div>

                <div className="text-center md:text-right">
                    <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">
                        Monto Final a Cobrar ({metrics.maturityDateDisplay})
                    </p>
                    <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        {formatCurrency(metrics.total)}
                    </p>
                </div>
            </div>

            {/* Comparativa Tasa Real (vs Inflación) y Carry Trade (vs Dólar) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 z-10">
                {/* Rendimiento Real vs Inflación */}
                <div className={`p-4 sm:p-5 rounded-2xl border ${metrics.realGainArs >= 0 ? 'bg-emerald-950/40 border-emerald-500/30' : 'bg-rose-950/40 border-rose-500/30'} flex flex-col justify-between gap-3`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-white">
                            <Icon name={metrics.realGainArs >= 0 ? 'TrendingUp' : 'TrendingDown'} size={16} className={metrics.realGainArs >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
                            Rendimiento Real vs. Inflación
                        </span>
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase ${metrics.realGainArs >= 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
                            {metrics.realGainArs >= 0 ? `Tasa Real Positiva (+${metrics.realReturnPct.toFixed(2)}%)` : `Licuación (${metrics.realReturnPct.toFixed(2)}%)`}
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                        <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                            <span className="text-[10px] text-slate-300 block">Capital ajustado por inflación:</span>
                            <span className="font-bold text-white text-sm">{formatCurrency(metrics.inflationCapitalNeeded)}</span>
                        </div>
                        <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                            <span className="text-[10px] text-slate-300 block">Ganancia / Pérdida Poder Adq.:</span>
                            <span className={`font-black text-sm ${metrics.realGainArs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {metrics.realGainArs >= 0 ? '+' : ''}{formatCurrency(metrics.realGainArs)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Cobertura Cambiaria (Carry Trade USD) */}
                <div className="p-4 sm:p-5 rounded-2xl border bg-slate-900/60 border-white/10 flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 text-blue-200">
                            <Icon name="DollarSign" size={16} className="text-emerald-400" />
                            Equivalencia en USD y Dólar de Equilibrio
                        </span>
                        {dollarRates && dollarRates.length > 0 && (
                            <select
                                value={selectedDollarRate?.casa || selectedDollarCasa}
                                onChange={e => setSelectedDollarCasa(e.target.value)}
                                className="bg-white/10 border border-white/15 text-white rounded-lg px-2 py-0.5 text-[10px] font-bold outline-none cursor-pointer"
                            >
                                {dollarRates.map(r => (
                                    <option key={r.casa} value={r.casa} className="bg-slate-900 text-white">
                                        {r.nombre} (${r.venta})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {selectedDollarRate ? (
                        <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                            <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                                <span className="text-[9px] text-slate-400 uppercase font-bold block">Capital Hoy</span>
                                <span className="font-bold text-white text-xs sm:text-sm">{formatUSD(metrics.usdInitial)}</span>
                            </div>
                            <div className="bg-black/20 p-2.5 rounded-xl border border-white/5">
                                <span className="text-[9px] text-slate-400 uppercase font-bold block">Al Vto (TC hoy)</span>
                                <span className="font-bold text-emerald-400 text-xs sm:text-sm">{formatUSD(metrics.usdFinalAtCurrentRate)}</span>
                            </div>
                            <div className="bg-indigo-500/20 p-2.5 rounded-xl border border-indigo-400/30">
                                <span className="text-[9px] text-indigo-200 uppercase font-bold block" title="Valor máximo al que puede subir el dólar al vencimiento para empatar la inversión en pesos">
                                    Dólar Equilibrio
                                </span>
                                <span className="font-black text-white text-xs sm:text-sm">{formatCurrency(metrics.breakevenDollar)}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic">Cotizaciones cambiarias no disponibles.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FixedDepositCalculator;
