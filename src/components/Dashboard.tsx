import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebase';
import { useAuth } from '@/context/AuthContext';
import {
  Activity,
  Apple,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Moon,
  Pill,
  ScanLine,
  Utensils,
} from 'lucide-react';
import LogoBadge from '@/components/LogoBadge';

const features = [
  {
    title: 'Fatigue, Symptom and Mood Tracking',
    icon: Activity,
  },
  {
    title: 'Sleep Tracking',
    icon: Moon,
  },
  {
    title: 'Nutrition Tracking',
    icon: Apple,
  },
  {
    title: 'Personalized Meal Plans',
    icon: Utensils,
  },
  {
    title: 'Medication Management',
    icon: Pill,
  },
  {
    title: 'Appointment Management',
    icon: CalendarDays,
  },
  {
    title: 'Health Dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Health and Educational Information',
    icon: BookOpen,
  },
  {
    title: 'AI Document Scanner',
    icon: ScanLine,
  },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const featureDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = featureDialogRef.current;
    if (!dialog) return;

    if (selectedFeature && !dialog.open) {
      dialog.showModal();
    } else if (!selectedFeature && dialog.open) {
      dialog.close();
    }
  }, [selectedFeature]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch {
      setSigningOut(false);
    }
    navigate('/');
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#fbf5f0]">
      {/* Decorative blobs */}
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#f7e8e0] opacity-60 blur-3xl pp-float" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <LogoBadge className="h-12" />

        <button
          onClick={handleLogout}
          disabled={signingOut}
          className="flex items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#4a4540] backdrop-blur transition-all duration-300 hover:border-[#c97b76] hover:text-[#c97b76] active:scale-[0.98] disabled:opacity-60"
        >
          {signingOut ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#c97b76]/30 border-t-[#c97b76]" />
          ) : (
            <LogOut className="h-4 w-4" strokeWidth={1.6} />
          )}
          Log Out
        </button>
      </header>

      <main className="relative z-10 w-full flex-1 px-6 pb-16 pt-8 sm:px-12 sm:pt-12">
        <div className="mx-auto max-w-6xl">
          <section className="text-center">
            <span
              className="inline-flex items-center rounded-full border border-[#e8a5a0]/40 bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-[#c97b76] backdrop-blur pp-reveal"
              style={{ ['--pp-delay' as string]: '0ms' }}
            >
              Your care space
            </span>

            <h1
              className="font-display mx-auto mt-5 max-w-2xl text-3xl font-medium leading-[1.2] tracking-tight text-[#4a4540] pp-reveal sm:text-5xl"
              style={{ ['--pp-delay' as string]: '150ms' }}
            >
              Welcome back to your
              <br />
              <span className="text-[#c97b76]">care space, Mama.</span>
            </h1>

            <p
              className="mx-auto mt-4 max-w-md text-base font-light leading-relaxed text-[#6b655d] pp-reveal"
              style={{ ['--pp-delay' as string]: '300ms' }}
            >
              {user?.email ? `Signed in as ${user.email}` : "You're all set. Your personalized dashboard is coming soon."}
            </p>
          </section>

          <section aria-label="Care space features" className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-12 lg:grid-cols-3">
            {features.map(({ title, icon: Icon }, index) => (
              <button
                type="button"
                key={title}
                onClick={() => setSelectedFeature(title)}
                className="flex min-h-40 flex-col items-center justify-center gap-5 rounded-2xl border border-[#e9ded5] bg-white/75 p-6 text-center shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#e8a5a0]/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf5f0] pp-reveal"
                style={{ ['--pp-delay' as string]: `${350 + index * 75}ms` }}
              >
                <span className="inline-flex rounded-xl bg-[#f7e8e0] p-3 text-[#c97b76]">
                  <Icon className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <span className="font-display text-lg font-medium leading-snug tracking-tight text-[#4a4540]">{title}</span>
              </button>
            ))}
          </section>
        </div>
      </main>

      <dialog
        ref={featureDialogRef}
        aria-labelledby="feature-dialog-title"
        onClose={() => setSelectedFeature(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) featureDialogRef.current?.close();
        }}
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-[#e9ded5] bg-[#fbf5f0] p-0 text-[#4a4540] shadow-xl backdrop:bg-[#4a4540]/30 backdrop:backdrop-blur-sm"
      >
        {selectedFeature && (
          <div className="p-7 text-center">
            <h2 id="feature-dialog-title" className="font-display text-xl font-medium tracking-tight">
              {selectedFeature}
            </h2>
            <p className="mt-3 text-sm font-light leading-relaxed text-[#6b655d]">
              This feature is not available just yet. Please check back soon.
            </p>
            <button
              type="button"
              onClick={() => featureDialogRef.current?.close()}
              className="mt-6 rounded-full bg-[#c97b76] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
            >
              Close
            </button>
          </div>
        )}
      </dialog>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#e9ded5] bg-white/40 px-6 py-6 text-center text-xs font-light text-[#8a8278] backdrop-blur sm:px-12">
        <p>Made with care for every mother.</p>
      </footer>
    </div>
  );
}
