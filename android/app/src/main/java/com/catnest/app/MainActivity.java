package com.catnest.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    static final String EXTRA_OPEN = "catnest_open";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CatNativePlugin.class);
        super.onCreate(savedInstanceState);
        handle(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
    }

    /** A tapped letter notification opens the mailbox. */
    private void handle(Intent intent) {
        if (intent == null || bridge == null) return;
        String panel = intent.getStringExtra(EXTRA_OPEN);
        if (panel == null) return;
        intent.removeExtra(EXTRA_OPEN);
        PluginHandle h = bridge.getPlugin("CatNative");
        if (h != null && h.getInstance() instanceof CatNativePlugin) ((CatNativePlugin) h.getInstance()).opened(panel);
    }
}
