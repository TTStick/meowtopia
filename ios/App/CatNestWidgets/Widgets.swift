import SwiftUI
import WidgetKit

/// The home screen and desktop widgets of 猫窝 (iPhone, iPad and Mac).
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
}

struct SnapProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapEntry { SnapEntry(date: .now, snap: .desktopSample) }

    func getSnapshot(in context: Context, completion: @escaping (SnapEntry) -> Void) {
        completion(SnapEntry(date: .now, snap: context.isPreview ? .desktopSample : (WidgetSnapshot.load() ?? WidgetSnapshot())))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry>) -> Void) {
        Task {
            #if os(iOS)
            await WidgetLink.refresh()
            #endif
            let s = WidgetSnapshot.load() ?? WidgetSnapshot()
            // the same facts, a little later: the light changes with the hour and the cat changes pose
            let now = Date()
            let entries = (0..<12).map { SnapEntry(date: now.addingTimeInterval(Double($0) * 15 * 60), snap: s) }
            completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(30 * 60))))
        }
    }
}

struct CatWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "cat", provider: SnapProvider()) { e in
            FamilyReader { CatFaceInWidget(s: e.snap, date: e.date, family: $0) }
        }
        .configurationDisplayName("猫猫")
        .description("你的猫在做什么、心情怎么样")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

struct TownWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "town", provider: SnapProvider()) { e in
            FamilyReader { TownFaceInWidget(s: e.snap, date: e.date, family: $0) }
        }
        .configurationDisplayName("小镇")
        .description("小镇的时辰天气和今晚的舞台")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

private struct FamilyReader<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    @ViewBuilder let content: (WidgetFamily) -> Content
    var body: some View { content(family) }
}

/// Tapping a widget opens the game, or the mailbox when there are letters waiting.
private func tapTarget(_ s: WidgetSnapshot) -> URL? {
    URL(string: s.unread > 0 ? "catnest://open/letters" : "catnest://open/home")
}

private struct CatFaceInWidget: View {
    let s: WidgetSnapshot
    let date: Date
    let family: WidgetFamily
    var body: some View {
        let f = CatFace(s: s, date: date, family: family)
        f.widgetURL(tapTarget(s)).containerBackground(for: .widget) { f.scene }
    }
}

private struct TownFaceInWidget: View {
    let s: WidgetSnapshot
    let date: Date
    let family: WidgetFamily
    var body: some View {
        let f = TownFace(s: s, date: date, family: family)
        f.widgetURL(URL(string: "catnest://open/home")).containerBackground(for: .widget) { f.scene }
    }
}

#if os(iOS)
/// The iPhone's widgets ask the town themselves, about every half hour, so they stay
/// current when the app isn't running. The app leaves them the town's address in the app
/// group and a copy of the session in a Keychain item only this app and its widgets can read.
enum WidgetLink {
    private static let service = "com.catnest.widget"

    static var server: URL? {
        UserDefaults(suiteName: WidgetSnapshot.group)?.string(forKey: "server").flatMap(URL.init(string:))
    }

    static var token: String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "session",
            kSecAttrAccessGroup as String: WidgetSnapshot.group,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let d = item as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    private static let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpShouldSetCookies = false
        c.timeoutIntervalForRequest = 15
        return URLSession(configuration: c)
    }()

    static func refresh() async {
        // every widget on the screen asks at about the same moment; one answer will do
        if let s = WidgetSnapshot.load(), s.signedIn, Date().timeIntervalSince(s.at) < 60 { return }
        guard let server, let token else {
            WidgetSnapshot.clear()
            return
        }
        _ = await WidgetFeed.refresh(server: server, session: session) { r in
            r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            r.setValue("CatNestApp/1.0 iOS-widget", forHTTPHeaderField: "User-Agent")
            r.setValue("1", forHTTPHeaderField: "x-catnest")
        }
    }
}
#endif
