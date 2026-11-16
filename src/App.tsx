import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { doc, getDoc } from 'firebase/firestore';
import Intro from '@/components/Intro';
import Landing from '@/components/Landing';
import AuthScreen from '@/components/AuthScreen';
import Dashboard from '@/components/Dashboard';
import AppointmentHub from '@/components/AppointmentHub';
import DocumentScanner from '@/components/DocumentScanner';
import MedicationManagement from '@/components/MedicationManagement';
import MedicationAlarm from '@/components/MedicationAlarm';
import Onboarding from '@/components/Onboarding';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';

const INTRO_REVEAL_AT = 2700;

type OnboardingStatus = 'loading' | 'incomplete' | 'complete' | 'error';

function AuthLoadingScreen({ error = false, onRetry }: { error?: boolean; onRetry?: () => void }) {
  if (error) {
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#fbf5f0] px-6 text-center">
        <p className="text-sm text-[#6b655d]">
          We couldn't check your onboarding status. Check your connection and try again.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-[#c97b76] px-5 py-2.5 text-sm font-medium text-white"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

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
  const [checkVersion, setCheckVersion] = useState(0);
  const [onboardingCheck, setOnboardingCheck] = useState<{
    uid: string | null;
    pathname: string;
    status: OnboardingStatus;
  }>({ uid: null, pathname: '', status: 'loading' });
  const isHome = location.pathname === '/';
  const [showLanding, setShowLanding] = useState(false);
  const [showIntro, setShowIntro] = useState(isHome);

  useEffect(() => {
    let active = true;

    if (!user) {
      setOnboardingCheck({ uid: null, pathname: location.pathname, status: 'incomplete' });
      return () => {
        active = false;
      };
    }

    setOnboardingCheck({ uid: user.uid, pathname: location.pathname, status: 'loading' });
    void getDoc(doc(db, 'users', user.uid))
      .then((userDocument) => {
        if (!active) return;
        setOnboardingCheck({
          uid: user.uid,
          pathname: location.pathname,
          status: userDocument.data()?.hasCompletedOnboarding === true ? 'complete' : 'incomplete',
        });
      })
      .catch((error: unknown) => {
        console.error('Unable to check onboarding status:', error);
        if (active) {
          setOnboardingCheck({ uid: user.uid, pathname: location.pathname, status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [user, location.pathname, checkVersion]);

  const checkMatchesCurrentRoute =
    onboardingCheck.uid === (user?.uid ?? null) && onboardingCheck.pathname === location.pathname;
  const onboardingStatus = user
    ? checkMatchesCurrentRoute ? onboardingCheck.status : 'loading'
    : 'incomplete';
  const hasCompletedOnboarding = onboardingStatus === 'complete';
  const retryOnboardingCheck = () => setCheckVersion((version) => version + 1);
  const authScreen = loading || onboardingStatus === 'loading'
    ? <AuthLoadingScreen />
    : onboardingStatus === 'error'
      ? <AuthLoadingScreen error onRetry={retryOnboardingCheck} />
      : user
        ? <Navigate to={hasCompletedOnboarding ? '/dashboard' : '/onboarding'} replace />
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

  if (loading || (user && onboardingStatus === 'loading')) {
    return <AuthLoadingScreen />;
  }

  if (user && onboardingStatus === 'error') {
    return <AuthLoadingScreen error onRetry={retryOnboardingCheck} />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <AuthLoadingScreen />
          ) : user ? (
            <Navigate to={hasCompletedOnboarding ? '/dashboard' : '/onboarding'} replace />
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
          <ProtectedRoute hasCompletedOnboarding={hasCompletedOnboarding}>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute hasCompletedOnboarding={hasCompletedOnboarding}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/scanner"
        element={
          <ProtectedRoute hasCompletedOnboarding={hasCompletedOnboarding}>
            <DocumentScanner />
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute hasCompletedOnboarding={hasCompletedOnboarding}>
            <AppointmentHub />
          </ProtectedRoute>
        }
      />
      <Route
        path="/medications"
        element={
          <ProtectedRoute hasCompletedOnboarding={hasCompletedOnboarding}>
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
