import React from 'react';
import Icon from './Icon';

const DateFilter = ({ date: dateProp, setDate: setDateProp, selectedDate, onDateChange }) => {
    const date = dateProp || selectedDate || new Date();
    const setDate = setDateProp || onDateChange || (() => {});
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
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 px-4 py-3 sm:p-4 bg-white/80 backdrop-blur-md rounded-2xl sm:rounded-[28px] border border-gray-100 shadow-sm w-full sm:w-auto">
            <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Icon name="Calendar" size={18} />
                </div>
                <h3 className="text-xs sm:text-sm font-black text-gray-800 uppercase tracking-widest">Período</h3>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 sm:min-w-[240px]">
                <select 
                    value={date.getMonth()} 
                    onChange={handleMonthChange}
                    className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-xl sm:rounded-2xl outline-none font-bold text-xs sm:text-sm text-gray-800 cursor-pointer appearance-none transition-all"
                >
                    {months.map((month, i) => (
                        <option key={month} value={i}>{month}</option>
                    ))}
                </select>

                <select 
                    value={date.getFullYear()} 
                    onChange={handleYearChange}
                    className="w-24 sm:w-28 px-3 sm:px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-100 rounded-xl sm:rounded-2xl outline-none font-bold text-xs sm:text-sm text-gray-800 cursor-pointer appearance-none transition-all text-center"
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
