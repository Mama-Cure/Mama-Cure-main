package com.mamacure.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import java.io.IOException;

public final class AlarmService extends Service {
    public static final String ACTION_TRIGGER_ALARM = "com.mamacure.app.action.TRIGGER_ALARM";
    public static final String ACTION_SHOW_ALARM = "com.mamacure.app.action.SHOW_ALARM";
    public static final String ACTION_DISMISS_ALARM = "com.mamacure.app.action.DISMISS_ALARM";
    public static final String EXTRA_ALARM_ID = "com.mamacure.app.extra.ALARM_ID";
    public static final String EXTRA_MEDICATION_NAME = "com.mamacure.app.extra.MEDICATION_NAME";
    public static final String EXTRA_TIME_TEXT = "com.mamacure.app.extra.TIME_TEXT";

    private static final String TAG = "MamaCureAlarmService";
    private static final String CHANNEL_ID = "medication-fullscreen-alarm";
    private static final int SERVICE_NOTIFICATION_ID = 40721;
    private static final long[] VIBRATION_PATTERN = {0, 800, 400, 800};

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_DISMISS_ALARM.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        int alarmId = intent.getIntExtra(EXTRA_ALARM_ID, SERVICE_NOTIFICATION_ID);
        String medicationName = intent.getStringExtra(EXTRA_MEDICATION_NAME);
        String timeText = intent.getStringExtra(EXTRA_TIME_TEXT);
        if (medicationName == null || medicationName.trim().isEmpty()) medicationName = "your medication";
        if (timeText == null) timeText = "";

        Notification notification = buildNotification(alarmId, medicationName, timeText);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                    SERVICE_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(SERVICE_NOTIFICATION_ID, notification);
        }

        if (!startAlarmPlayer()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startVibration();
        return START_REDELIVER_INTENT;
    }

    private Notification buildNotification(int alarmId, String medicationName, String timeText) {
        Intent activityIntent = new Intent(this, AlarmRingActivity.class)
                .setAction(ACTION_SHOW_ALARM)
                .putExtra(EXTRA_ALARM_ID, alarmId)
                .putExtra(EXTRA_MEDICATION_NAME, medicationName)
                .putExtra(EXTRA_TIME_TEXT, timeText);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(
                this,
                alarmId,
                activityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("Time to take " + medicationName)
                .setContentText(timeText)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreenIntent)
                .setFullScreenIntent(fullScreenIntent, true)
                .build();
    }

    private boolean startAlarmPlayer() {
        releaseMediaPlayer();
        MediaPlayer player = new MediaPlayer();
        try {
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            AssetFileDescriptor sound = getResources().openRawResourceFd(R.raw.alarm);
            if (sound == null) throw new IOException("Alarm sound resource is unavailable.");
            try {
                player.setDataSource(sound.getFileDescriptor(), sound.getStartOffset(), sound.getLength());
            } finally {
                sound.close();
            }
            player.setLooping(true);
            player.setVolume(1.0f, 1.0f);
            player.setOnErrorListener((mediaPlayer, what, extra) -> {
                Log.e(TAG, "Medication alarm audio playback failed: " + what + ", " + extra);
                stopSelf();
                return true;
            });
            player.prepare();
            player.start();
            mediaPlayer = player;
            return true;
        } catch (IOException | RuntimeException error) {
            Log.e(TAG, "Unable to start medication alarm audio.", error);
            player.release();
            return false;
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0));
        } else {
            vibrator.vibrate(VIBRATION_PATTERN, 0);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Full-screen Medication Alarms",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Full-screen medication alarms");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(null, null);
        channel.enableVibration(false);

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void releaseMediaPlayer() {
        if (mediaPlayer == null) return;
        try {
            if (mediaPlayer.isPlaying()) mediaPlayer.stop();
        } catch (IllegalStateException error) {
            Log.w(TAG, "Alarm player was already stopped.", error);
        }
        mediaPlayer.release();
        mediaPlayer = null;
    }

    @Override
    public void onDestroy() {
        releaseMediaPlayer();
        if (vibrator != null) {
            vibrator.cancel();
            vibrator = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
