package com.catnest.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Looks for new letters from the cat now and then and shows them as notifications.
 * Works without Google services (FCM is unavailable on many phones in China), and
 * follows the same gentle rules as the server's push: only when the player turned
 * notifications on, never in quiet hours, at most a few a day.
 */
public class LetterWorker extends Worker {
    static final String WORK = "catnest-letters";
    static final String CHANNEL = "letters";
    static final String PREFS = "catnest_letters";
    private static final int MAX_PER_DAY = 4;
    private static final long MIN_GAP_MS = 2 * 3600_000L;

    public LetterWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context c) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(LetterWorker.class, 30, TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    static void cancel(Context c) {
        WorkManager.getInstance(c).cancelUniqueWork(WORK);
        // turned back on later: start fresh rather than replaying what piled up meanwhile
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("primed").apply();
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "猫猫的小纸条", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("探险回来、交到朋友时轻轻告诉你");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String server = p.getString("server", null);
        String token = SecureStore.get(c, "session");
        if (server == null || token == null) return Result.success();
        try {
            JSONObject home = fetch(server + "/api/companion", token);
            if (home == null) return Result.success();
            JSONArray letters = home.optJSONArray("letters");
            if (letters == null) letters = new JSONArray();

            boolean primed = p.getBoolean("primed", false);
            int last = p.getInt("lastLetter", 0);
            int newest = last;
            List<JSONObject> fresh = new ArrayList<>();
            for (int i = 0; i < letters.length(); i++) {
                JSONObject l = letters.getJSONObject(i);
                int id = l.getInt("id");
                newest = Math.max(newest, id);
                if (id > last && !l.optBoolean("seen")) fresh.add(l);
            }
            p.edit().putInt("lastLetter", newest).putBoolean("primed", true).apply();
            if (!primed || fresh.isEmpty()) return Result.success(); // first run: don't replay old letters

            JSONObject n = home.optJSONObject("notify");
            if (n == null || !n.optBoolean("push")) return Result.success();
            // the player's own time zone and quiet hours (tzOffset is minutes behind UTC, like JS)
            long now = System.currentTimeMillis();
            int tz = n.optInt("tzOffset", -480);
            double hour = (((now / 60000.0) - tz) / 60.0) % 24;
            if (hour < 0) hour += 24;
            int qs = n.optInt("quietStart", 23), qe = n.optInt("quietEnd", 8);
            boolean quiet = qs <= qe ? (hour >= qs && hour < qe) : (hour >= qs || hour < qe);
            if (quiet) return Result.success();

            long day = (long) Math.floor(((now / 60000.0) - tz) / 1440.0);
            int sentToday = p.getLong("day", -1) == day ? p.getInt("count", 0) : 0;
            if (sentToday >= MAX_PER_DAY || now - p.getLong("lastSent", 0) < MIN_GAP_MS) return Result.success();

            JSONObject top = fresh.get(0); // newest first
            String body = top.optString("text");
            if (fresh.size() > 1) body += "（还有" + (fresh.size() - 1) + "件小事）";
            show(c, top.optString("title", "猫窝"), body);
            p.edit().putLong("day", day).putInt("count", sentToday + 1).putLong("lastSent", now).apply();
        } catch (Exception e) {
            return Result.retry();
        }
        return Result.success();
    }

    private static JSONObject fetch(String url, String token) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(20000);
        h.setRequestProperty("Authorization", "Bearer " + token);
        h.setRequestProperty("User-Agent", "CatNestApp/1.0 Android");
        h.setRequestProperty("x-catnest", "1");
        try {
            if (h.getResponseCode() != 200) return null;
            InputStream in = h.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
            return new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
        } finally {
            h.disconnect();
        }
    }

    static void show(Context c, String title, String body) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).putExtra(MainActivity.EXTRA_OPEN, "letters").setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_cat)
            .setColor(0xFFF08A5D)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true);
        NotificationManagerCompat.from(c).notify((int) (System.currentTimeMillis() % 100000), b.build());
    }
}
