import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
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
import { ArrowLeft, Clock3, Pencil, Pill, Plus, Trash2, Volume2, X } from 'lucide-react';
import { MEDICATION_ALARM_TEST_EVENT } from '@/components/MedicationAlarm';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';
import LogoBadge from '@/components/LogoBadge';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
type Weekday = (typeof weekdays)[number];
type TimingMode = 'common' | 'custom';

type Medication = {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  hasTimings: boolean;
  startDate: string;
  endDate: string;
  isIndefinite: boolean;
  days: Weekday[];
  timingMode: TimingMode | null;
  commonTimes: string[];
  customTimes: Partial<Record<Weekday, string[]>>;
  nativeAlarmIds: number[];
};

type TimingDraft = {
  fromDate: string;
  toDate: string;
  indefinite: boolean;
  days: Weekday[];
  timingMode: TimingMode | null;
  commonTimes: string[];
  customTimes: Partial<Record<Weekday, string[]>>;
};

type NativeAlarmBridge = {
  scheduleAlarm(id: number, triggerAtMillis: number, medName: string, timeText: string): boolean;
  cancelAlarm(id: number): boolean;
};

type UpcomingMedicationAlarm = {
  dateKey: string;
  time: string;
  at: Date;
};

type NativeMedicationAlarm = {
  id: number;
  triggerAtMillis: number;
  medName: string;
  timeText: string;
};

const emptyTimingDraft: TimingDraft = {
  fromDate: '',
  toDate: '',
  indefinite: false,
  days: [],
  timingMode: null,
  commonTimes: [],
  customTimes: {},
};

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (weekdays as readonly string[]).includes(value);
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getCustomTimes(value: unknown): Partial<Record<Weekday, string[]>> {
  if (typeof value !== 'object' || value === null) return {};
  const data = value as Record<string, unknown>;
  const times: Partial<Record<Weekday, string[]>> = {};
  for (const day of weekdays) {
    const dayTimes = getStringArray(data[day]);
    if (dayTimes.length > 0) times[day] = dayTimes;
  }
  return times;
}

function getNotificationMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
}

function getNativeAlarmBridge(): NativeAlarmBridge | null {
  if (
    typeof window === 'undefined'
    || !Capacitor.isNativePlatform()
    || Capacitor.getPlatform() !== 'android'
  ) {
    return null;
  }
  return (window as Window & { NativeAlarm?: NativeAlarmBridge }).NativeAlarm ?? null;
}

function getSavedTimingDraft(medication: Medication): TimingDraft {
  return {
    fromDate: medication.startDate,
    toDate: medication.endDate,
    indefinite: medication.isIndefinite,
    days: [...medication.days],
    timingMode: medication.timingMode,
    commonTimes: [...medication.commonTimes],
    customTimes: Object.fromEntries(
      Object.entries(medication.customTimes).map(([day, times]) => [day, [...(times ?? [])]]),
    ),
  };
}

function formatTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDateSummary(medication: Medication) {
  const start = medication.startDate ? formatDate(medication.startDate) : 'Start date unavailable';
  if (medication.isIndefinite) return `Indefinite · From ${start}`;
  const end = medication.endDate ? formatDate(medication.endDate) : 'No end date';
  return `${start} – ${end}`;
}

function getTimeSummaries(medication: Medication) {
  if (medication.timingMode === 'common') {
    return medication.commonTimes.length > 0
      ? [`Common times: ${medication.commonTimes.map(formatTime).join(', ')}`]
      : [];
  }
  if (medication.timingMode === 'custom') {
    return medication.days.flatMap((day) => {
      const times = medication.customTimes[day] ?? [];
      return times.length > 0 ? [`${day}: ${times.map(formatTime).join(', ')}`] : [];
    });
  }
  return [];
}

function createNotificationId(value: string, reservedIds: Set<number>) {
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  let id = (hash >>> 0) % 2147483647 + 1;
  while (reservedIds.has(id)) id = id === 2147483647 ? 1 : id + 1;
  reservedIds.add(id);
  return id;
}

type NotificationEntry = { day: Weekday; time: string };

function getNotificationEntries(
  days: Weekday[],
  timingMode: TimingMode | null,
  commonTimes: string[],
  customTimes: Partial<Record<Weekday, string[]>>,
) {
  const entries: NotificationEntry[] = [];
  const seen = new Set<string>();
  for (const day of weekdays) {
    if (!days.includes(day)) continue;
    const times = timingMode === 'common' ? commonTimes : customTimes[day] ?? [];
    for (const time of times) {
      const key = JSON.stringify([day, time]);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ day, time });
    }
  }
  return entries;
}

function getMedicationNotificationIds(
  userId: string,
  medicationId: string,
  entries: NotificationEntry[],
) {
  const usedIds = new Set<number>();
  return entries.map(({ day, time }) =>
    createNotificationId(JSON.stringify([userId, medicationId, day, time]), usedIds),
  );
}

function getUpcomingMedicationAlarms(timing: TimingDraft): UpcomingMedicationAlarm[] {
  const alarms: UpcomingMedicationAlarm[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const dateKey = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    if (dateKey < timing.fromDate || (!timing.indefinite && timing.toDate && dateKey > timing.toDate)) continue;

    const day = weekdays[(date.getDay() + 6) % 7];
    if (!timing.days.includes(day)) continue;
    const times = timing.timingMode === 'common'
      ? timing.commonTimes
      : timing.timingMode === 'custom'
        ? timing.customTimes[day] ?? []
        : [];
    const seenTimes = new Set<string>();

    for (const time of times) {
      if (seenTimes.has(time)) continue;
      seenTimes.add(time);
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
      if (!match) throw new Error(`The saved time "${time}" is not valid.`);
      const at = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        Number(match[1]),
        Number(match[2]),
      );
      if (at > now) alarms.push({ dateKey, time, at });
    }
  }

  return alarms;
}

function getNativeMedicationAlarmPlan(
  userId: string,
  medication: Medication,
  timing: TimingDraft,
): NativeMedicationAlarm[] {
  const reservedIds = new Set<number>();
  return getUpcomingMedicationAlarms(timing).map(({ dateKey, time, at }) => ({
    id: createNotificationId(
      JSON.stringify([userId, medication.id, dateKey, time]),
      reservedIds,
    ),
    triggerAtMillis: at.getTime(),
    medName: medication.name,
    timeText: formatTime(time),
  }));
}

async function cancelMedicationNotifications(userId: string, medication: Medication) {
  const nativeAlarmBridge = getNativeAlarmBridge();
  if (nativeAlarmBridge) {
    for (const id of medication.nativeAlarmIds) {
      if (!nativeAlarmBridge.cancelAlarm(id)) {
        throw new Error(`Unable to cancel native medication alarm ${id}.`);
      }
    }
  }

  const entries = getNotificationEntries(
    medication.days,
    medication.timingMode,
    medication.commonTimes,
    medication.customTimes,
  );
  const ids = new Set(getMedicationNotificationIds(userId, medication.id, entries));
  const [pending, delivered] = await Promise.all([
    LocalNotifications.getPending(),
    LocalNotifications.getDeliveredNotifications(),
  ]);
  const belongsToMedication = (value: unknown) => {
    const metadata = getNotificationMetadata(value);
    const nestedMetadata = getNotificationMetadata(metadata.extra);
    return [metadata, nestedMetadata].some((item) =>
      item.userId === userId && item.medicationId === medication.id,
    );
  };
  for (const notification of pending.notifications) {
    if (belongsToMedication(notification.extra)) {
      ids.add(notification.id);
    }
  }
  const deliveredIds = delivered.notifications
    .filter((notification) => belongsToMedication(notification.data) || belongsToMedication(notification.extra))
    .map(({ id }) => id);
  if (ids.size > 0) {
    await LocalNotifications.cancel({
      notifications: [...ids].map((id) => ({ id })),
    });
  }
  if (deliveredIds.length > 0) {
    await LocalNotifications.removeDeliveredNotificationsById({ ids: deliveredIds });
  }
}

async function scheduleMedicationNotifications(
  userId: string,
  medication: Medication,
  timing: TimingDraft,
) {
  const notifications: LocalNotificationSchema[] = [];
  const reservedIds = new Set<number>();
  for (const { dateKey, time, at } of getUpcomingMedicationAlarms(timing)) {
    const alarmKey = JSON.stringify([medication.id, dateKey, time]);
    for (let followUpMinute = 0; followUpMinute < 3; followUpMinute += 1) {
      notifications.push({
        id: createNotificationId(
          JSON.stringify([userId, medication.id, dateKey, time, followUpMinute]),
          reservedIds,
        ),
        title: 'Medication Reminder',
        body: `Time to take ${medication.name}`,
        channelId: 'med-alarms-v2',
        sound: 'alarm.mp3',
        schedule: {
          at: new Date(at.getTime() + followUpMinute * 60_000),
          allowWhileIdle: true,
        },
        isExactNotification: true,
        isExactMandatory: true,
        ongoing: true,
        autoCancel: false,
        extra: {
          userId,
          medicationId: medication.id,
          medicationName: medication.name,
          scheduledDate: dateKey,
          scheduledTime: time,
          alarmKey,
        },
      });
    }
  }

  if (notifications.length === 0) return 0;
  const result = await LocalNotifications.schedule({ notifications });
  return result.notifications.length;
}

export default function MedicationManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [medicationName, setMedicationName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(null);
  const [editedMedicationName, setEditedMedicationName] = useState('');
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [openTimingMedicationId, setOpenTimingMedicationId] = useState<string | null>(null);
  const [deletingMedicationId, setDeletingMedicationId] = useState<string | null>(null);
  const [savingTimingMedicationId, setSavingTimingMedicationId] = useState<string | null>(null);
  const [timingDrafts, setTimingDrafts] = useState<Record<string, TimingDraft>>({});
  const [error, setError] = useState('');

  const updateTimingDraft = (medicationId: string, updates: Partial<TimingDraft>) => {
    setTimingDrafts((drafts) => ({
      ...drafts,
      [medicationId]: { ...(drafts[medicationId] ?? emptyTimingDraft), ...updates },
    }));
  };
  const getTimingDraft = (medicationId: string) => timingDrafts[medicationId] ?? emptyTimingDraft;

  const toggleTimingForm = (medication: Medication) => {
    if (openTimingMedicationId === medication.id) {
      setOpenTimingMedicationId(null);
      return;
    }

    setTimingDrafts((drafts) => ({
      ...drafts,
      [medication.id]: medication.hasTimings
        ? getSavedTimingDraft(medication)
        : drafts[medication.id] ?? emptyTimingDraft,
    }));
    setOpenTimingMedicationId(medication.id);
    setError('');
  };

  const cancelTimingForm = (medication: Medication) => {
    setTimingDrafts((drafts) => ({
      ...drafts,
      [medication.id]: medication.hasTimings ? getSavedTimingDraft(medication) : emptyTimingDraft,
    }));
    setOpenTimingMedicationId(null);
    setError('');
  };

  const addCommonTime = (medicationId: string) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      return {
        ...drafts,
        [medicationId]: {
          ...current,
          timingMode: 'common',
          commonTimes: [...(current.timingMode === 'common' ? current.commonTimes : []), ''],
          customTimes: {},
        },
      };
    });
  };

  const updateCommonTime = (medicationId: string, index: number, value: string) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      return {
        ...drafts,
        [medicationId]: {
          ...current,
          commonTimes: current.commonTimes.map((time, timeIndex) => timeIndex === index ? value : time),
        },
      };
    });
  };

  const removeCommonTime = (medicationId: string, index: number) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      return {
        ...drafts,
        [medicationId]: {
          ...current,
          commonTimes: current.commonTimes.filter((_, timeIndex) => timeIndex !== index),
        },
      };
    });
  };

  const addCustomTime = (medicationId: string, day: Weekday) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      const customTimes = current.timingMode === 'custom' ? current.customTimes : {};
      return {
        ...drafts,
        [medicationId]: {
          ...current,
          timingMode: 'custom',
          commonTimes: [],
          customTimes: { ...customTimes, [day]: [...(customTimes[day] ?? []), ''] },
        },
      };
    });
  };

  const updateCustomTime = (medicationId: string, day: Weekday, index: number, value: string) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      return {
        ...drafts,
        [medicationId]: {
          ...current,
          customTimes: {
            ...current.customTimes,
            [day]: (current.customTimes[day] ?? []).map((time, timeIndex) => timeIndex === index ? value : time),
          },
        },
      };
    });
  };

  const removeCustomTime = (medicationId: string, day: Weekday, index: number) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      const dayTimes = (current.customTimes[day] ?? []).filter((_, timeIndex) => timeIndex !== index);
      const customTimes = { ...current.customTimes };
      if (dayTimes.length > 0) customTimes[day] = dayTimes;
      else delete customTimes[day];
      return { ...drafts, [medicationId]: { ...current, customTimes } };
    });
  };

  const toggleDay = (medicationId: string, day: Weekday, isChecked: boolean) => {
    setTimingDrafts((drafts) => {
      const current = drafts[medicationId] ?? emptyTimingDraft;
      const days = isChecked
        ? [...current.days, day]
        : current.days.filter((selectedDay) => selectedDay !== day);
      const customTimes = { ...current.customTimes };
      if (!isChecked) delete customTimes[day];
      return { ...drafts, [medicationId]: { ...current, days, customTimes } };
    });
  };

  useEffect(() => {
    if (!user) {
      setMedications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    const medicationsQuery = query(collection(db, 'users', user.uid, 'medications'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(
      medicationsQuery,
      (snapshot) => {
        const userMedications = snapshot.docs.flatMap((medicationDoc) => {
          const data = medicationDoc.data();
          if (typeof data.name !== 'string') return [];
          return [{
            id: medicationDoc.id,
            name: data.name,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt : null,
            hasTimings: data.hasTimings === true,
            startDate: typeof data.startDate === 'string' ? data.startDate : '',
            endDate: typeof data.endDate === 'string' ? data.endDate : '',
            isIndefinite: data.isIndefinite === true,
            days: Array.isArray(data.days) ? data.days.filter(isWeekday) : [],
            timingMode: data.timingMode === 'common' || data.timingMode === 'custom' ? data.timingMode : null,
            commonTimes: getStringArray(data.commonTimes),
            customTimes: getCustomTimes(data.customTimes),
            nativeAlarmIds: Array.isArray(data.nativeAlarmIds)
              ? data.nativeAlarmIds.filter((value): value is number => Number.isInteger(value) && value > 0)
              : [],
          }];
        });
        userMedications.sort((first, second) =>
          (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0),
        );
        setMedications(userMedications);
        setIsLoading(false);
      },
      (loadError) => {
        setError(`Unable to load medications: ${loadError.message}`);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [user]);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = medicationName.trim();
    if (!name) {
      setError('Enter a medication name to save.');
      return;
    }
    if (!user) {
      setError('You must be signed in to save a medication.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await addDoc(collection(db, 'users', user.uid, 'medications'), {
        userId: user.uid,
        name,
        createdAt: serverTimestamp(),
        hasTimings: false,
        nativeAlarmIds: [],
      });
      setMedicationName('');
      setIsFormOpen(false);
    } catch (saveError) {
      setError(`Unable to save medication: ${saveError instanceof Error ? saveError.message : 'Please try again.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateName = async (event: FormEvent<HTMLFormElement>, medicationId: string) => {
    event.preventDefault();
    const name = editedMedicationName.trim();
    if (!name) {
      setError('Enter a medication name to save.');
      return;
    }
    if (!user) {
      setError('You must be signed in to update a medication.');
      return;
    }

    setIsUpdatingName(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid, 'medications', medicationId), { name });
      setEditingMedicationId(null);
      setEditedMedicationName('');
    } catch (updateError) {
      setError(`Unable to update medication: ${updateError instanceof Error ? updateError.message : 'Please try again.'}`);
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleDelete = async (medication: Medication) => {
    if (!user) {
      setError('You must be signed in to delete a medication.');
      return;
    }
    if (!window.confirm(`Delete ${medication.name}? This cannot be undone.`)) return;

    setDeletingMedicationId(medication.id);
    setError('');
    try {
      if (Capacitor.isNativePlatform()) {
        await cancelMedicationNotifications(user.uid, medication);
      }
      await deleteDoc(doc(db, 'users', user.uid, 'medications', medication.id));
      if (editingMedicationId === medication.id) setEditingMedicationId(null);
      if (openTimingMedicationId === medication.id) setOpenTimingMedicationId(null);
    } catch (deleteError) {
      setError(`Unable to delete medication: ${deleteError instanceof Error ? deleteError.message : 'Please try again.'}`);
    } finally {
      setDeletingMedicationId(null);
    }
  };

  const handleSaveTimings = async (event: FormEvent<HTMLFormElement>, medication: Medication) => {
    event.preventDefault();
    if (!user) {
      setError('You must be signed in to save medication timings.');
      return;
    }
    const draft = getTimingDraft(medication.id);
    const days = weekdays.filter((day) => draft.days.includes(day));

    if (!draft.fromDate) {
      setError('Choose a From Date before saving timings.');
      return;
    }
    if (days.length === 0) {
      setError('Choose at least one day of the week.');
      return;
    }

    const commonTimes = draft.timingMode === 'common'
      ? draft.commonTimes.filter((time) => time.trim().length > 0)
      : [];
    const customTimes: Partial<Record<Weekday, string[]>> = {};
    if (draft.timingMode === 'custom') {
      for (const day of days) {
        const times = (draft.customTimes[day] ?? []).filter((time) => time.trim().length > 0);
        if (times.length > 0) customTimes[day] = times;
      }
    }

    const hasTimes = draft.timingMode === 'common'
      ? commonTimes.length > 0
      : Object.values(customTimes).some((times) => (times?.length ?? 0) > 0);
    if (!draft.timingMode || !hasTimes) {
      setError('Add at least one medication time before saving.');
      return;
    }

    setSavingTimingMedicationId(medication.id);
    setError('');
    let timingsSaved = false;
    try {
      const isNativePlatform = Capacitor.isNativePlatform();
      const nativeAlarmBridge = getNativeAlarmBridge();
      if (isNativePlatform) {
        await cancelMedicationNotifications(user.uid, medication);
      }
      const timingToSave: TimingDraft = {
        ...draft,
        toDate: draft.indefinite ? '' : draft.toDate,
        days,
        commonTimes,
        customTimes,
      };
      const medicationRef = doc(db, 'users', user.uid, 'medications', medication.id);
      const timingUpdate = {
        hasTimings: true,
        startDate: timingToSave.fromDate,
        endDate: timingToSave.toDate,
        isIndefinite: timingToSave.indefinite,
        days: timingToSave.days,
        timingMode: timingToSave.timingMode,
        commonTimes,
        customTimes,
      };

      if (nativeAlarmBridge) {
        const nativeAlarmPlan = getNativeMedicationAlarmPlan(user.uid, medication, timingToSave);
        await updateDoc(medicationRef, {
          ...timingUpdate,
          nativeAlarmIds: nativeAlarmPlan.map(({ id }) => id),
        });
        timingsSaved = true;
        try {
          for (const alarm of nativeAlarmPlan) {
            if (!nativeAlarmBridge.scheduleAlarm(
              alarm.id,
              alarm.triggerAtMillis,
              alarm.medName,
              alarm.timeText,
            )) {
              throw new Error(`Unable to schedule native alarm for ${alarm.timeText}.`);
            }
          }
        } catch (scheduleError) {
          let cleanupFailed = false;
          for (const alarm of nativeAlarmPlan) {
            try {
              if (!nativeAlarmBridge.cancelAlarm(alarm.id)) cleanupFailed = true;
            } catch (cancelError) {
              cleanupFailed = true;
              console.error(`Unable to cancel partially scheduled native alarm ${alarm.id}.`, cancelError);
            }
          }
          if (cleanupFailed) {
            const reason = scheduleError instanceof Error ? scheduleError.message : 'Native scheduling failed.';
            throw new Error(`${reason} Some alarms may still be scheduled; edit or delete the medication to retry cancellation.`);
          }
          throw scheduleError;
        }
        window.alert(`Scheduled ${nativeAlarmPlan.length} native full-screen alarms.`);
      } else {
        await updateDoc(medicationRef, timingUpdate);
        timingsSaved = true;
      }

      if (isNativePlatform && !nativeAlarmBridge) {
        const scheduledCount = await scheduleMedicationNotifications(user.uid, medication, timingToSave);
        window.alert(`Scheduled ${scheduledCount} phone alarms.`);
      }
      setOpenTimingMedicationId(null);
    } catch (saveError) {
      const reason = saveError instanceof Error ? saveError.message : 'Please try again.';
      setError(timingsSaved
        ? `Timings were saved, but native phone alarms could not be scheduled: ${reason}`
        : `Unable to save timings: ${reason}`);
    } finally {
      setSavingTimingMedicationId(null);
    }
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#fbf5f0]">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#f3d4cb] opacity-50 blur-3xl pp-float" />
      <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#cdd9c5] opacity-40 blur-3xl pp-float-slow" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-12">
        <LogoBadge className="h-12" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(MEDICATION_ALARM_TEST_EVENT))}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/70 px-3 py-2 text-xs font-medium text-[#6b655d] backdrop-blur transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Test Alarm
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-2 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2.5 text-sm font-medium text-[#4a4540] backdrop-blur transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
            Back to dashboard
          </button>
        </div>
      </header>

      <main className="relative z-10 px-6 pb-16 pt-6 sm:px-12">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display mt-5 text-3xl font-medium leading-tight tracking-tight text-[#4a4540] sm:text-5xl">
            Medication Management
          </h1>
          <button
            type="button"
            aria-expanded={isFormOpen}
            aria-controls="add-medication-form"
            onClick={() => {
              setIsFormOpen((isOpen) => !isOpen);
              setError('');
            }}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#c97b76] px-6 py-3.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Add Medication
          </button>

          {isFormOpen && (
            <form
              id="add-medication-form"
              onSubmit={handleSave}
              className="mx-auto mt-7 max-w-xl rounded-2xl border border-[#e9ded5] bg-white/75 p-5 text-left shadow-sm backdrop-blur sm:p-8"
            >
              <label htmlFor="medication-name" className="text-sm font-medium text-[#4a4540]">
                Medication name
              </label>
              <input
                id="medication-name"
                name="medication-name"
                type="text"
                value={medicationName}
                onChange={(event) => setMedicationName(event.target.value)}
                placeholder="Enter a medication name"
                required
                className="mt-2 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-4 py-3 text-sm text-[#4a4540] outline-none transition placeholder:text-[#a59c92] focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="mt-5 inline-flex items-center justify-center rounded-full bg-[#c97b76] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}

          {error && (
            <p role="alert" className="mx-auto mt-5 max-w-xl rounded-xl border border-[#c97b76]/30 bg-[#fff4f1] px-4 py-3 text-left text-sm leading-relaxed text-[#9c514c]">
              {error}
            </p>
          )}

          <section aria-label="Saved medications" className="mt-10 text-left">
            {isLoading ? (
              <p role="status" className="text-center text-sm font-light text-[#6b655d]">
                Loading medications...
              </p>
            ) : medications.length > 0 ? (
              <ul className="grid gap-4 sm:grid-cols-2">
                {medications.map((medication) => (
                  <li
                    key={medication.id}
                    className="rounded-2xl border border-[#e9ded5] bg-white/75 p-5 shadow-sm backdrop-blur"
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex shrink-0 rounded-xl bg-[#f7e8e0] p-3 text-[#c97b76]">
                        <Pill className="h-5 w-5" strokeWidth={1.7} />
                      </span>
                      {editingMedicationId === medication.id ? (
                        <form
                          onSubmit={(event) => handleUpdateName(event, medication.id)}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <label htmlFor={`edit-medication-${medication.id}`} className="sr-only">
                            Medication name
                          </label>
                          <input
                            id={`edit-medication-${medication.id}`}
                            type="text"
                            value={editedMedicationName}
                            onChange={(event) => setEditedMedicationName(event.target.value)}
                            required
                            className="min-w-0 flex-1 rounded-xl border border-[#e9ded5] bg-white/80 px-3 py-2 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                          />
                          <button
                            type="submit"
                            disabled={isUpdatingName}
                            className="rounded-full bg-[#c97b76] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#b96d68] disabled:opacity-60"
                          >
                            {isUpdatingName ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMedicationId(null);
                              setEditedMedicationName('');
                              setError('');
                            }}
                            className="rounded-full border border-[#d8ccc2] bg-white/80 px-3 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76]"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 break-words font-display text-lg font-medium leading-snug tracking-tight text-[#4a4540]">
                            {medication.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMedicationId(medication.id);
                              setEditedMedicationName(medication.name);
                              setError('');
                            }}
                            aria-label={`Edit name for ${medication.name}`}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-3 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Edit Name</span>
                          </button>
                        </>
                      )}
                    </div>

                    {medication.hasTimings && (
                      <div className="mt-4 rounded-xl border border-[#e9ded5] bg-[#fff9f5] p-4 text-sm font-light text-[#6b655d]">
                        <div className="flex items-start gap-2">
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#c97b76]" />
                          <div className="min-w-0 space-y-1.5">
                            <p>{getDateSummary(medication)}</p>
                            <p>Days: {medication.days.length > 0 ? medication.days.join(', ') : 'Not set'}</p>
                            {getTimeSummaries(medication).length > 0 ? (
                              getTimeSummaries(medication).map((summary) => <p key={summary}>{summary}</p>)
                            ) : (
                              <p>Timing details unavailable.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!medication.hasTimings ? (
                        <button
                          type="button"
                          aria-expanded={openTimingMedicationId === medication.id}
                          aria-controls={`timings-${medication.id}`}
                          onClick={() => toggleTimingForm(medication)}
                          className="rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                        >
                          Add Timings
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            aria-expanded={openTimingMedicationId === medication.id}
                            aria-controls={`timings-${medication.id}`}
                            onClick={() => toggleTimingForm(medication)}
                            className="rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                          >
                            Edit Timings
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(medication)}
                            disabled={deletingMedicationId === medication.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#e8a5a0]/50 bg-[#fff9f5] px-4 py-2 text-xs font-medium text-[#9c514c] transition-colors hover:border-[#c97b76] hover:bg-[#fff4f1] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deletingMedicationId === medication.id ? 'Deleting...' : 'Delete Medication'}
                          </button>
                        </>
                      )}
                    </div>

                    {openTimingMedicationId === medication.id && (
                      <form
                        id={`timings-${medication.id}`}
                        onSubmit={(event) => handleSaveTimings(event, medication)}
                        className="mt-4 rounded-xl border border-[#e9ded5] bg-[#fff9f5] p-4 text-left"
                      >
                        <h3 id={`timings-heading-${medication.id}`} className="font-display text-base font-medium text-[#4a4540]">
                          {medication.hasTimings ? 'Edit timings' : 'Add timings'}
                        </h3>
                        <fieldset className="mt-4">
                          <legend className="text-sm font-medium text-[#4a4540]">Duration</legend>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <label htmlFor={`from-date-${medication.id}`} className="text-xs font-medium text-[#6b655d]">
                                From Date
                              </label>
                              <input
                                id={`from-date-${medication.id}`}
                                type="date"
                                value={getTimingDraft(medication.id).fromDate}
                                onChange={(event) => updateTimingDraft(medication.id, { fromDate: event.target.value })}
                                className="mt-1.5 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-3 py-2.5 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                              />
                            </div>
                            <div>
                              <label htmlFor={`to-date-${medication.id}`} className="text-xs font-medium text-[#6b655d]">
                                To Date
                              </label>
                              <input
                                id={`to-date-${medication.id}`}
                                type="date"
                                value={getTimingDraft(medication.id).toDate}
                                disabled={getTimingDraft(medication.id).indefinite}
                                onChange={(event) => updateTimingDraft(medication.id, { toDate: event.target.value })}
                                className="mt-1.5 w-full rounded-xl border border-[#e9ded5] bg-white/80 px-3 py-2.5 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30 disabled:cursor-not-allowed disabled:bg-[#f7e8e0]/60 disabled:text-[#a59c92]"
                              />
                            </div>
                          </div>
                          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-light text-[#6b655d]">
                            <input
                              type="checkbox"
                              checked={getTimingDraft(medication.id).indefinite}
                              onChange={(event) => updateTimingDraft(medication.id, {
                                indefinite: event.target.checked,
                                ...(event.target.checked ? { toDate: '' } : {}),
                              })}
                              className="h-4 w-4 rounded border-[#d8ccc2] accent-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
                            />
                            Indefinite
                          </label>
                        </fieldset>

                        <fieldset className="mt-5">
                          <legend className="text-sm font-medium text-[#4a4540]">Days of the Week</legend>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {weekdays.map((day) => (
                              <label key={day} className="cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={getTimingDraft(medication.id).days.includes(day)}
                                  onChange={(event) => toggleDay(medication.id, day, event.target.checked)}
                                  className="peer sr-only"
                                />
                                <span className="inline-flex min-w-12 justify-center rounded-full border border-[#d8ccc2] bg-white/80 px-3 py-2 text-xs font-medium text-[#6b655d] transition-colors peer-checked:border-[#c97b76] peer-checked:bg-[#f7e8e0] peer-checked:text-[#9c514c] peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[#c97b76]">
                                  {day}
                                </span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-4 space-y-3">
                            {weekdays
                              .filter((day) => getTimingDraft(medication.id).days.includes(day))
                              .map((day) => (
                                <div key={day} className="rounded-xl border border-[#e9ded5] bg-white/70 p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-[#4a4540]">{day}</span>
                                    <button
                                      type="button"
                                      onClick={() => addCustomTime(medication.id, day)}
                                      className="inline-flex items-center gap-1 rounded-full border border-[#d8ccc2] bg-white/80 px-3 py-1.5 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                      Custom Time
                                    </button>
                                  </div>
                                  {getTimingDraft(medication.id).timingMode === 'custom' && (
                                    <div className="mt-3 space-y-2">
                                      {(getTimingDraft(medication.id).customTimes[day] ?? []).map((time, index) => (
                                        <div key={`${day}-${index}`} className="flex items-center gap-2">
                                          <label htmlFor={`custom-time-${medication.id}-${day}-${index}`} className="sr-only">
                                            {day} custom time {index + 1}
                                          </label>
                                          <input
                                            id={`custom-time-${medication.id}-${day}-${index}`}
                                            type="time"
                                            value={time}
                                            onChange={(event) => updateCustomTime(medication.id, day, index, event.target.value)}
                                            className="min-w-0 flex-1 rounded-xl border border-[#e9ded5] bg-white/80 px-3 py-2 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => removeCustomTime(medication.id, day, index)}
                                            aria-label={`Remove ${day} custom time ${index + 1}`}
                                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a8278] transition-colors hover:bg-[#f7e8e0] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>
                        </fieldset>

                        <fieldset className="mt-5 border-t border-[#e9ded5] pt-5">
                          <legend className="text-sm font-medium text-[#4a4540]">Common Time</legend>
                          <p className="mt-1 text-xs font-light leading-relaxed text-[#6b655d]">
                            Use the same times for each selected day. Switching modes clears the other times.
                          </p>
                          <button
                            type="button"
                            onClick={() => addCommonTime(medication.id)}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#d8ccc2] bg-white/80 px-4 py-2 text-xs font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Common Time
                          </button>
                          {getTimingDraft(medication.id).timingMode === 'common' && (
                            <div className="mt-3 space-y-2">
                              {getTimingDraft(medication.id).commonTimes.map((time, index) => (
                                <div key={`common-${index}`} className="flex items-center gap-2">
                                  <label htmlFor={`common-time-${medication.id}-${index}`} className="sr-only">
                                    Common time {index + 1}
                                  </label>
                                  <input
                                    id={`common-time-${medication.id}-${index}`}
                                    type="time"
                                    value={time}
                                    onChange={(event) => updateCommonTime(medication.id, index, event.target.value)}
                                    className="min-w-0 flex-1 rounded-xl border border-[#e9ded5] bg-white/80 px-3 py-2 text-sm text-[#4a4540] outline-none transition focus:border-[#c97b76] focus:ring-2 focus:ring-[#e8a5a0]/30"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeCommonTime(medication.id, index)}
                                    aria-label={`Remove common time ${index + 1}`}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a8278] transition-colors hover:bg-[#f7e8e0] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </fieldset>

                        <div className="mt-6 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => cancelTimingForm(medication)}
                            className="rounded-full border border-[#d8ccc2] bg-white/80 px-5 py-2.5 text-sm font-medium text-[#4a4540] transition-colors hover:border-[#c97b76] hover:text-[#c97b76] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={savingTimingMedicationId === medication.id}
                            className="rounded-full bg-[#c97b76] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingTimingMedicationId === medication.id ? 'Saving...' : 'Save Timings'}
                          </button>
                        </div>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-sm font-light text-[#6b655d]">
                No medications saved yet.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
