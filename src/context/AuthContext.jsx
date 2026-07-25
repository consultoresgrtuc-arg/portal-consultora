import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, query, orderBy, limit } from 'firebase/firestore';

const AuthContext = createContext();

// 4 horas en milisegundos (4 * 60 * 60 * 1000)
const SESSION_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
// Umbral de advertencia: 5 minutos (5 * 60 * 1000)
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
const SESSION_KEY = 'gyr_session_start';

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(true);

    // Estados para el control de la sesión de 4 horas
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0);

    const logoutNow = useCallback((isExpired = false) => {
        localStorage.removeItem(SESSION_KEY);
        if (isExpired) {
            sessionStorage.setItem('gyr_session_expired_msg', 'Tu sesión ha finalizado automáticamente tras 4 horas por motivos de seguridad.');
        }
        setShowSessionWarning(false);
        setSessionSecondsLeft(0);
        signOut(auth);
    }, []);

    const extendSession = useCallback(() => {
        localStorage.setItem(SESSION_KEY, Date.now().toString());
        setShowSessionWarning(false);
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);

                // Inicializar timestamp de inicio de sesión si no existe
                let sessionStart = localStorage.getItem(SESSION_KEY);
                if (!sessionStart) {
                    sessionStart = Date.now().toString();
                    localStorage.setItem(SESSION_KEY, sessionStart);
                }

                const userDocRef = doc(db, "users", firebaseUser.uid);
                const unsubProfile = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setUserData(docSnap.data());
                    } else {
                        const newUserProfile = {
                            email: firebaseUser.email,
                            nombre: firebaseUser.displayName || '',
                            cuit: '',
                            actividad: '',
                            categoriaTributaria: 'Monotributo',
                            telefono: firebaseUser.phoneNumber || '',
                            isAdmin: false,
                            permisos: {
                                dashboard: true,
                                operaciones: true,
                                gestion: true,
                                finanzas: true,
                                reportes: true,
                                cliente: true,
                                perfil: true,
                                microcreditos: false
                            },
                            incomeGoal: 500000,
                            expenseBudget: 200000
                        };
                        setDoc(userDocRef, newUserProfile);
                        setUserData(newUserProfile);
                    }
                    setLoading(false);
                });
                return () => unsubProfile();
            } else {
                setUser(null);
                setUserData(null);
                setLoading(false);
                setNotifications([]);
                setLoadingNotifications(true);
                localStorage.removeItem(SESSION_KEY);
                setShowSessionWarning(false);
                setSessionSecondsLeft(0);
            }
        });
        return () => unsubscribe();
    }, []);

    // Temporizador para controlar el tiempo límite de 4 horas
    useEffect(() => {
        if (!user) return;

        const checkSession = () => {
            const sessionStartStr = localStorage.getItem(SESSION_KEY);
            if (!sessionStartStr) {
                localStorage.setItem(SESSION_KEY, Date.now().toString());
                return;
            }

            const startTime = parseInt(sessionStartStr, 10);
            const now = Date.now();
            const elapsed = now - startTime;
            const remaining = SESSION_MAX_DURATION_MS - elapsed;

            if (remaining <= 0) {
                logoutNow(true);
            } else if (remaining <= WARNING_THRESHOLD_MS) {
                setShowSessionWarning(true);
                setSessionSecondsLeft(Math.ceil(remaining / 1000));
            } else {
                setShowSessionWarning(false);
                setSessionSecondsLeft(Math.ceil(remaining / 1000));
            }
        };

        checkSession();
        const interval = setInterval(checkSession, 1000);
        return () => clearInterval(interval);
    }, [user, logoutNow]);

    useEffect(() => {
        if (user) {
            setLoadingNotifications(true);
            const q = query(
                collection(db, 'users', user.uid, 'notifications'),
                orderBy("timestamp", "desc"),
                limit(5)
            );
            
            const unsubscribeNotifs = onSnapshot(q, (snapshot) => {
                const docNotifs = snapshot.docs.map(docSnap => ({ 
                    id: docSnap.id, 
                    ...docSnap.data(),
                    timestamp: docSnap.data().timestamp?.toDate() || new Date()
                }));
                setNotifications(docNotifs);
                setLoadingNotifications(false);
            });

            return () => unsubscribeNotifs();
        }
    }, [user]);

    const value = { 
        user, 
        userData, 
        loading, 
        notifications, 
        loadingNotifications,
        showSessionWarning,
        sessionSecondsLeft,
        extendSession,
        logoutNow
    };
    
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

