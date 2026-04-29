import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, setDoc, collection, query, orderBy, limit } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState([]);
    const [loadingNotifications, setLoadingNotifications] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                setUser(firebaseUser);
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
            }
        });
        return () => unsubscribe();
    }, []);

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

    const value = { user, userData, loading, notifications, loadingNotifications };
    
    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
