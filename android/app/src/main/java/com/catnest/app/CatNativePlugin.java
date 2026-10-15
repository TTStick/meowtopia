package com.catnest.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.view.View;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * The app's own native bits, mirroring the iOS plugin of the same name:
 * the session token in the Android Keystore, sharing files, and (Android only)
 * letters from the cat as notifications.
 */
@CapacitorPlugin(
    name = "CatNative",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class CatNativePlugin extends Plugin {

    // ---------- session token ----------

    @PluginMethod
    public void get(PluginCall call) {
        String v = SecureStore.get(getContext(), call.getString("key", ""));
        JSObject r = new JSObject();
        r.put("value", v == null ? JSONObject.NULL : v);
        call.resolve(r);
    }

    @PluginMethod
    public void set(PluginCall call) {
        try {
            SecureStore.set(getContext(), call.getString("key", ""), call.getString("value", ""));
            call.resolve();
        } catch (Exception e) {
            call.reject("keystore error");
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        SecureStore.remove(getContext(), call.getString("key", ""));
        call.resolve();
    }

    // ---------- what shows behind the system bars ----------

    /**
     * { color: '#rrggbb' } — on WebViews older than Chromium 140 Capacitor pads the
     * page away from the status and gesture bars, so the area behind them shows the
     * window. Keep it the same colour as the top of the scene.
     */
    @PluginMethod
    public void setBackdrop(PluginCall call) {
        int color;
        try {
            color = Color.parseColor(call.getString("color", "#f6eedf"));
        } catch (IllegalArgumentException e) {
            call.reject("bad color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            View wv = getBridge().getWebView();
            if (wv != null && wv.getParent() instanceof View) ((View) wv.getParent()).setBackgroundColor(color);
        });
        call.resolve();
    }

    // ---------- files ----------

    /**
     * { name, base64 } → the system share sheet. Photos are also put in the gallery first
     * (Pictures/猫窝), since Android's share sheet has no "save image" like iOS's.
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "catnest").replace('/', '-');
        String b64 = call.getString("base64");
        if (b64 == null) {
            call.reject("base64 required");
            return;
        }
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            boolean png = name.endsWith(".png");
            boolean saved = png && saveToGallery(name, bytes);
            File dir = new File(getContext().getCacheDir(), "share");
            dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            String type = png ? "image/png" : name.endsWith(".json") ? "application/json" : "application/octet-stream";
            Intent send = new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri(name, uri)); // lets the sheet show a preview
            getActivity().startActivity(Intent.createChooser(send, "分享给朋友"));
            JSObject r = new JSObject();
            r.put("completed", true);
            r.put("saved", saved);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("could not share");
        }
    }

    /** Android 10+ needs no permission to add a picture of our own; older versions just share. */
    private boolean saveToGallery(String name, byte[] bytes) {
        if (Build.VERSION.SDK_INT < 29) return false;
        ContentResolver cr = getContext().getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
        v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/猫窝");
        v.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri item = cr.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
        if (item == null) return false;
        try (OutputStream out = cr.openOutputStream(item)) {
            if (out == null) throw new IllegalStateException();
            out.write(bytes);
        } catch (Exception e) {
            cr.delete(item, null, null);
            return false;
        }
        v.clear();
        v.put(MediaStore.Images.Media.IS_PENDING, 0);
        cr.update(item, v, null, null);
        return true;
    }

    // ---------- watches (Apple Watch handoff is iOS only) ----------

    @PluginMethod
    public void watchState(PluginCall call) {
        JSObject r = new JSObject();
        r.put("supported", false);
        r.put("paired", false);
        r.put("installed", false);
        call.resolve(r);
    }

    @PluginMethod
    public void sendToWatch(PluginCall call) {
        call.reject("no watch on Android");
    }

    // ---------- letters as notifications ----------

    /** { server, prompt } — remember the server, ask for permission (Android 13+) if allowed to, start checking. */
    @PluginMethod
    public void enableLetters(PluginCall call) {
        String server = call.getString("server");
        if (server != null && !server.isEmpty()) {
            getContext().getSharedPreferences(LetterWorker.PREFS, Context.MODE_PRIVATE).edit().putString("server", server.replaceAll("/+$", "")).apply();
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            if (call.getBoolean("prompt", true)) {
                requestPermissionForAlias("notifications", call, "lettersPermission");
            } else {
                resolveLetters(call, false);
            }
            return;
        }
        LetterWorker.schedule(getContext());
        resolveLetters(call, true);
    }

    @PermissionCallback
    private void lettersPermission(PluginCall call) {
        boolean ok = getPermissionState("notifications") == PermissionState.GRANTED;
        if (ok) LetterWorker.schedule(getContext());
        resolveLetters(call, ok);
    }

    private void resolveLetters(PluginCall call, boolean granted) {
        LetterWorker.ensureChannel(getContext());
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void disableLetters(PluginCall call) {
        LetterWorker.cancel(getContext());
        call.resolve();
    }

    /** { title, body } — the first note right after turning letters on (iOS gets a test push instead). */
    @PluginMethod
    public void sampleLetter(PluginCall call) {
        LetterWorker.show(getContext(), call.getString("title", "猫窝"), call.getString("body", "通知已开启～"));
        call.resolve();
    }

    /** Called by the activity when a letter notification is tapped. */
    void opened(String panel) {
        JSObject r = new JSObject();
        r.put("panel", panel);
        notifyListeners("open", r, true); // kept until the page listens (cold start)
    }
}
