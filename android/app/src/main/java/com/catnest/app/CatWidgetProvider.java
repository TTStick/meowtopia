package com.catnest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** The 猫猫 widget. */
public class CatWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        WidgetData d = WidgetData.load(c);
        for (int id : ids) m.updateAppWidget(id, WidgetViews.cat(c, d, m.getAppWidgetOptions(id)));
        WidgetWorker.placed(c, goAsync());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        m.updateAppWidget(id, WidgetViews.cat(c, WidgetData.load(c), o));
    }

    @Override
    public void onDisabled(Context c) {
        WidgetWorker.removed(c);
    }
}
