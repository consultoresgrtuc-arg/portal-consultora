import React, { useState, useEffect } from 'react';
import Icon from '../Common/Icon';

const FixedDepositCalculator = () => {
    const [capital, setCapital] = useState('');
    const [days, setDays] = useState(30);
    const [tna, setTna] = useState('');
    const [result, setResult] = useState({ interest: 0, total: 0 });

    const formatCurrency = (value) => {
        if (!value || isNaN(value)) return '$0,00';
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
    };

    useEffect(() => {
        const numCapital = parseFloat(capital);
        const numDays = parseInt(days, 10);
        const numTna = parseFloat(tna);

        if (numCapital > 0 && numDays > 0 && numTna > 0) {
            setResult({
                interest: (numCapital * numDays * numTna) / 36500,
                total: numCapital + ((numCapital * numDays * numTna) / 36500)
            });
        } else {
            setResult({ interest: 0, total: numCapital > 0 ? numCapital : 0 });
        }
    }, [capital, days, tna]);

    return (
        <div className="bg-gradient-to-br from-indigo-900 to-blue-900 p-8 rounded-3xl shadow-xl text-white relative overflow-hidden group hover:shadow-[0_8px_40px_rgb(30,58,138,0.3)] transition-all h-full flex flex-col">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 mix-blend-overlay rounded-full blur-3xl translate-x-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform duration-700"></div>
            
            <h3 className="text-xl font-bold mb-8 flex items-center z-10 relative">
                <Icon name="PieChart" className="w-6 h-6 mr-3 text-blue-300"/>
                Simulador de Rendimiento
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8 z-10 relative">
                <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-md border border-white/10 focus-within:bg-white/20 focus-within:border-white/30 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest px-2 pt-1">Capital inicial</label>
                    <div className="flex items-center px-2 pb-1">
                        <span className="text-blue-300 font-bold mr-1">$</span>
                        <input type="number" value={capital} onChange={e => setCapital(e.target.value)} onFocus={e => e.target.select()} className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-blue-300/50 outline-none" placeholder="0.00"/>
                    </div>
                </div>
                <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-md border border-white/10 focus-within:bg-white/20 focus-within:border-white/30 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest px-2 pt-1">Plazo (Días)</label>
                    <input type="number" value={days} onChange={e => setDays(e.target.value)} onFocus={e => e.target.select()} className="w-full bg-transparent border-none text-white font-bold focus:ring-0 px-2 pb-1 outline-none"/>
                </div>
                <div className="bg-white/10 rounded-2xl p-2.5 backdrop-blur-md border border-white/10 focus-within:bg-white/20 focus-within:border-white/30 transition-colors">
                    <label className="block text-[10px] font-bold text-blue-200 uppercase tracking-widest px-2 pt-1">Tasa Nominal (TNA)</label>
                    <div className="flex items-center px-2 pb-1">
                        <input type="number" step="0.01" value={tna} onChange={e => setTna(e.target.value)} onFocus={e => e.target.select()} className="w-full bg-transparent border-none text-white font-bold focus:ring-0 placeholder-blue-300/50 outline-none" placeholder="0.00"/>
                        <span className="text-blue-300 font-bold">%</span>
                    </div>
                </div>
            </div>
            
            <div className="mt-auto bg-black/20 rounded-2xl p-6 backdrop-blur-sm border border-white/5 flex flex-col sm:flex-row justify-between items-center z-10 relative">
                <div className="mb-4 sm:mb-0 text-center sm:text-left">
                    <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">Rendimiento (Ganancia)</p>
                    <p className="text-2xl font-bold text-green-400">{formatCurrency(result.interest)}</p>
                </div>
                <div className="text-center sm:text-right">
                    <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest mb-1">Monto Final</p>
                    <p className="text-4xl font-black text-white">{formatCurrency(result.total)}</p>
                </div>
            </div>
        </div>
    );
};

export default FixedDepositCalculator;
