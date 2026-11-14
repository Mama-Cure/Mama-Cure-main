import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import LogoBadge from '@/components/LogoBadge';

export default function MedicationManagement() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbf5f0]">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />

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

      <main className="relative z-10 px-6 pb-16 pt-6 sm:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display mt-5 text-3xl font-medium leading-tight tracking-tight text-[#4a4540] sm:text-5xl">
            Medication Management
          </h1>
          <button
            type="button"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#c97b76] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Add Medication
          </button>
        </div>
      </main>
    </div>
  );
}
