package com.catnest.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import java.io.File;

/** Draws the home screen widgets: a little scene that follows the town's clock, season and weather. */
final class WidgetViews {
    private static final int INK = 0xFF4A3A34, INK_SOFT = 0xAD4A3A34, CREAM = 0xFFF8F0E0, CREAM_SOFT = 0xB8F8F0E0;

    private WidgetViews() {}

    static void renderAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        WidgetData d = WidgetData.load(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, CatWidgetProvider.class))) m.updateAppWidget(id, cat(c, d, m.getAppWidgetOptions(id)));
        for (int id : m.getAppWidgetIds(new ComponentName(c, TownWidgetProvider.class))) m.updateAppWidget(id, town(c, d, m.getAppWidgetOptions(id)));
    }

    static boolean anyPlaced(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        return m.getAppWidgetIds(new ComponentName(c, CatWidgetProvider.class)).length > 0
            || m.getAppWidgetIds(new ComponentName(c, TownWidgetProvider.class)).length > 0;
    }

    private static int res(Context c, String kind, String name) {
        return c.getResources().getIdentifier(name, kind, c.getPackageName());
    }

    /** A scene's size in dp. On a phone held upright the width is the smallest offered, the height the largest. */
    private static int width(Bundle o) { return o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH); }
    private static int height(Bundle o) { return o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT); }

    private static PendingIntent open(Context c, boolean letters) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (letters) i.putExtra(MainActivity.EXTRA_OPEN, "letters");
        return PendingIntent.getActivity(c, letters ? 12 : 11, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Bitmap picture(Context c, WidgetData d, int maxSide) {
        File f = WidgetData.picture(c, d.pose());
        if (!f.exists()) f = WidgetData.picture(c, "sit");
        if (!f.exists()) return null;
        BitmapFactory.Options b = new BitmapFactory.Options();
        b.inSampleSize = maxSide < 128 ? 2 : 1;
        return BitmapFactory.decodeFile(f.getPath(), b);
    }

    private static int groundColor(WidgetData d, boolean dark) {
        char season = d.season().isEmpty() ? '春' : d.season().charAt(0);
        switch (season) {
            case '夏': return dark ? 0xFF35503F : 0xFFC6E2A0;
            case '秋': return dark ? 0xFF4C4A3B : 0xFFEBD79F;
            case '冬': return dark ? 0xFF565A78 : 0xFFEFF2EC;
            default: return dark ? 0xFF3A5546 : 0xFFCFE8AE;
        }
    }

    /** Sun, moon or weather, on the given image view (out of doors and through the window). */
    private static void heavens(Context c, RemoteViews v, int view, WidgetData d, boolean dark) {
        String w = d.weather();
        boolean rain = w.contains("雨"), snow = w.contains("雪"), cloud = w.contains("云");
        String art = rain ? "widget_deco_rain" : snow ? "widget_deco_snow" : cloud ? "widget_deco_cloud" : dark ? "widget_deco_moon" : "widget_deco_sun";
        v.setImageViewResource(view, res(c, "drawable", art));
        v.setInt(view, "setColorFilter", dark && (rain || snow || cloud) ? 0xFF8C8CB0 : 0);
    }

    /** The parts every scene has. */
    private static void scene(Context c, RemoteViews v, WidgetData d, boolean home, boolean hasWindow) {
        String light = d.light();
        boolean dark = light.equals("night");
        v.setInt(android.R.id.background, "setBackgroundResource", res(c, "drawable", (home ? "widget_wall_" : "widget_sky_") + light));

        // without clipping (before Android 12) the ground would poke out of the rounded corners
        if (Build.VERSION.SDK_INT >= 31) {
            v.setImageViewResource(R.id.ground, home ? R.drawable.widget_floor : R.drawable.widget_hill);
            v.setInt(R.id.ground, "setColorFilter", home ? floorColor(light) : groundColor(d, dark));
        } else {
            v.setViewVisibility(R.id.ground, View.GONE);
        }
        if (hasWindow) {
            v.setViewVisibility(R.id.window, home ? View.VISIBLE : View.GONE);
            v.setViewVisibility(R.id.deco, home ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.cushion, home ? View.VISIBLE : View.GONE);
            if (home) {
                v.setImageViewResource(R.id.window_sky, res(c, "drawable", "widget_win_" + light));
                v.setImageViewResource(R.id.window_frame, dark ? R.drawable.widget_win_frame_night : R.drawable.widget_win_frame);
                heavens(c, v, R.id.window_deco, d, dark);
                v.setImageViewResource(R.id.cushion, dark ? R.drawable.widget_cushion_night : R.drawable.widget_cushion);
            } else {
                heavens(c, v, R.id.deco, d, dark);
            }
        }
    }

    private static int floorColor(String light) {
        switch (light) {
            case "dawn": return 0xFFE7CDA9;
            case "dusk": return 0xFFDFBA8F;
            case "night": return 0xFF2A2746;
            default: return 0xFFEBD3AE;
        }
    }

    private static void letters(RemoteViews v, WidgetData d) {
        boolean any = d.unread() > 0;
        v.setViewVisibility(R.id.letters, any ? View.VISIBLE : View.GONE);
        if (any) v.setTextViewText(R.id.letters, String.valueOf(d.unread()));
    }

    private static void line(RemoteViews v, int id, String text, int color) {
        v.setViewVisibility(id, text == null ? View.GONE : View.VISIBLE);
        if (text == null) return;
        v.setTextViewText(id, text);
        v.setTextColor(id, color);
    }

    private static void bars(RemoteViews v, WidgetData d, int soft) {
        v.setProgressBar(R.id.food, 100, d.hunger(), false);
        v.setProgressBar(R.id.energy, 100, d.energy(), false);
        v.setProgressBar(R.id.mood, 100, d.happy(), false);
        v.setTextColor(R.id.food_label, soft);
        v.setTextColor(R.id.energy_label, soft);
        v.setTextColor(R.id.mood_label, soft);
    }

    private static RemoteViews invite(Context c, WidgetData d) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_invite);
        v.setInt(android.R.id.background, "setBackgroundResource", res(c, "drawable", "widget_sky_" + d.light()));
        boolean dark = d.light().equals("night");
        v.setTextColor(R.id.title, dark ? CREAM : INK);
        v.setTextColor(R.id.line, dark ? CREAM_SOFT : INK_SOFT);
        v.setTextViewText(R.id.title, d.signedIn() ? "还没有猫猫" : "猫窝");
        v.setTextViewText(R.id.line, d.signedIn() ? "打开猫窝领养一只吧" : "打开 App 登录后，这里会住进你的猫");
        v.setOnClickPendingIntent(android.R.id.background, open(c, false));
        return v;
    }

    static RemoteViews cat(Context c, WidgetData d, Bundle o) {
        if (!d.signedIn() || !d.hasCat()) return invite(c, d);
        int w = width(o), h = height(o);
        boolean small = w < 200, large = !small && h >= 250;
        RemoteViews v = new RemoteViews(c.getPackageName(), small ? R.layout.widget_cat_small : large ? R.layout.widget_cat_large : R.layout.widget_cat_medium);
        boolean dark = d.light().equals("night");
        // the large widget's words sit on its own panel
        int ink = dark ? CREAM : INK, soft = dark ? CREAM_SOFT : INK_SOFT;
        scene(c, v, d, d.home(), true);
        Bitmap b = picture(c, d, 256);
        if (b != null) v.setImageViewBitmap(R.id.cat, b);
        line(v, R.id.name, d.name(), ink);
        line(v, R.id.status, d.status(), soft);
        letters(v, d);
        if (!small) {
            line(v, R.id.days, d.days() > 0 ? "第 " + d.days() + " 天" : null, soft);
            bars(v, d, soft);
        }
        if (large) {
            v.setInt(R.id.panel, "setBackgroundResource", dark ? R.drawable.widget_panel_dark : R.drawable.widget_panel_light);
            String say = d.saying();
            v.setViewVisibility(R.id.bubble, say == null ? View.GONE : View.VISIBLE);
            if (say != null) v.setTextViewText(R.id.bubble, say);
            line(v, R.id.extra, d.wishLine(), ink);
            String town = d.showLine();
            line(v, R.id.town, town != null ? town : "小镇" + d.phaseName() + (d.weather().isEmpty() ? "" : "，" + d.weather()), soft);
        } else if (!small) {
            v.setInt(R.id.card, "setBackgroundResource", dark ? R.drawable.widget_card_dark : R.drawable.widget_card_light);
            line(v, R.id.extra, d.extra(), soft);
        }
        v.setOnClickPendingIntent(android.R.id.background, open(c, d.unread() > 0));
        return v;
    }

    static RemoteViews town(Context c, WidgetData d, Bundle o) {
        if (!d.signedIn()) return invite(c, d);
        boolean small = width(o) < 200;
        RemoteViews v = new RemoteViews(c.getPackageName(), small ? R.layout.widget_town_small : R.layout.widget_town_medium);
        boolean dark = d.light().equals("night");
        int ink = dark ? CREAM : INK, soft = dark ? CREAM_SOFT : INK_SOFT;
        scene(c, v, d, false, false);
        v.setViewVisibility(R.id.deco, View.VISIBLE);
        heavens(c, v, R.id.deco, d, dark);
        v.setImageViewResource(R.id.houses, dark ? R.drawable.widget_houses_night : R.drawable.widget_houses_day);
        v.setTextViewText(R.id.phase, d.townTitle());
        v.setTextColor(R.id.phase, ink);
        v.setTextColor(R.id.title, soft);
        if (small) {
            v.setTextViewText(R.id.show, d.showShort());
        } else {
            v.setInt(R.id.card, "setBackgroundResource", dark ? R.drawable.widget_card_dark : R.drawable.widget_card_light);
            v.setTextViewText(R.id.title, "小镇" + (d.season().isEmpty() ? "" : " · " + d.season()));
            String show = d.showLine();
            v.setTextViewText(R.id.show, show != null ? show : "今晚没有演出");
            v.setTextColor(R.id.show, ink);
            v.setViewVisibility(R.id.cat_row, d.hasCat() ? View.VISIBLE : View.GONE);
            if (d.hasCat()) {
                Bitmap b = picture(c, d, 96);
                if (b != null) v.setImageViewBitmap(R.id.cat, b);
                line(v, R.id.where, d.where(), soft);
            }
        }
        v.setOnClickPendingIntent(android.R.id.background, open(c, false));
        return v;
    }
}
