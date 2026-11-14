import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { collection, onSnapshot } from 'firebase/firestore';
import { BellRing, Volume2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebase';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const STORAGE_KEY_PREFIX = 'medication-alarm-triggered:';
export const MEDICATION_ALARM_TEST_EVENT = 'medication-alarm-test';

type Weekday = (typeof weekdays)[number];
type TimingMode = 'common' | 'custom';

type ScheduledMedication = {
  id: string;
  name: string;
  hasTimings: boolean;
  startDate: string;
  endDate: string;
  isIndefinite: boolean;
  days: Weekday[];
  timingMode: TimingMode | null;
  commonTimes: string[];
  customTimes: Partial<Record<Weekday, string[]>>;
};

type ActiveAlarm = {
  key: string;
  medicationId: string;
  userId: string;
  name: string;
  time: string;
  notificationId?: number;
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

function getLocalDateTime(now: Date) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const day = weekdays[now.getDay()];
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { date, day, time };
}

function formatTime(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function isAlarmKeyArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function getNotificationMetadata(value: unknown) {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
}

function hasNativeAlarmBridge() {
  if (
    typeof window === 'undefined'
    || !Capacitor.isNativePlatform()
    || Capacitor.getPlatform() !== 'android'
  ) {
    return false;
  }
  const nativeAlarm = (window as Window & { NativeAlarm?: { scheduleAlarm?: unknown } }).NativeAlarm;
  return typeof nativeAlarm?.scheduleAlarm === 'function';
}

async function cancelAlarmNotifications(userId: string, alarmKey: string, notificationId?: number) {
  if (!Capacitor.isNativePlatform()) return;

  const [pending, delivered] = await Promise.all([
    LocalNotifications.getPending(),
    LocalNotifications.getDeliveredNotifications(),
  ]);
  const matchesAlarm = (value: unknown) => {
    const metadata = getNotificationMetadata(value);
    const nestedMetadata = getNotificationMetadata(metadata.extra);
    return [metadata, nestedMetadata].some((item) => item.userId === userId && item.alarmKey === alarmKey);
  };
  const pendingIds = pending.notifications
    .filter((notification) => matchesAlarm(notification.extra))
    .map(({ id }) => id);
  if (pendingIds.length > 0) {
    await LocalNotifications.cancel({ notifications: pendingIds.map((id) => ({ id })) });
  }

  const deliveredIds = new Set(
    delivered.notifications
      .filter((notification) => matchesAlarm(notification.data) || matchesAlarm(notification.extra))
      .map(({ id }) => id),
  );
  if (notificationId !== undefined) deliveredIds.add(notificationId);
  if (deliveredIds.size > 0) {
    await LocalNotifications.removeDeliveredNotificationsById({ ids: [...deliveredIds] });
  }
}

export default function MedicationAlarm() {
  const { user } = useAuth();
  const userId = user?.uid;
  const medicationsRef = useRef<ScheduledMedication[]>([]);
  const triggeredKeysRef = useRef<Set<string>>(new Set());
  const alarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const [triggeredKeys, setTriggeredKeys] = useState<Set<string>>(new Set());
  const [historyReady, setHistoryReady] = useState(false);
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([]);
  const [listenerError, setListenerError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [audioError, setAudioError] = useState('');
  const [audioRetry, setAudioRetry] = useState(0);

  const activeAlarmsRef = useRef(activeAlarms);
  activeAlarmsRef.current = activeAlarms;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const audio = new Audio('/alarm.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    alarmAudioRef.current = audio;

    let unlocked = false;
    const unlockAudio = () => {
      if (unlocked) return;
      unlocked = true;
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      if (!audio.paused) return;
      const wasMuted = audio.muted;
      audio.muted = true;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = wasMuted;
        if (activeAlarmsRef.current.length > 0) {
          audio.loop = true;
          return audio.play();
        }
      }).catch((error: unknown) => {
        audio.muted = wasMuted;
        console.warn('Medication alarm audio could not be unlocked.', error);
      });
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      audio.pause();
      alarmAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const playTestChime = () => {
      const audio = alarmAudioRef.current;
      if (!audio || activeAlarmsRef.current.length > 0) return;
      audio.loop = false;
      audio.currentTime = 0;
      void audio.play().then(() => {
        setAudioError('');
      }).catch((error: unknown) => {
        setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
      });
    };

    window.addEventListener(MEDICATION_ALARM_TEST_EVENT, playTestChime);
    return () => window.removeEventListener(MEDICATION_ALARM_TEST_EVENT, playTestChime);
  }, []);

  useEffect(() => {
    medicationsRef.current = [];
    setActiveAlarms([]);
    setListenerError('');
    if (!userId) return;

    const medicationsQuery = collection(db, 'users', userId, 'medications');
    return onSnapshot(
      medicationsQuery,
      (snapshot) => {
        medicationsRef.current = snapshot.docs.flatMap((medicationDoc) => {
          const data = medicationDoc.data();
          if (typeof data.name !== 'string') return [];
          return [{
            id: medicationDoc.id,
            name: data.name,
            hasTimings: data.hasTimings === true,
            startDate: typeof data.startDate === 'string' ? data.startDate : '',
            endDate: typeof data.endDate === 'string' ? data.endDate : '',
            isIndefinite: data.isIndefinite === true,
            days: Array.isArray(data.days) ? data.days.filter(isWeekday) : [],
            timingMode: data.timingMode === 'common' || data.timingMode === 'custom' ? data.timingMode : null,
            commonTimes: getStringArray(data.commonTimes),
            customTimes: getCustomTimes(data.customTimes),
          }];
        });
        setListenerError('');
      },
      (error) => {
        setListenerError(`Medication alarms could not load: ${error.message}`);
      },
    );
  }, [userId]);

  useEffect(() => {
    triggeredKeysRef.current = new Set();
    setTriggeredKeys(new Set());
    setHistoryReady(false);
    setStorageWarning('');
    if (!userId) return;

    try {
      const savedKeys = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
      if (savedKeys) {
        const parsed: unknown = JSON.parse(savedKeys);
        if (!isAlarmKeyArray(parsed)) {
          throw new Error('Saved alarm history has an unexpected format.');
        }
        triggeredKeysRef.current = new Set(parsed);
        setTriggeredKeys(new Set(parsed));
      }
    } catch (error) {
      setStorageWarning(
        `Alarm history could not be read from this device: ${error instanceof Error ? error.message : 'Storage is unavailable.'}`,
      );
    } finally {
      setHistoryReady(true);
    }
  }, [userId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;
    void LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
      const metadata = getNotificationMetadata(notification.extra);
      const medicationId = typeof metadata.medicationId === 'string' ? metadata.medicationId : '';
      if (!medicationId) return;

      const notificationUserId = typeof metadata.userId === 'string' ? metadata.userId : userId;
      if (userId && notificationUserId && notificationUserId !== userId) return;
      const date = typeof metadata.scheduledDate === 'string'
        ? metadata.scheduledDate
        : getLocalDateTime(new Date()).date;
      const time = typeof metadata.scheduledTime === 'string' && /^\d{2}:\d{2}$/.test(metadata.scheduledTime)
        ? metadata.scheduledTime
        : getLocalDateTime(new Date()).time;
      const alarmKey = typeof metadata.alarmKey === 'string'
        ? metadata.alarmKey
        : JSON.stringify([medicationId, date, time]);
      const alarmUserId = notificationUserId ?? '';
      const medication = medicationsRef.current.find(({ id }) => id === medicationId);
      const name = medication?.name
        ?? (typeof metadata.medicationName === 'string' ? metadata.medicationName : notification.title);
      const activeAlarm: ActiveAlarm = {
        key: alarmKey,
        medicationId,
        userId: alarmUserId,
        name,
        time,
        notificationId: notification.id,
      };

      setActiveAlarms((alarms) => {
        const alreadyActive = alarms.some(({ key }) => key === alarmKey);
        return alreadyActive
          ? alarms.map((alarm) => alarm.key === alarmKey ? { ...alarm, notificationId: notification.id } : alarm)
          : [...alarms, activeAlarm];
      });
      if (alarmUserId) {
        triggeredKeysRef.current.add(alarmKey);
        setTriggeredKeys(new Set(triggeredKeysRef.current));
        try {
          window.localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${alarmUserId}`,
            JSON.stringify([...triggeredKeysRef.current]),
          );
          setStorageWarning('');
        } catch (error) {
          setStorageWarning(
            `Alarm history could not be saved to this device: ${error instanceof Error ? error.message : 'Storage is unavailable.'}`,
          );
        }
        void cancelAlarmNotifications(alarmUserId, alarmKey, notification.id).catch((error: unknown) => {
          setListenerError(`Follow-up medication alarms could not be cancelled: ${error instanceof Error ? error.message : 'Please try again.'}`);
        });
      }
    }).then((handle) => {
      if (disposed) {
        void handle.remove().catch((error: unknown) => {
          console.warn('Medication notification action listener could not be removed.', error);
        });
      } else {
        listenerHandle = handle;
      }
    }).catch((error: unknown) => {
      setListenerError(`Medication notification actions could not be loaded: ${error instanceof Error ? error.message : 'Please try again.'}`);
    });

    return () => {
      disposed = true;
      if (listenerHandle) {
        void listenerHandle.remove().catch((error: unknown) => {
          console.warn('Medication notification action listener could not be removed.', error);
        });
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !historyReady || hasNativeAlarmBridge()) return;

    const checkAlarms = () => {
      const { date, day, time } = getLocalDateTime(new Date());
      const newlyTriggered: ActiveAlarm[] = [];

      for (const medication of medicationsRef.current) {
        if (!medication.hasTimings || !medication.startDate || date < medication.startDate) continue;
        if (!medication.isIndefinite && (!medication.endDate || date > medication.endDate)) continue;
        if (!medication.days.includes(day)) continue;

        const matchingTime = medication.timingMode === 'common'
          ? medication.commonTimes.includes(time)
          : medication.timingMode === 'custom' && (medication.customTimes[day] ?? []).includes(time);
        if (!matchingTime) continue;

        const key = JSON.stringify([medication.id, date, time]);
        if (triggeredKeys.has(key) || triggeredKeysRef.current.has(key)) continue;
        triggeredKeysRef.current.add(key);
        if (typeof window !== 'undefined' && 'Notification' in window) {
          try {
            if (window.Notification.permission === 'granted') {
              new window.Notification(medication.name, { body: `Scheduled time: ${formatTime(time)}` });
            }
          } catch (notificationError) {
            console.warn('Medication notification could not be displayed.', notificationError);
          }
        }
        newlyTriggered.push({
          key,
          medicationId: medication.id,
          userId,
          name: medication.name,
          time,
        });
      }

      if (newlyTriggered.length === 0) return;
      setTriggeredKeys(new Set(triggeredKeysRef.current));
      setActiveAlarms((alarms) => [...alarms, ...newlyTriggered]);

      try {
        window.localStorage.setItem(
          `${STORAGE_KEY_PREFIX}${userId}`,
          JSON.stringify([...triggeredKeysRef.current]),
        );
        setStorageWarning('');
      } catch (error) {
        setStorageWarning(
          `Alarm history could not be saved to this device: ${error instanceof Error ? error.message : 'Storage is unavailable.'}`,
        );
      }
    };

    checkAlarms();
    const intervalId = window.setInterval(checkAlarms, 10_000);
    return () => window.clearInterval(intervalId);
  }, [historyReady, triggeredKeys, userId]);

  useEffect(() => {
    if (activeAlarms.length === 0) {
      setAudioError('');
      const audio = alarmAudioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.loop = true;
      }
      return;
    }

    const audio = alarmAudioRef.current;
    if (!audio) {
      setAudioError('Alarm audio is unavailable in this browser.');
      return;
    }

    audio.loop = true;
    audio.currentTime = 0;
    void audio.play().then(() => {
      setAudioError('');
    }).catch((error: unknown) => {
      setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
    });
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [activeAlarms.length, audioRetry]);

  const dismissAlarm = (alarm: ActiveAlarm) => {
    setActiveAlarms((alarms) => alarms.filter((activeAlarm) => activeAlarm.key !== alarm.key));
    const alarmUserId = alarm.userId || userId;
    if (alarmUserId) {
      void cancelAlarmNotifications(alarmUserId, alarm.key, alarm.notificationId).catch((error: unknown) => {
        setListenerError(`Follow-up medication alarms could not be cancelled: ${error instanceof Error ? error.message : 'Please try again.'}`);
      });
    }
  };

  if (activeAlarms.length === 0 && !listenerError && !storageWarning && !audioError) return null;

  return (
    <>
      {activeAlarms.length > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#4a4540]/45 p-4 backdrop-blur-sm">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="medication-alarm-title"
            aria-live="assertive"
            className="w-full max-w-lg rounded-3xl border border-[#e9ded5] bg-[#fbf5f0] p-6 shadow-2xl sm:p-8"
          >
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex rounded-2xl bg-[#f7e8e0] p-3 text-[#c97b76]">
                <BellRing className="h-6 w-6" />
              </span>
              <div>
                <h2 id="medication-alarm-title" className="font-display text-xl font-medium text-[#4a4540]">
                  Medication reminder
                </h2>
                <p className="mt-1 text-sm font-light text-[#6b655d]">
                  {activeAlarms.length === 1 ? 'It is time for your medication.' : 'It is time for your medications.'}
                </p>
              </div>
            </div>

            <ul className="space-y-3">
              {activeAlarms.map((alarm) => (
                <li
                  key={alarm.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e9ded5] bg-white/80 p-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-display text-lg font-medium text-[#4a4540]">{alarm.name}</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[#c97b76]">
                      <Volume2 className="h-4 w-4" />
                      {formatTime(alarm.time)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissAlarm(alarm)}
                    className="rounded-full bg-[#c97b76] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b96d68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c97b76] focus-visible:ring-offset-2"
                  >
                    Dismiss / Taken
                  </button>
                </li>
              ))}
            </ul>

            {audioError && (
              <div role="alert" className="mt-4 rounded-xl border border-[#e8a5a0]/40 bg-[#fff4f1] p-3 text-sm text-[#9c514c]">
                <p>{audioError}</p>
                <button
                  type="button"
                  onClick={() => setAudioRetry((retry) => retry + 1)}
                  className="mt-2 font-medium underline underline-offset-2"
                >
                  Enable sound
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      {(listenerError || storageWarning) && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[110] max-w-md space-y-1 rounded-2xl border border-[#e8a5a0]/40 bg-[#fff4f1] p-4 text-sm text-[#9c514c] shadow-lg"
        >
          {listenerError && <p>{listenerError}</p>}
          {storageWarning && <p>{storageWarning}</p>}
        </div>
      )}

      {audioError && activeAlarms.length === 0 && (
        <div
          role="alert"
          className="fixed bottom-4 left-4 z-[110] max-w-md rounded-2xl border border-[#e8a5a0]/40 bg-[#fff4f1] p-4 text-sm text-[#9c514c] shadow-lg"
        >
          <p>{audioError}</p>
        </div>
      )}
    </>
  );
}
