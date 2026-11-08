package com.catnest.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** The 小镇 widget. */
public class TownWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        WidgetData d = WidgetData.load(c);
        for (int id : ids) m.updateAppWidget(id, WidgetViews.town(c, d, m.getAppWidgetOptions(id)));
        WidgetWorker.placed(c);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) {
        m.updateAppWidget(id, WidgetViews.town(c, WidgetData.load(c), o));
    }

    @Override
    public void onDisabled(Context c) {
        WidgetWorker.removed(c);
    }
}
