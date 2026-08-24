import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAK3yU78pfmNFAVBojOC7takuDg2NS3i6M",
    authDomain: "gyrconsultores-82422.firebaseapp.com",
    projectId: "gyrconsultores-82422",
    storageBucket: "gyrconsultores-82422.firebasestorage.app",
    messagingSenderId: "963315189373",
    appId: "1:963315189373:web:b5f02184412b2e78275314"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function createOrUpdateUser(email, password, name) {
    let user;
    try {
        console.log(`Intentando crear usuario ${email}...`);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        user = userCredential.user;
        console.log(`Usuario creado exitosamente con UID: ${user.uid}`);
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            console.log(`El usuario ya existe, iniciando sesión para actualizar perfil...`);
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            user = userCredential.user;
            console.log(`Sesión iniciada con UID: ${user.uid}`);
        } else {
            console.error(`Error de autenticación:`, error);
            throw error;
        }
    }

    const userProfile = {
        email: email,
        nombre: name,
        isAdmin: true,
        servicioFacturacion: true,
        permisos: {
            dashboard: true,
            operaciones: true,
            gestion: true,
            finanzas: true,
            reportes: true,
            cliente: true,
            perfil: true,
            microcreditos: true,
            facturacion: true
        },
        cuit: '20-12345678-9',
        telefono: '3815551234'
    };

    await setDoc(doc(db, "users", user.uid), userProfile, { merge: true });
    console.log(`Perfil de Firestore actualizado con permisos completos de administrador para ${email}`);
}

async function main() {
    try {
        await createOrUpdateUser("admin@test.com", "password123", "Admin Test");
        console.log("¡Proceso completado con éxito!");
        process.exit(0);
    } catch (err) {
        console.error("Error fatal:", err);
        process.exit(1);
    }
}

main();
