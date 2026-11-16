import { useEffect, useState, type FormEvent } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ArrowLeft, CalendarDays, Check, MapPin, Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import LogoBadge from '@/components/LogoBadge';

export type AppointmentPrefill = {
  doctorName?: string;
  location?: string;
};

type AppointmentFields = {
  doctorName: string;
  date: string;
  time: string;
  location: string;
  notes: string;
};

type Appointment = AppointmentFields & {
  id: string;
  userId: string;
  completed: boolean;
  createdAt: Timestamp | null;
};

const blankAppointment: AppointmentFields = {
  doctorName: '',
  date: '',
  time: '',
  location: '',
  notes: '',
};

function getAppointmentDateTime(appointment: Appointment) {
  return new Date(`${appointment.date}T${appointment.time}`).getTime();
}

function formatAppointmentDate(date: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatAppointmentTime(date: string, time: string) {
  const parsedDate = new Date(`${date}T${time}`);
  return Number.isNaN(parsedDate.getTime())
    ? time
    : parsedDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function getDirectionsUrl(location: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(location.trim())}`;
}

function AppointmentCard({
  appointment,
  isUpdating,
  isDeleting,
  onComplete,
  onEdit,
  onDelete,
}: {
  appointment: Appointment;
  isUpdating: boolean;
  isDeleting: boolean;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isPast = !appointment.completed && getAppointmentDateTime(appointment) < Date.now();

  return (
    <li className="rounded-2xl border border-[#e9ded5] bg-white/75 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start gap-3">
        <span className="inline-flex shrink-0 rounded-xl bg-[#f7e8e0] p-3 text-[#c97b76]">
          <Stethoscope className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="break-words font-display text-lg font-medium leading-snug tracking-tight text-[#4a4540]">
              {appointment.doctorName}
            </h3>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              appointment.completed
                ? 'bg-[#eaf0e6] text-[#62745b]'
                : 'bg-[#f7e8e0] text-[#9c514c]'
            }`}>
              {appointment.completed ? 'Completed' : isPast ? 'Past' : 'Upcoming'}
            </span>
          </div>
          <div className="mt-3 space-y-2 text-sm font-light text-[#6b655d]">
            <p className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#c97b76]" />
              {formatAppointmentDate(appointment.date)} at {formatAppointmentTime(appointment.date, appointment.time)}
            </p>
            {appointment.location && (
              <p className="flex items-start gap-2 break-words">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#c97b76]" />
                {appointment.location}
              </p>
            )}
            {appointment.notes && (
              <p className="break-words rounded-xl border border-[#e9ded5] bg-[#fff9f5] px-3 py-2">
                {appointment.notes}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {appointment.location && (
          <button
            type="button"
            onClick={() => window.open(getDirectionsUrl(appointment.location), '_blank', 'noopener,noreferrer')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
          >
            <MapPin className="h-3.5 w-3.5" />
            Get Directions
          </button>
        )}
        {!appointment.completed && (
          <button
            type="button"
            onClick={onComplete}
            disabled={isUpdating}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" />
            {isUpdating ? 'Saving...' : 'Mark as Completed'}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e8a5a0]/50 bg-[#fff9f5] px-4 py-2 text-xs font-medium text-[#9c514c] transition-colors hover:border-[#c97b76] hover:bg-[#fff4f1] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </li>
  );
}

export default function AppointmentManagement({
  onBack,
  initialValues,
}: {
  onBack: () => void;
  initialValues?: AppointmentPrefill;
}) {
  const prefilledDoctorName = initialValues?.doctorName;
  const prefilledLocation = initialValues?.location;
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<AppointmentFields>({
    ...blankAppointment,
    doctorName: initialValues?.doctorName ?? '',
    location: initialValues?.location ?? '',
  });
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingAppointmentId, setUpdatingAppointmentId] = useState<string | null>(null);
  const [deletingAppointmentId, setDeletingAppointmentId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) {
      setAppointments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    const appointmentsQuery = query(
      collection(db, 'users', user.uid, 'appointments'),
      where('userId', '==', user.uid),
    );

    return onSnapshot(
      appointmentsQuery,
      (snapshot) => {
        const userAppointments = snapshot.docs.flatMap((appointmentDoc) => {
          const data = appointmentDoc.data();
          if (
            typeof data.doctorName !== 'string'
            || typeof data.date !== 'string'
            || typeof data.time !== 'string'
          ) {
            return [];
          }
          return [{
            id: appointmentDoc.id,
            userId: typeof data.userId === 'string' ? data.userId : user.uid,
            doctorName: data.doctorName,
            date: data.date,
            time: data.time,
            location: typeof data.location === 'string' ? data.location : '',
            notes: typeof data.notes === 'string' ? data.notes : '',
            completed: data.completed === true,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
          }];
        });
        setAppointments(userAppointments);
        setIsLoading(false);
      },
      (loadError) => {
        setError(`Unable to load appointments: ${loadError.message}`);
        setIsLoading(false);
      },
    );
  }, [user]);

  useEffect(() => {
    if (prefilledDoctorName === undefined && prefilledLocation === undefined) return;
    setFormValues((current) => ({
      ...current,
      ...(prefilledDoctorName !== undefined ? { doctorName: prefilledDoctorName } : {}),
      ...(prefilledLocation !== undefined ? { location: prefilledLocation } : {}),
    }));
    setIsFormOpen(true);
  }, [prefilledDoctorName, prefilledLocation]);

  const updateFormValue = (field: keyof AppointmentFields, value: string) => {
    setFormValues((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setFormValues(blankAppointment);
    setEditingAppointmentId(null);
    setIsFormOpen(false);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values: AppointmentFields = {
      doctorName: formValues.doctorName.trim(),
      date: formValues.date,
      time: formValues.time,
      location: formValues.location.trim(),
      notes: formValues.notes.trim(),
    };
    if (!values.doctorName || !values.date || !values.time) {
      setError('Enter the doctor or clinic name, date, and time.');
      return;
    }
    if (!user) {
      setError('You must be signed in to save an appointment.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingAppointmentId) {
        await updateDoc(doc(db, 'users', user.uid, 'appointments', editingAppointmentId), {
          ...values,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'users', user.uid, 'appointments'), {
          userId: user.uid,
          ...values,
          completed: false,
          createdAt: serverTimestamp(),
        });
      }
      resetForm();
    } catch (saveError) {
      setError(`Unable to save appointment: ${saveError instanceof Error ? saveError.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (appointment: Appointment) => {
    setFormValues({
      doctorName: appointment.doctorName,
      date: appointment.date,
      time: appointment.time,
      location: appointment.location,
      notes: appointment.notes,
    });
    setEditingAppointmentId(appointment.id);
    setIsFormOpen(true);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleComplete = async (appointment: Appointment) => {
    if (!user) {
      setError('You must be signed in to update an appointment.');
      return;
    }
    setUpdatingAppointmentId(appointment.id);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid, 'appointments', appointment.id), {
        completed: true,
        completedAt: serverTimestamp(),
      });
    } catch (updateError) {
      setError(`Unable to mark appointment as completed: ${updateError instanceof Error ? updateError.message : 'Please try again.'}`);
    } finally {
      setUpdatingAppointmentId(null);
    }
  };

  const handleDelete = async (appointment: Appointment) => {
    if (!user) {
      setError('You must be signed in to delete an appointment.');
      return;
    }
    if (!window.confirm(`Delete the appointment with ${appointment.doctorName}? This cannot be undone.`)) return;

    setDeletingAppointmentId(appointment.id);
    setError('');
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'appointments', appointment.id));
      if (editingAppointmentId === appointment.id) resetForm();
    } catch (deleteError) {
      setError(`Unable to delete appointment: ${deleteError instanceof Error ? deleteError.message : 'Please try again.'}`);
    } finally {
      setDeletingAppointmentId(null);
    }
  };

  const now = Date.now();
  const upcomingAppointments = appointments
    .filter((appointment) => !appointment.completed && getAppointmentDateTime(appointment) >= now)
    .sort((first, second) => getAppointmentDateTime(first) - getAppointmentDateTime(second));
  const pastAppointments = appointments
    .filter((appointment) => appointment.completed || getAppointmentDateTime(appointment) < now)
    .sort((first, second) => getAppointmentDateTime(second) - getAppointmentDateTime(first));

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbf5f0]">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />

      <header className="relative z-10 flex items-center justify-between gap-4 px-6 py-6 sm:px-12">
        <LogoBadge className="h-12" />
        <button
          type="button"
          onClick={onBack}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#4a4540] backdrop-blur transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
          <span>Back to appointment options</span>
        </button>
      </header>

      <main className="relative z-10 px-6 pb-16 pt-6 sm:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display mt-5 text-3xl font-medium leading-tight tracking-tight text-[#4a4540] sm:text-5xl">
            Manage Appointments
          </h1>
          <button
            type="button"
            aria-expanded={isFormOpen}
            aria-controls="appointment-form"
            onClick={() => {
              if (isFormOpen) resetForm();
              else {
                setError('');
                setIsFormOpen(true);
              }
            }}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#c97b76] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            {isFormOpen ? 'Cancel' : 'Add Appointment'}
          </button>

          {isFormOpen && (
            <form
              id="appointment-form"
              onSubmit={handleSave}
              className="mx-auto mt-7 max-w-xl rounded-2xl border border-[#e9ded5] bg-white/75 p-5 text-left shadow-sm backdrop-blur sm:p-8"
            >
              <h2 className="font-display text-xl font-medium tracking-tight text-[#4a4540]">
                {editingAppointmentId ? 'Edit Appointment' : 'Add Appointment'}
              </h2>
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="appointment-doctor-name" className="text-sm font-medium text-[#4a4540]">
                    Doctor or Clinic Name
                  </label>
                  <input
                    id="appointment-doctor-name"
                    type="text"
                    value={formValues.doctorName}
                    onChange={(event) => updateFormValue('doctorName', event.target.value)}
                    placeholder="Enter a doctor or clinic name"
                    required
                    className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition placeholder:text-[#a59c92] focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="appointment-date" className="text-sm font-medium text-[#4a4540]">
                      Date
                    </label>
                    <input
                      id="appointment-date"
                      type="date"
                      value={formValues.date}
                      onChange={(event) => updateFormValue('date', event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                    />
                  </div>
                  <div>
                    <label htmlFor="appointment-time" className="text-sm font-medium text-[#4a4540]">
                      Time
                    </label>
                    <input
                      id="appointment-time"
                      type="time"
                      value={formValues.time}
                      onChange={(event) => updateFormValue('time', event.target.value)}
                      required
                      className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="appointment-location" className="text-sm font-medium text-[#4a4540]">
                    Location / Address <span className="font-light text-[#8a8278]">(optional)</span>
                  </label>
                  <input
                    id="appointment-location"
                    type="text"
                    value={formValues.location}
                    onChange={(event) => updateFormValue('location', event.target.value)}
                    placeholder="Enter an address or place"
                    className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition placeholder:text-[#a59c92] focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                  />
                  <button
                    type="button"
                    disabled={!formValues.location.trim()}
                    onClick={() => window.open(getDirectionsUrl(formValues.location), '_blank', 'noopener,noreferrer')}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Open in Google Maps
                  </button>
                </div>

                <div>
                  <label htmlFor="appointment-notes" className="text-sm font-medium text-[#4a4540]">
                    Notes <span className="font-light text-[#8a8278]">(optional)</span>
                  </label>
                  <input
                    id="appointment-notes"
                    type="text"
                    value={formValues.notes}
                    onChange={(event) => updateFormValue('notes', event.target.value)}
                    placeholder="Questions to ask or reports to bring"
                    className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition placeholder:text-[#a59c92] focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                {editingAppointmentId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-[#d8ccc2] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76]"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[#c97b76] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : editingAppointmentId ? 'Save Changes' : 'Save Appointment'}
                </button>
              </div>
            </form>
          )}

          {error && (
            <p role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-[#c97b76]/30 bg-[#fff4f1] px-4 py-3 text-left text-sm leading-relaxed text-[#9c514c]">
              {error}
            </p>
          )}

          <section aria-label="Upcoming Appointments" className="mt-10 text-left">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[#4a4540]">
              Upcoming Appointments
            </h2>
            {isLoading ? (
              <p role="status" className="mt-4 text-center text-sm font-light text-[#6b655d]">
                Loading appointments...
              </p>
            ) : upcomingAppointments.length > 0 ? (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {upcomingAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    isUpdating={updatingAppointmentId === appointment.id}
                    isDeleting={deletingAppointmentId === appointment.id}
                    onComplete={() => void handleComplete(appointment)}
                    onEdit={() => handleEdit(appointment)}
                    onDelete={() => void handleDelete(appointment)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm font-light text-[#6b655d]">No upcoming appointments.</p>
            )}
          </section>

          <section aria-label="Past or completed appointments" className="mt-10 text-left">
            <h2 className="font-display text-2xl font-medium tracking-tight text-[#4a4540]">
              Past / Completed
            </h2>
            {!isLoading && (pastAppointments.length > 0 ? (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                {pastAppointments.map((appointment) => (
                  <AppointmentCard
                    key={appointment.id}
                    appointment={appointment}
                    isUpdating={updatingAppointmentId === appointment.id}
                    isDeleting={deletingAppointmentId === appointment.id}
                    onComplete={() => void handleComplete(appointment)}
                    onEdit={() => handleEdit(appointment)}
                    onDelete={() => void handleDelete(appointment)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm font-light text-[#6b655d]">No past or completed appointments.</p>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
