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

export const useCollection = (collectionName, filters) => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !filters?.year || !filters?.month) {
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
        
        const q = query(collection(db, 'users', user.uid, collectionName), ...constraints);
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching ${collectionName}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, collectionName, filters?.year, filters?.month]);

    return { data, loading };
};

export const useYearlyCollection = (collectionName, year) => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !year) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);

        const q = query(collection(db, 'users', user.uid, collectionName), where("year", "==", year), orderBy("fechaEmision", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching yearly ${collectionName}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, collectionName, year]);

    return { data, loading };
};

export const useSimpleCollection = (collectionName) => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setData([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const q = query(collection(db, 'users', user.uid, collectionName), orderBy("fechaEmision", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setData(items);
            setLoading(false);
        }, (error) => {
            console.error(`Error fetching simple ${collectionName}:`, error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, collectionName]);
    return { data, loading };
};
