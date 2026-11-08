package com.catnest.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Asks the town how the cat is doing, about every half hour while a widget is on the
 * home screen, and whenever the player leaves the app.
 */
public class WidgetWorker extends Worker {
    private static final String PERIODIC = "catnest-widgets";
    private static final String ONCE = "catnest-widgets-now";
    /** name on disk, pose on the server */
    private static final String[][] FRAMES = { { "sit", "sit" }, { "loaf", "loaf" }, { "groom", "groom" }, { "happy", "happy" }, { "beg", "beg" }, { "sleep", "sleep1" } };
    private static final long FRESH_MS = 10 * 60_000L;

    public WidgetWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    private static Constraints online() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** A widget was put on the home screen, or the launcher wants them redrawn. */
    static void placed(Context c) {
        // the periodic job comes first and stays: WorkManager turning its receivers on and off
        // while nothing is scheduled would itself make the launcher ask for another update
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
            new PeriodicWorkRequest.Builder(WidgetWorker.class, 30, TimeUnit.MINUTES).setConstraints(online()).build());
        if (WidgetData.load(c).age() > FRESH_MS) now(c);
    }

    static void removed(Context c) {
        if (!WidgetViews.anyPlaced(c)) WorkManager.getInstance(c).cancelUniqueWork(PERIODIC);
    }

    static void now(Context c) {
        WorkManager.getInstance(c).enqueueUniqueWork(ONCE, ExistingWorkPolicy.KEEP,
            new OneTimeWorkRequest.Builder(WidgetWorker.class).setConstraints(online()).build());
    }

    /** The player just played: let the widgets catch up. */
    static void leftApp(Context c) {
        if (WidgetViews.anyPlaced(c)) now(c);
    }

    /** After every sign-in, sign-out and start: which town to ask. */
    static void link(Context c, String server) {
        SharedPreferences p = c.getSharedPreferences(WidgetData.PREFS, Context.MODE_PRIVATE);
        String token = SecureStore.get(c, "session");
        String who = server + "|" + (token == null ? "" : Integer.toHexString(token.hashCode()));
        if (!who.equals(p.getString("link", null))) {
            WidgetData.clear(c);
            p.edit().putString("link", who).putString("server", server).apply();
            WidgetViews.renderAll(c);
        }
        if (WidgetViews.anyPlaced(c)) now(c);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        String server = c.getSharedPreferences(WidgetData.PREFS, Context.MODE_PRIVATE).getString("server", null);
        String token = SecureStore.get(c, "session");
        if (server == null || token == null) {
            WidgetData.clear(c);
            WidgetViews.renderAll(c);
            return Result.success();
        }
        try {
            HttpURLConnection h = open(server + "/api/watch", token);
            try {
                int code = h.getResponseCode();
                if (code == 401) {
                    WidgetData.clear(c);
                    WidgetViews.renderAll(c);
                    return Result.success();
                }
                if (code != 200) return Result.retry();
                WidgetData d = WidgetData.from(new JSONObject(new String(read(h.getInputStream()), StandardCharsets.UTF_8)));
                // the pictures come first, so a new look's facts never show with an old look's picture
                String oldLook = WidgetData.load(c).look();
                if (d.hasCat() && (!oldLook.equals(d.look()) || !WidgetData.picture(c, "sit").exists())) savePictures(c, server, token, d);
                d.save(c);
                WidgetViews.renderAll(c);
            } finally {
                h.disconnect();
            }
        } catch (Exception e) {
            return Result.retry();
        }
        return Result.success();
    }

    private static HttpURLConnection open(String url, String token) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(15000);
        h.setReadTimeout(20000);
        h.setRequestProperty("Authorization", "Bearer " + token);
        h.setRequestProperty("User-Agent", "CatNestApp/1.0 Android-widget");
        h.setRequestProperty("x-catnest", "1");
        return h;
    }

    private static byte[] read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int r; (r = in.read(buf)) > 0; ) out.write(buf, 0, r);
        return out.toByteArray();
    }

    private static void savePictures(Context c, String server, String token, WidgetData d) throws Exception {
        for (String[] f : FRAMES) {
            HttpURLConnection h = open(server + "/api/sprite/cat/" + d.catId() + "/" + f[1] + "?size=256&outline=1&v=" + d.look(), token);
            try {
                if (h.getResponseCode() != 200) continue;
                byte[] png = read(h.getInputStream());
                File target = WidgetData.picture(c, f[0]);
                File tmp = new File(target.getPath() + ".new");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(png);
                }
                tmp.renameTo(target);
            } finally {
                h.disconnect();
            }
        }
    }
}
