import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export default function ProtectedRoute({
  children,
  hasCompletedOnboarding,
}: {
  children: ReactNode;
  hasCompletedOnboarding: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf5f0]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#e8a5a0] border-t-[#c97b76]" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (hasCompletedOnboarding && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  if (!hasCompletedOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
