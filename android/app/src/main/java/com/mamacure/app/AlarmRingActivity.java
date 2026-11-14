package com.mamacure.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.content.Intent;
import android.content.res.ColorStateList;

public final class AlarmRingActivity extends Activity {
    private static final int BACKGROUND_COLOR = Color.rgb(251, 245, 240);
    private static final int TEXT_COLOR = Color.rgb(74, 69, 64);
    private static final int MUTED_COLOR = Color.rgb(138, 130, 120);
    private static final int ACCENT_COLOR = Color.rgb(201, 123, 118);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String medicationName = getIntent().getStringExtra(AlarmService.EXTRA_MEDICATION_NAME);
        String timeText = getIntent().getStringExtra(AlarmService.EXTRA_TIME_TEXT);
        if (medicationName == null || medicationName.trim().isEmpty()) medicationName = "your medication";
        if (timeText == null) timeText = "";

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(dp(32), dp(32), dp(32), dp(32));
        layout.setBackgroundColor(BACKGROUND_COLOR);

        TextView title = new TextView(this);
        title.setText("Time to take " + medicationName);
        title.setTextColor(TEXT_COLOR);
        title.setTextSize(30);
        title.setGravity(Gravity.CENTER);
        title.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
        layout.addView(title, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        TextView scheduledTime = new TextView(this);
        scheduledTime.setText(timeText);
        scheduledTime.setTextColor(MUTED_COLOR);
        scheduledTime.setTextSize(22);
        scheduledTime.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams timeParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        timeParams.topMargin = dp(18);
        layout.addView(scheduledTime, timeParams);

        Button dismissButton = new Button(this);
        dismissButton.setText("DISMISS");
        dismissButton.setTextColor(Color.WHITE);
        dismissButton.setTextSize(18);
        dismissButton.setBackgroundTintList(ColorStateList.valueOf(ACCENT_COLOR));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        buttonParams.topMargin = dp(48);
        layout.addView(dismissButton, buttonParams);
        dismissButton.setOnClickListener((view) -> {
            stopService(new Intent(this, AlarmService.class));
            finish();
        });

        setContentView(layout);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
