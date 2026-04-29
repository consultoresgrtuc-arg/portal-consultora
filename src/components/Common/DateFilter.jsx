import React from 'react';
import Icon from './Icon';

const DateFilter = ({ date, setDate }) => {
    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
    const months = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];

    const handleYearChange = (e) => {
        const newYear = parseInt(e.target.value);
        const newDate = new Date(date);
        newDate.setFullYear(newYear);
        setDate(newDate);
    };

    const handleMonthChange = (e) => {
        const newMonth = parseInt(e.target.value);
        const newDate = new Date(date);
        newDate.setMonth(newMonth);
        setDate(newDate);
    };

    return (
        <div className="flex flex-wrap items-center gap-6 p-6 bg-white/80 backdrop-blur-md rounded-[32px] border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Icon name="Calendar" size={20} />
                </div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Consultar Período</h3>
            </div>
            
            <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                <select 
                    value={date.getMonth()} 
                    onChange={handleMonthChange}
                    className="flex-1 px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl outline-none font-bold text-gray-800 cursor-pointer appearance-none transition-all"
                >
                    {months.map((month, i) => (
                        <option key={month} value={i}>{month}</option>
                    ))}
                </select>

                <select 
                    value={date.getFullYear()} 
                    onChange={handleYearChange}
                    className="w-32 px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-2xl outline-none font-bold text-gray-800 cursor-pointer appearance-none transition-all text-center"
                >
                    {years.map(year => (
                        <option key={year} value={year}>{year}</option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default DateFilter;
