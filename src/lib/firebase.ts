import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
// Utilizamos tu propia configuración de Firebase (investrack-8214e)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyANiCuo5LsxkOoisowqE-gRWR3uqZ5HpBg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "investrack-8214e.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "investrack-8214e",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "investrack-8214e.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "902375864319",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:902375864319:web:3e1910c2ef444300f6d9ca",
  measurementId: "G-B2ZKLFCVWB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  } catch (error: any) {
    console.error("Login failed", error);
    alert(`Error al iniciar sesión: ${error.message}\n\nNota: Si estás en Vercel o Render, asegúrate de añadir el dominio de tu app en la consola de Firebase: Authentication -> Settings -> Authorized domains.`);
    throw error;
  }
};

export const logout = () => auth.signOut();

async function testConnection() {
  try {
    // Attempt to fetch a non-existent doc just to check connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}

testConnection();
