import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Intro from '@/components/Intro';
import Landing from '@/components/Landing';
import AuthScreen from '@/components/AuthScreen';
import Dashboard from '@/components/Dashboard';
import DocumentScanner from '@/components/DocumentScanner';
import MedicationManagement from '@/components/MedicationManagement';
import Onboarding from '@/components/Onboarding';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';

const INTRO_REVEAL_AT = 2700;

function AppRoutes() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const [showLanding, setShowLanding] = useState(false);
  const [showIntro, setShowIntro] = useState(isHome);

  useEffect(() => {
    if (!isHome) {
      setShowIntro(false);
      return;
    }
    const t = setTimeout(() => setShowLanding(true), INTRO_REVEAL_AT);
    return () => clearTimeout(t);
  }, [isHome]);

  useEffect(() => {
    document.body.style.overflow = isHome && showIntro ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isHome, showIntro]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            {showLanding && <Landing />}
            {showIntro && <Intro onFinish={() => setShowIntro(false)} />}
          </>
        }
      />
      <Route path="/auth" element={<AuthScreen />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scanner"
        element={
          <ProtectedRoute>
            <DocumentScanner />
          </ProtectedRoute>
        }
      />
      <Route
        path="/medications"
        element={
          <ProtectedRoute>
            <MedicationManagement />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
