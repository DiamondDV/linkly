import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Link2 } from 'lucide-react';
import Navbar from './components/Navbar';
import Shortener from './components/Shortener';
import Dashboard from './components/Dashboard';
import Auth from './components/Auth';
import { User } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok) setUser(data.user);
    } catch (err) {
      console.error('Auth check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <Navbar user={user} onLogout={handleLogout} />
        
        <main>
          <Routes>
            <Route path="/" element={<Shortener user={user} />} />
            <Route path="/login" element={<Auth type="login" onAuth={setUser} />} />
            <Route path="/signup" element={<Auth type="signup" onAuth={setUser} />} />
            <Route 
              path="/dashboard" 
              element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} 
            />
          </Routes>
        </main>

        <footer className="py-12 border-t border-slate-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="bg-indigo-600 p-1.5 rounded-lg">
                <Link2 className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg text-slate-900">Linkly</span>
            </div>
            <p className="text-slate-500 text-sm">© 2026 Linkly. Built for speed and simplicity.</p>
          </div>
        </footer>
      </div>
    </Router>
  );
}
