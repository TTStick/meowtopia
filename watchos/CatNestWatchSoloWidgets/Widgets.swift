import SwiftUI
import WidgetKit

/// Complications and Smart Stack widgets for 猫窝手表版.
@main
struct CatNestWidgets: WidgetBundle {
    var body: some Widget {
        CatWidget()
        TownWidget()
    }
}

struct SnapEntry: TimelineEntry {
    let date: Date
    let snap: WidgetSnapshot
    let relevance: TimelineEntryRelevance?
}

/// Reads what the app last saved; the app refreshes it (and asks for a redraw) when anything changes.
struct SnapProvider: TimelineProvider {
    let kind: String

    func placeholder(in context: Context) -> SnapEntry { SnapEntry(date: .now, snap: .sample, relevance: nil) }

    func getSnapshot(in context: Context, completion: @escaping (SnapEntry) -> Void) {
        completion(SnapEntry(date: .now, snap: context.isPreview ? .sample : (WidgetSnapshot.load() ?? .sample), relevance: nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry>) -> Void) {
        let s = WidgetSnapshot.load() ?? WidgetSnapshot()
        completion(Timeline(entries: [SnapEntry(date: .now, snap: s, relevance: relevance(s))], policy: .after(.now.addingTimeInterval(30 * 60))))
    }

    /// When to come up in the Smart Stack: new letters, the cat out exploring, a show about to start.
    private func relevance(_ s: WidgetSnapshot) -> TimelineEntryRelevance? {
        if kind == "town" { return s.showLive || s.showGathering ? TimelineEntryRelevance(score: 80) : nil }
        if s.unread > 0 { return TimelineEntryRelevance(score: 60) }
        if s.out { return TimelineEntryRelevance(score: 40) }
        return nil
    }
}

struct CatWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "cat", provider: SnapProvider(kind: "cat")) { e in
            CatFamilyView(s: e.snap).containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("猫猫")
        .description("你的猫在做什么、心情怎么样")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline, .accessoryCorner])
    }
}

struct TownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "town", provider: SnapProvider(kind: "town")) { e in
            TownFamilyView(s: e.snap).containerBackground(for: .widget) { Color.clear }
        }
        .configurationDisplayName("小镇")
        .description("小镇的时间天气和今晚的舞台")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

private struct CatFamilyView: View {
    @Environment(\.widgetFamily) private var family
    let s: WidgetSnapshot
    var body: some View { CatWidgetView(s: s, family: family) }
}

private struct TownFamilyView: View {
    @Environment(\.widgetFamily) private var family
    let s: WidgetSnapshot
    var body: some View { TownWidgetView(s: s, family: family) }
}
