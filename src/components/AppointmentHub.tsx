import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppointmentManagement from '@/components/AppointmentManagement';
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, Stethoscope } from 'lucide-react';
import LogoBadge from '@/components/LogoBadge';

export default function AppointmentHub() {
  const navigate = useNavigate();
  const [view, setView] = useState<'hub' | 'doctors' | 'appointments'>('hub');

  if (view === 'appointments') {
    return <AppointmentManagement onBack={() => setView('hub')} />;
  }

  const placeholder = {
    title: 'Find Nearby Doctors',
    description: 'Doctor search will be available in a future step.',
    icon: MapPin,
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#fbf5f0]">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 bottom-20 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <LogoBadge className="h-12" />
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#4a4540] backdrop-blur transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          Back to dashboard
        </button>
      </header>

      <main className="relative z-10 w-full flex-1 px-6 pb-16 pt-8 sm:px-12 sm:pt-12">
        <div className="mx-auto max-w-5xl">
          {view === 'hub' ? (
            <>
              <section className="text-center">
                <span className="inline-flex items-center rounded-full border border-[#e8a5a0]/40 bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-[#c97b76] backdrop-blur">
                  Your care space
                </span>
                <h1 className="font-display mx-auto mt-5 max-w-2xl text-3xl font-medium leading-tight tracking-tight text-[#4a4540] sm:text-5xl">
                  Appointment Search and Management
                </h1>
                <p className="mx-auto mt-4 max-w-xl text-base font-light leading-relaxed text-[#6b655d]">
                  Find care nearby or keep your doctor visits organized.
                </p>
              </section>

              <section
                aria-label="Appointment options"
                className="mt-10 grid gap-5 md:mt-12 md:grid-cols-2"
              >
                <button
                  type="button"
                  onClick={() => setView('doctors')}
                  className="group flex min-h-64 flex-col items-start rounded-3xl border border-[#e9ded5] bg-white/80 p-7 text-left shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#e8a5a0]/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf5f0] sm:p-9"
                >
                  <span className="mb-6 inline-flex rounded-2xl bg-[#f7e8e0] p-4 text-[#c97b76]">
                    <Stethoscope className="h-7 w-7" strokeWidth={1.7} />
                  </span>
                  <span className="font-display text-2xl font-medium tracking-tight text-[#4a4540]">
                    Find Nearby Doctors
                  </span>
                  <span className="mt-3 text-sm font-light leading-relaxed text-[#6b655d]">
                    Search for nearby gynecologists, pediatricians, and maternity clinics.
                  </span>
                  <ChevronRight className="mt-auto ml-auto h-5 w-5 text-[#c97b76] transition-transform group-hover:translate-x-1" />
                </button>

                <button
                  type="button"
                  onClick={() => setView('appointments')}
                  className="group flex min-h-64 flex-col items-start rounded-3xl border border-[#e9ded5] bg-white/80 p-7 text-left shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-[#e8a5a0]/60 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf5f0] sm:p-9"
                >
                  <span className="mb-6 inline-flex rounded-2xl bg-[#f7e8e0] p-4 text-[#c97b76]">
                    <CalendarDays className="h-7 w-7" strokeWidth={1.7} />
                  </span>
                  <span className="font-display text-2xl font-medium tracking-tight text-[#4a4540]">
                    Manage Appointments
                  </span>
                  <span className="mt-3 text-sm font-light leading-relaxed text-[#6b655d]">
                    View, add, and track your upcoming and past doctor visits.
                  </span>
                  <ChevronRight className="mt-auto ml-auto h-5 w-5 text-[#c97b76] transition-transform group-hover:translate-x-1" />
                </button>
              </section>
            </>
          ) : (
            <section className="mx-auto max-w-xl rounded-3xl border border-[#e9ded5] bg-white/80 p-8 text-center shadow-xl shadow-black/[0.03] backdrop-blur-xl sm:p-10">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f7e8e0] text-[#c97b76]">
                <placeholder.icon className="h-7 w-7" strokeWidth={1.7} />
              </span>
              <h1 className="font-display mt-6 text-2xl font-medium tracking-tight text-[#4a4540] sm:text-3xl">
                {placeholder.title}
              </h1>
              <p className="mt-3 text-sm font-light leading-relaxed text-[#6b655d]">
                {placeholder.description}
              </p>
              <button
                type="button"
                onClick={() => setView('hub')}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#c97b76] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
                Back to appointment options
              </button>
            </section>
          )}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[#e9ded5] bg-white/40 px-6 py-6 text-center text-xs font-light text-[#8a8278] backdrop-blur sm:px-12">
        <p>Made with care for every mother.</p>
      </footer>
    </div>
  );
}
