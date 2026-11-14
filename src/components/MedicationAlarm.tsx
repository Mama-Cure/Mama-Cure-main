import { useEffect, useRef, useState } from 'react';
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
  name: string;
  time: string;
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

function getOrCreateAudioContext(contextRef: { current: AudioContext | null }) {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') {
    throw new Error('Web Audio is not supported in this browser.');
  }
  if (contextRef.current?.state === 'closed') contextRef.current = null;
  contextRef.current ??= new window.AudioContext();
  return contextRef.current;
}

function playChimeSequence(audioContext: AudioContext) {
  const startAt = audioContext.currentTime;
  [659.25, 783.99, 987.77].forEach((frequency, index) => {
    const start = startAt + index * 0.18;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + 0.44);
  });
}

export default function MedicationAlarm() {
  const { user } = useAuth();
  const userId = user?.uid;
  const medicationsRef = useRef<ScheduledMedication[]>([]);
  const triggeredKeysRef = useRef<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);
  const [triggeredKeys, setTriggeredKeys] = useState<Set<string>>(new Set());
  const [historyReady, setHistoryReady] = useState(false);
  const [activeAlarms, setActiveAlarms] = useState<ActiveAlarm[]>([]);
  const [listenerError, setListenerError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [audioError, setAudioError] = useState('');
  const [audioRetry, setAudioRetry] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let unlocked = false;
    const unlockAudio = () => {
      if (unlocked) return;
      unlocked = true;
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      try {
        const audioContext = getOrCreateAudioContext(audioContextRef);
        if (audioContext.state !== 'running') {
          void audioContext.resume().catch((error: unknown) => {
            console.warn('Medication alarm audio could not be unlocked.', error);
          });
        }
      } catch (error) {
        console.warn('Medication alarm audio could not be unlocked.', error);
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch((error: unknown) => {
          console.warn('Medication alarm audio context could not be closed.', error);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const playTestChime = () => {
      try {
        const audioContext = getOrCreateAudioContext(audioContextRef);
        void audioContext.resume().then(() => {
          if (audioContext.state === 'running') {
            setAudioError('');
            playChimeSequence(audioContext);
          }
        }).catch((error: unknown) => {
          setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
        });
      } catch (error) {
        setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
      }
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
    if (!userId || !historyReady) return;

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
      return;
    }

    let stopped = false;
    let resumePending = false;
    let resumeTimeout: number | undefined;

    const playChime = () => {
      try {
        const audioContext = getOrCreateAudioContext(audioContextRef);
        if (audioContext.state === 'running') {
          setAudioError('');
          playChimeSequence(audioContext);
          return;
        }
        if (resumePending) return;

        resumePending = true;
        void audioContext.resume().then(() => {
          resumePending = false;
          if (resumeTimeout !== undefined) window.clearTimeout(resumeTimeout);
          if (stopped) return;
          if (audioContext?.state === 'running') {
            setAudioError('');
            playChimeSequence(audioContext);
          } else {
            setAudioError('Your browser has paused alarm audio. Enable sound to try again.');
          }
        }).catch((error: unknown) => {
          resumePending = false;
          if (resumeTimeout !== undefined) window.clearTimeout(resumeTimeout);
          if (!stopped) {
            setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
          }
        });
        resumeTimeout = window.setTimeout(() => {
          if (!stopped && audioContext?.state !== 'running') {
            setAudioError('Your browser has paused alarm audio. Enable sound to try again.');
          }
        }, 1500);
      } catch (error) {
        setAudioError(`Alarm audio could not start: ${error instanceof Error ? error.message : 'Please enable sound.'}`);
      }
    };

    playChime();
    const intervalId = window.setInterval(playChime, 2800);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      if (resumeTimeout !== undefined) window.clearTimeout(resumeTimeout);
    };
  }, [activeAlarms.length, audioRetry]);

  const dismissAlarm = (alarmKey: string) => {
    setActiveAlarms((alarms) => alarms.filter((alarm) => alarm.key !== alarmKey));
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
                    onClick={() => dismissAlarm(alarm.key)}
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
