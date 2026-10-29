import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

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
const storage = getStorage(app);
const functions = getFunctions(app);
const googleProvider = new GoogleAuthProvider();

// Configurar App Check
let appCheck;
if (typeof window !== "undefined") {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // Solo en entorno de desarrollo local habilitamos el token de depuración de App Check
    if (import.meta.env.DEV && isLocalhost) {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    
    // Inicializar App Check con reCAPTCHA v3
    appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(
            import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || "6LfC6wQsAAAAAOHfrlMZPGaVHx057A0xGCrnc4C8"
        ),
        isTokenAutoRefreshEnabled: true
    });
}

// Conectar a emuladores únicamente en modo desarrollo local (nunca en builds de producción)
if (
    import.meta.env.DEV &&
    import.meta.env.VITE_USE_EMULATOR === 'true' &&
    typeof window !== "undefined" &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
) {
    console.log("Conectando a Firebase Emulators...");
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export { app, auth, db, storage, functions, googleProvider, appCheck };

