import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import Intro from '@/components/Intro';
import Landing from '@/components/Landing';
import AuthScreen from '@/components/AuthScreen';
import Dashboard from '@/components/Dashboard';
import DocumentScanner from '@/components/DocumentScanner';
import MedicationManagement from '@/components/MedicationManagement';
import MedicationAlarm from '@/components/MedicationAlarm';
import Onboarding from '@/components/Onboarding';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider, useAuth } from '@/context/AuthContext';

const INTRO_REVEAL_AT = 2700;

function AuthLoadingScreen() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center bg-[#fbf5f0]">
      <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#e8a5a0] border-t-[#c97b76]" />
      <span className="sr-only">Checking your session...</span>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isHome = location.pathname === '/';
  const [showLanding, setShowLanding] = useState(false);
  const [showIntro, setShowIntro] = useState(isHome);
  const authScreen = loading
    ? <AuthLoadingScreen />
    : user
      ? <Navigate to="/dashboard" replace />
      : <AuthScreen />;

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
          loading ? (
            <AuthLoadingScreen />
          ) : user ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <>
              {showLanding && <Landing />}
              {showIntro && <Intro onFinish={() => setShowIntro(false)} />}
            </>
          )
        }
      />
      <Route path="/auth" element={authScreen} />
      <Route path="/login" element={authScreen} />
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
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    const requestAlarmPermissions = async () => {
      try {
        await LocalNotifications.requestPermissions();
        const exactAlarmSetting = await LocalNotifications.checkExactNotificationSetting();
        if (exactAlarmSetting.exact_alarm !== 'granted') {
          await LocalNotifications.changeExactNotificationSetting();
        }
        await LocalNotifications.createChannel({
          id: 'med-alarms-v2',
          name: 'Medication Alarms Loud',
          description: 'Loud medication reminder alarms',
          importance: 5,
          visibility: 1,
          sound: 'alarm.mp3',
          vibration: true,
          lights: true,
        });
      } catch (permissionError) {
        console.error('Unable to initialize Android medication alarm permissions:', permissionError);
      }
    };

    void requestAlarmPermissions();
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <MedicationAlarm />
      </BrowserRouter>
    </AuthProvider>
  );
}
