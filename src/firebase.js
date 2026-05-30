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
    // Si estamos en localhost, habilitamos el token de depuración para no ser bloqueados por reCAPTCHA
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    
    // Inicializar App Check con reCAPTCHA v3
    // Nota: Reemplazar con tu clave de sitio (site key) de reCAPTCHA v3 si se cuenta con una específica
    appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(
            import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY || "6Lc3-qgqAAAAAK3X8g4n-O84qQe3x0k4uF9V3a7w"
        ),
        isTokenAutoRefreshEnabled: true
    });
}

// Conectar a emuladores si estamos en localhost
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log("Conectando a Firebase Emulators...");
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export { app, auth, db, storage, functions, googleProvider, appCheck };

