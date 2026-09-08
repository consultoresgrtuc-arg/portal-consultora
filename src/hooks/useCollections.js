import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useClientSelection } from '../context/ClientSelectionContext';

export const useCollection = (collectionName, filters, overrideUserId = null) => {
    const { user } = useAuth();
    let clientSelection = null;
    try {
        clientSelection = useClientSelection();
    } catch (e) {
        // Fallback si se usa fuera del provider
    }
    const effectiveUserId = overrideUserId || clientSelection?.targetUserId || user?.uid;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveUserId || !filters?.year || !filters?.month) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);

        const constraints = [
            where("year", "==", filters.year),
            where("month", "==", filters.month),
            orderBy("fechaEmision", "desc")
        ];
        
        const q = query(collection(db, 'users', effectiveUserId, collectionName), ...constraints);
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${collectionName} for ${effectiveUserId}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [effectiveUserId, collectionName, filters?.year, filters?.month]);

    return { data, loading };
};

export const useYearlyCollection = (collectionName, year, overrideUserId = null) => {
    const { user } = useAuth();
    let clientSelection = null;
    try {
        clientSelection = useClientSelection();
    } catch (e) {
        // Fallback
    }
    const effectiveUserId = overrideUserId || clientSelection?.targetUserId || user?.uid;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveUserId || !year) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);

        const q = query(collection(db, 'users', effectiveUserId, collectionName), where("year", "==", year), orderBy("fechaEmision", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching yearly ${collectionName} for ${effectiveUserId}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [effectiveUserId, collectionName, year]);

    return { data, loading };
};

export const useSimpleCollection = (collectionName, overrideUserId = null) => {
    const { user } = useAuth();
    let clientSelection = null;
    try {
        clientSelection = useClientSelection();
    } catch (e) {
        // Fallback
    }
    const effectiveUserId = overrideUserId || clientSelection?.targetUserId || user?.uid;
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveUserId) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const q = query(collection(db, 'users', effectiveUserId, collectionName), orderBy("fechaEmision", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching simple ${collectionName} for ${effectiveUserId}:`, error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [effectiveUserId, collectionName]);
    return { data, loading };
};
