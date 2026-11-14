package com.mamacure.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.content.ContextCompat;

public final class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        Intent serviceIntent = new Intent(context, AlarmService.class)
                .setAction(AlarmService.ACTION_TRIGGER_ALARM)
                .putExtras(intent);
        ContextCompat.startForegroundService(context, serviceIntent);
    }
}
