package com.catnest.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

/** What the home screen widgets show, as last heard from the town. The Android side of watchos/Shared/WidgetSnapshot.swift. */
final class WidgetData {
    static final String PREFS = "catnest_widget";
    private static final String KEY = "snapshot";

    final JSONObject o;

    private WidgetData(JSONObject o) {
        this.o = o;
    }

    static WidgetData signedOut() {
        return new WidgetData(new JSONObject());
    }

    /** From the answer of /api/watch. */
    static WidgetData from(JSONObject h) throws JSONException {
        JSONObject d = new JSONObject();
        d.put("at", System.currentTimeMillis());
        d.put("signedIn", true);
        JSONObject town = h.getJSONObject("town");
        d.put("time", town.optString("time"));
        d.put("weather", town.optString("weather"));
        d.put("season", town.optString("season"));
        d.put("mode", town.optString("mode", "open"));
        JSONObject show = town.optJSONObject("show");
        if (show != null && !show.optBoolean("rainedOff")) {
            d.put("show", show.optString("name"));
            d.put("showLive", show.optBoolean("live"));
            d.put("showGathering", show.optBoolean("gathering"));
        }
        d.put("unread", h.optInt("unread"));
        JSONObject c = h.optJSONObject("cat");
        if (c != null) {
            d.put("hasCat", true);
            d.put("id", c.optString("id"));
            d.put("name", c.optString("name"));
            d.put("mood", c.optString("mood"));
            d.put("days", c.optInt("days"));
            d.put("look", c.optString("look"));
            d.put("out", c.optBoolean("out"));
            d.put("sleepy", c.optBoolean("sleepy"));
            if (!c.isNull("away")) d.put("visiting", c.optString("away"));
            JSONObject st = c.optJSONObject("stats");
            if (st != null) {
                d.put("hunger", st.optDouble("hunger"));
                d.put("energy", st.optDouble("energy"));
                d.put("happy", st.optDouble("mood"));
            }
        }
        JSONObject trip = h.optJSONObject("trip");
        if (trip != null) {
            if (!trip.isNull("place")) d.put("place", trip.optString("place"));
            d.put("goingHome", trip.optBoolean("goingHome"));
        }
        JSONObject w = h.optJSONObject("wish");
        if (w != null) {
            JSONObject wish = w.optJSONObject("wish");
            if (wish != null) {
                d.put("wish", wish.optString("text"));
                d.put("wishNeed", wish.optInt("need"));
            }
            d.put("wishProgress", w.optInt("progress"));
            d.put("wishDone", w.optBoolean("done"));
        }
        return new WidgetData(d);
    }

    static WidgetData load(Context c) {
        String s = prefs(c).getString(KEY, null);
        if (s != null) {
            try {
                return new WidgetData(new JSONObject(s));
            } catch (JSONException e) {
                // fall through
            }
        }
        return signedOut();
    }

    void save(Context c) {
        prefs(c).edit().putString(KEY, o.toString()).apply();
    }

    /** Signed out, or another account or town: nothing of the last one should linger on the home screen. */
    static void clear(Context c) {
        prefs(c).edit().remove(KEY).apply();
        File[] files = picturesDir(c).listFiles();
        if (files != null) for (File f : files) f.delete();
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static File picturesDir(Context c) {
        File d = new File(c.getFilesDir(), "widget");
        d.mkdirs();
        return d;
    }

    static File picture(Context c, String pose) {
        return new File(picturesDir(c), "cat-" + pose + ".png");
    }

    // ---------- reading it ----------

    boolean signedIn() { return o.optBoolean("signedIn"); }
    boolean hasCat() { return o.optBoolean("hasCat"); }
    String name() { return o.optString("name"); }
    String look() { return o.optString("look"); }
    String catId() { return o.optString("id"); }
    int unread() { return o.optInt("unread"); }
    int days() { return o.optInt("days"); }
    int hunger() { return (int) o.optDouble("hunger", 0); }
    int energy() { return (int) o.optDouble("energy", 0); }
    int happy() { return (int) o.optDouble("happy", 0); }
    boolean out() { return o.optBoolean("out"); }
    boolean sleepy() { return o.optBoolean("sleepy"); }
    boolean home() { return !out() && !o.has("visiting"); }
    long age() { return System.currentTimeMillis() - o.optLong("at"); }
    String weather() { return o.optString("weather"); }
    String season() { return o.optString("season"); }

    /** The town's hour now, from its clock when this was saved. */
    double hour() {
        String[] p = o.optString("time", "12:00").split(":");
        double h = 12;
        try {
            h = Double.parseDouble(p[0]) + (p.length > 1 ? Double.parseDouble(p[1]) / 60 : 0);
        } catch (NumberFormatException e) {
            // keep midday
        }
        h = (h + age() / 3600000.0) % 24;
        return h < 0 ? h + 24 : h;
    }

    String phaseName() {
        double h = hour();
        return h < 5 ? "深夜" : h < 7 ? "清晨" : h < 11 ? "上午" : h < 14.5 ? "中午" : h < 18 ? "下午" : h < 21.5 ? "傍晚" : "夜晚";
    }

    /** dawn, day, dusk or night */
    String light() {
        double h = hour();
        return h < 5 ? "night" : h < 7.2 ? "dawn" : h < 17.6 ? "day" : h < 19.8 ? "dusk" : "night";
    }

    /** Which picture: a little life between refreshes. */
    String pose() {
        if (sleepy() && !out()) return "sleep";
        if (hunger() < 30) return "beg";
        if (happy() > 80) return "happy";
        return new String[] { "sit", "loaf", "sit", "groom" }[(int) ((System.currentTimeMillis() / 1200000L) % 4)];
    }

    private String opt(String key) {
        return o.isNull(key) || o.optString(key).isEmpty() ? null : o.optString(key);
    }

    String status() {
        String mode = o.optString("mode", "open");
        String s;
        if (mode.equals("paused")) s = "小镇暂停开放";
        else if (mode.equals("closed")) s = "小镇要关门了";
        else if (opt("visiting") != null) s = "在" + opt("visiting") + "家做客";
        else if (out() && o.optBoolean("goingHome")) s = "在回家的路上";
        else if (out()) s = opt("place") != null ? "在" + opt("place") : "出门探险中";
        else if (sleepy()) s = "睡着了";
        else s = o.optString("mood");
        long hours = age() / 3600000L;
        if (hours >= 3) s += " · " + (hours >= 24 ? (hours / 24) + " 天前" : hours + " 小时前");
        return s;
    }

    private boolean wishDone() { return o.optBoolean("wishDone"); }
    private int wishNeed() { return o.optInt("wishNeed"); }

    /** The line under the bars: the letters are on the badge, so today's wish. */
    String extra() {
        String w = opt("wish");
        if (w == null) return null;
        return wishDone() ? "心愿实现啦：" + w : "心愿 " + o.optInt("wishProgress") + "/" + wishNeed() + "：" + w;
    }

    String wishLine() {
        if (wishNeed() <= 0) return null;
        return wishDone() ? "今天的心愿实现啦" : "今天的心愿 " + o.optInt("wishProgress") + "/" + wishNeed();
    }

    String saying() {
        if (sleepy() && !out()) return "呼……";
        if (hunger() < 30) return "肚子饿了……";
        if (opt("wish") != null && !wishDone()) return opt("wish");
        return opt("mood");
    }

    String showLine() {
        String s = opt("show");
        if (s == null) return null;
        return o.optBoolean("showLive") ? "正在演出：" + s : o.optBoolean("showGathering") ? "快开演了：" + s : "今晚 19:30 " + s;
    }

    String showShort() {
        String s = opt("show");
        if (s == null) return "今晚没有演出";
        return o.optBoolean("showLive") ? "演出中：" + s : o.optBoolean("showGathering") ? "快开演：" + s : "19:30 " + s;
    }

    String townTitle() {
        return phaseName() + (weather().isEmpty() ? "" : " · " + weather());
    }

    String where() {
        if (opt("visiting") != null) return name() + "在" + opt("visiting") + "家做客";
        if (out()) return name() + (o.optBoolean("goingHome") ? "在回家的路上" : opt("place") != null ? "在" + opt("place") : "在外面玩");
        return name() + (sleepy() ? "在家睡觉" : "在家里");
    }
}
