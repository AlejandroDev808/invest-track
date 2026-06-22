import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { Capacitor, registerPlugin } from '@capacitor/core';

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

for (const key of requiredEnvVars) {
  if (!import.meta.env[key]) {
    throw new Error(
      `[Firebase] Variable de entorno obligatoria no definida: ${key}. ` +
      `Añádela en tu archivo .env o en las variables de entorno de Render.`
    );
  }
}

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const GoogleAuth = registerPlugin<{ signIn(): Promise<{ idToken: string }> }>('GoogleAuth');
      const { idToken } = await GoogleAuth.signIn();
      const credential = GoogleAuthProvider.credential(idToken);
      return await signInWithCredential(auth, credential);
    } catch (error: any) {
      console.error("Native Google login failed", error);
      if (error?.code === 'CANCELLED') return null;
      alert(`Error al iniciar sesión nativa: ${error.message}`);
      return null;
    }
  }
  try {
    return await signInWithPopup(auth, googleProvider);
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
