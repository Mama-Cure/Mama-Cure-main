package com.mamacure.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.text.TextUtils;
import android.util.Log;
import android.webkit.JavascriptInterface;
import java.util.regex.Pattern;

public final class AlarmBridge {
    private static final String TAG = "MamaCureAlarmBridge";
    private static final Pattern TIME_TEXT_PATTERN = Pattern.compile("^\\d{1,2}:\\d{2} [AP]M$");

    private final Context context;

    public AlarmBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public boolean scheduleAlarm(int id, long triggerAtMillis, String medName, String timeText) {
        if (id <= 0
                || triggerAtMillis <= System.currentTimeMillis()
                || TextUtils.isEmpty(medName)
                || medName.length() > 200
                || TextUtils.isEmpty(timeText)
                || !TIME_TEXT_PATTERN.matcher(timeText).matches()) {
            Log.w(TAG, "Rejected medication alarm with invalid arguments.");
            return false;
        }

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is unavailable.");
            return false;
        }

        Intent alarmIntent = new Intent(context, AlarmReceiver.class)
                .setAction(AlarmService.ACTION_TRIGGER_ALARM)
                .putExtra(AlarmService.EXTRA_ALARM_ID, id)
                .putExtra(AlarmService.EXTRA_MEDICATION_NAME, medName)
                .putExtra(AlarmService.EXTRA_TIME_TEXT, timeText);
        PendingIntent alarmPendingIntent = PendingIntent.getBroadcast(
                context,
                id,
                alarmIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent showIntent = new Intent(context, AlarmRingActivity.class)
                .setAction(AlarmService.ACTION_SHOW_ALARM)
                .putExtra(AlarmService.EXTRA_ALARM_ID, id)
                .putExtra(AlarmService.EXTRA_MEDICATION_NAME, medName)
                .putExtra(AlarmService.EXTRA_TIME_TEXT, timeText);
        PendingIntent showPendingIntent = PendingIntent.getActivity(
                context,
                id,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            alarmManager.setAlarmClock(
                    new AlarmManager.AlarmClockInfo(triggerAtMillis, showPendingIntent),
                    alarmPendingIntent
            );
            return true;
        } catch (SecurityException | IllegalArgumentException error) {
            Log.e(TAG, "Unable to schedule medication alarm.", error);
            return false;
        }
    }

    @JavascriptInterface
    public boolean cancelAlarm(int id) {
        if (id <= 0) return false;

        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            Log.e(TAG, "AlarmManager is unavailable.");
            return false;
        }

        Intent alarmIntent = new Intent(context, AlarmReceiver.class)
                .setAction(AlarmService.ACTION_TRIGGER_ALARM);
        PendingIntent alarmPendingIntent = PendingIntent.getBroadcast(
                context,
                id,
                alarmIntent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (alarmPendingIntent != null) {
            alarmManager.cancel(alarmPendingIntent);
            alarmPendingIntent.cancel();
        }

        Intent showIntent = new Intent(context, AlarmRingActivity.class)
                .setAction(AlarmService.ACTION_SHOW_ALARM);
        PendingIntent showPendingIntent = PendingIntent.getActivity(
                context,
                id,
                showIntent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (showPendingIntent != null) showPendingIntent.cancel();
        return true;
    }
}
