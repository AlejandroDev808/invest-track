/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logout } from './lib/firebase';
import Dashboard from './components/Dashboard';
import AssetDetail from './components/AssetDetail';
import { LogIn, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-blue-600"
        >
          <Wallet size={48} />
        </motion.div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <AnimatePresence mode="wait">
          {!user ? (
            <motion.div
              key="login"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-screen p-4"
            >
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center space-y-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Wallet size={32} />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight">InvesTrack Pro</h1>
                  <p className="text-slate-500 text-sm">
                    La herramienta intuitiva para gestionar tus inversiones con precisión.
                  </p>
                </div>
                <button
                  onClick={loginWithGoogle}
                  className="w-full flex items-center justify-center gap-3 bg-slate-900 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-800 transition-colors"
                  id="login-button"
                >
                  <LogIn size={20} />
                  Entrar con Google
                </button>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
                  By Alejandro Béjar el pisto
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full"
            >
              <nav className="bg-white border-b border-slate-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-2">
                   <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                      <Wallet size={18} />
                   </div>
                   <span className="font-bold text-lg tracking-tight">InvesTrack</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-medium text-slate-500">Bienvenido,</p>
                    <p className="text-sm font-bold">{user.displayName}</p>
                  </div>
                  <button
                    onClick={logout}
                    className="text-sm font-medium text-slate-500 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center px-3"
                    id="logout-button"
                  >
                    Salir
                  </button>
                </div>
              </nav>
              <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/asset/:symbol" element={<AssetDetail user={user} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </BrowserRouter>
  );
}
