import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import Icon from '../Common/Icon';

const ProveedoresPage = ({ navigate }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saldosData, setSaldosData] = useState({ proveedores: [], totalPagar: 0 });
    const [searchTerm, setSearchTerm] = useState('');
    const [soloConSaldo, setSoloConSaldo] = useState(false);

    useEffect(() => {
        if (!user) return;

        const fetchSaldosProveedores = async () => {
            setLoading(true);
            setError('');
            try {
                const qTerceros = query(
                    collection(db, 'users', user.uid, 'terceros'),
                    where("tipo", "in", ["Proveedor", "Ambos"]),
                    orderBy("nombre", "asc")
                );
                const qFacturas = collection(db, 'users', user.uid, 'facturasCompra'); 
                const qPagos = collection(db, 'users', user.uid, 'pagosRealizados');

                const [tercerosSnap, facturasSnap, pagosSnap] = await Promise.all([
                    getDocs(qTerceros),
                    getDocs(qFacturas),
                    getDocs(qPagos)
                ]);

                const terceros = tercerosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const facturas = facturasSnap.docs.map(d => d.data());
                const pagos = pagosSnap.docs.map(d => d.data());

                const saldosPorProveedor = {};
                facturas.forEach(f => {
                    saldosPorProveedor[f.terceroId] = (saldosPorProveedor[f.terceroId] || 0) + f.montoTotal;
                });
                pagos.forEach(p => {
                    saldosPorProveedor[p.terceroId] = (saldosPorProveedor[p.terceroId] || 0) - p.montoPagado;
                });

                const proveedores = terceros
                    .map(t => ({
                        ...t,
                        saldo: saldosPorProveedor[t.id] || 0
                    }))
                    .sort((a, b) => b.saldo - a.saldo);

                const totalPagar = proveedores.reduce((sum, p) => sum + (p.saldo > 0 ? p.saldo : 0), 0);
                setSaldosData({ proveedores, totalPagar });

            } catch (err) {
                console.error("Error al calcular saldos de proveedores:", err);
                setError('Error al calcular los saldos de los proveedores.');
            } finally {
                setLoading(false);
            }
        };

        fetchSaldosProveedores();
    }, [user]);

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

    const proveedoresFiltrados = useMemo(() => {
        return saldosData.proveedores.filter(p => {
            if (soloConSaldo && p.saldo <= 0) return false;
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return (
                (p.nombre && p.nombre.toLowerCase().includes(term)) ||
                (p.cuit && p.cuit.includes(term)) ||
                (p.email && p.email.toLowerCase().includes(term))
            );
        });
    }, [saldosData.proveedores, searchTerm, soloConSaldo]);

    return (
        <div className="p-6 space-y-8 animate-fade-in">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('gestion')} 
                        className="p-3 rounded-2xl bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-gray-900 transition-all hover:shadow-md"
                    >
                        <Icon name="ArrowLeft" size={20}/>
                    </button>
                    <div>
                        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Cuentas por Pagar</h2>
                        <p className="text-gray-500 font-medium italic">Gestión de Proveedores</p>
                    </div>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-600 font-bold text-sm">
                    <Icon name="AlertTriangle" size={20}/>
                    {error}
                </div>
            )}

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 flex items-center gap-6 group overflow-hidden relative">
                <div className="absolute -right-4 -top-4 text-orange-50/50 group-hover:scale-110 transition-transform">
                    <Icon name="ArrowUpRight" size={120} />
                </div>
                <div className="bg-orange-100 p-4 rounded-2xl text-orange-600 relative z-10">
                    <Icon name="TrendingUp" size={32} />
                </div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total a Pagar</p>
                    <h3 className="text-3xl font-black text-orange-600 tracking-tight">{formatCurrency(saldosData.totalPagar)}</h3>
                </div>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                <label className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl border border-gray-100 shadow-sm cursor-pointer select-none">
                    <input 
                        type="checkbox" 
                        checked={soloConSaldo} 
                        onChange={(e) => setSoloConSaldo(e.target.checked)}
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-gray-700">Solo proveedores con saldo pendiente</span>
                </label>

                <div className="relative min-w-[300px]">
                    <Icon name="Search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input 
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar proveedor o CUIT..."
                        className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-100 rounded-2xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-orange-100 outline-none shadow-sm"
                    />
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Proveedor</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">CUIT</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Acreedor</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Detalle</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-24 text-gray-400 font-bold animate-pulse">Analizando facturas de compra...</td></tr>
                            ) : proveedoresFiltrados.length > 0 ? proveedoresFiltrados.map(proveedor => (
                                <tr key={proveedor.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-black text-gray-900">{proveedor.nombre}</div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">{proveedor.email || 'Sin email'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-xs font-mono font-bold text-gray-600">{proveedor.cuit || 'S/D'}</div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className={`text-lg font-black tracking-tight ${proveedor.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(proveedor.saldo)}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <button 
                                            onClick={() => navigate(`gestion/proveedores/${proveedor.id}`)} 
                                            className="px-4 py-2 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600 hover:text-white transition-all shadow-sm"
                                        >
                                            Ver Cta. Cte.
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="4" className="text-center py-24 text-gray-400 font-bold italic">
                                        No se encontraron proveedores con los filtros aplicados.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProveedoresPage;
