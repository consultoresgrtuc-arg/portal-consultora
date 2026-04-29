import React, { useState, useEffect } from 'react';
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

const DeudoresPage = ({ navigate }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saldosData, setSaldosData] = useState({ clientes: [], totalCobra: 0 });

    useEffect(() => {
        if (!user) return;

        const fetchSaldosClientes = async () => {
            setLoading(true);
            setError('');
            try {
                const qTerceros = query(
                    collection(db, 'users', user.uid, 'terceros'),
                    where("tipo", "in", ["Cliente", "Ambos"]),
                    orderBy("nombre", "asc")
                );
                const qFacturas = collection(db, 'users', user.uid, 'facturasVenta');
                const qPagos = collection(db, 'users', user.uid, 'pagosRecibidos');

                const [tercerosSnap, facturasSnap, pagosSnap] = await Promise.all([
                    getDocs(qTerceros),
                    getDocs(qFacturas),
                    getDocs(qPagos)
                ]);

                const terceros = tercerosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const facturas = facturasSnap.docs.map(d => d.data());
                const pagos = pagosSnap.docs.map(d => d.data());

                const saldosPorCliente = {};
                facturas.forEach(f => {
                    saldosPorCliente[f.terceroId] = (saldosPorCliente[f.terceroId] || 0) + f.montoTotal;
                });
                pagos.forEach(p => {
                    saldosPorCliente[p.terceroId] = (saldosPorCliente[p.terceroId] || 0) - p.montoPagado;
                });

                const clientes = terceros
                    .map(t => ({
                        ...t,
                        saldo: saldosPorCliente[t.id] || 0
                    }))
                    .sort((a, b) => b.saldo - a.saldo);

                const totalCobra = clientes.reduce((sum, p) => sum + p.saldo, 0);
                setSaldosData({ clientes, totalCobra });

            } catch (err) {
                console.error("Error al calcular saldos de clientes:", err);
                setError('Error al calcular los saldos de los clientes.');
            } finally {
                setLoading(false);
            }
        };

        fetchSaldosClientes();
    }, [user]);

    const formatCurrency = (value) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);

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
                        <h2 className="text-3xl font-extrabold text-gray-800 tracking-tight">Deudores (Clientes)</h2>
                        <p className="text-gray-500 font-medium italic">Control de Cuentas por Cobrar</p>
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
                <div className="absolute -right-4 -top-4 text-red-50/50 group-hover:scale-110 transition-transform">
                    <Icon name="ArrowDownRight" size={120} />
                </div>
                <div className="bg-red-100 p-4 rounded-2xl text-red-600 relative z-10">
                    <Icon name="TrendingDown" size={32} />
                </div>
                <div className="relative z-10">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total a Cobrar</p>
                    <h3 className="text-3xl font-black text-red-600 tracking-tight">{formatCurrency(saldosData.totalCobra)}</h3>
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-50">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Cliente</th>
                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">CUIT</th>
                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Saldo Deudor</th>
                                <th className="px-8 py-5 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">Detalle</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-50">
                            {loading ? (
                                <tr><td colSpan="4" className="text-center py-24 text-gray-400 font-bold animate-pulse">Calculando deudas...</td></tr>
                            ) : saldosData.clientes.length > 0 ? saldosData.clientes.map(cliente => (
                                <tr key={cliente.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="text-sm font-black text-gray-900">{cliente.nombre}</div>
                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">{cliente.email || 'Sin email'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-xs font-mono font-bold text-gray-600">{cliente.cuit || 'S/D'}</div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className={`text-lg font-black tracking-tight ${cliente.saldo > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {formatCurrency(cliente.saldo)}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <button 
                                            onClick={() => navigate(`gestion/deudores/${cliente.id}`)} 
                                            className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                        >
                                            Ver Cta. Cte.
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="4" className="text-center py-24 text-gray-400 font-bold italic">
                                        No hay deudores registrados.
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

export default DeudoresPage;
