import Foundation
#if canImport(UIKit)
import UIKit
typealias PlatformImage = UIImage
#else
import AppKit
typealias PlatformImage = NSImage
#endif

/// What the widgets show (the watch's, and the iPhone's and Mac's): a few facts and
/// the cat's pictures, kept where the app and its widgets can both reach them.
struct WidgetSnapshot: Codable, Equatable {
    var at = Date()
    var signedIn = false
    var hasCat = false
    var name = ""
    var mood = ""
    var hunger = 0.0
    var energy = 0.0
    var happy = 0.0 // the mood, as a number
    var sleepy = false
    var out = false
    var place: String? // where it is while out
    var visiting: String? // whose house it's playing at
    var unread = 0
    var wish: String?
    var wishProgress = 0
    var wishNeed = 0
    var wishDone = false
    var time: String?
    var weather: String?
    var show: String?
    var showLive = false
    var showGathering = false
    var townMode = "open"
    var town = ""
    var look = ""
    // used by the home screen and desktop widgets (optional, so older saved files still load)
    var goingHome: Bool?
    var days: Int?
    var phase: String?
    var season: String?
    var isSample: Bool?

    #if os(watchOS)
    static let group = "group.com.catnest.watch"
    #elseif os(iOS)
    static let group = "group.com.catnest.app"
    #endif
    /// Tools that draw the widgets outside the app point this at a folder of their own.
    static var folder: URL?
    private static var dir: URL? {
        if let folder { return folder }
        #if os(macOS)
        // The Mac app isn't signed by a registered developer, and macOS guards app group folders against
        // such apps: a widget, which can't ask, just never gets in. So they share an ordinary folder instead
        // (see the temporary-exception entitlements), under the real home, not the sandbox's.
        let home = String(cString: getpwuid(getuid()).pointee.pw_dir)
        let d = URL(fileURLWithPath: home).appendingPathComponent("Library/Application Support/CatNest Widgets", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
        #else
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
        #endif
    }

    static func load() -> WidgetSnapshot? {
        guard let f = dir?.appendingPathComponent("snapshot.json"), let d = try? Data(contentsOf: f) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: d)
    }

    /// Saves it; says whether anything a widget shows has changed (so they're only redrawn when needed).
    @discardableResult
    func save() -> Bool {
        guard let f = Self.dir?.appendingPathComponent("snapshot.json") else { return false }
        var old = Self.load()
        old?.at = at
        #if !os(watchOS)
        old?.time = time // the desktop widgets work out the clock themselves, so a new minute is no reason to redraw
        #endif
        let changed = old != self
        // always written: `at` says how fresh it is
        try? JSONEncoder().encode(self).write(to: f, options: .atomic)
        return changed
    }

    /// The cat's pictures: sit, sleep, happy (and on the bigger widgets loaf, groom, beg).
    static func image(_ frame: String) -> PlatformImage? {
        guard let f = dir?.appendingPathComponent("cat-\(frame).png"), let d = try? Data(contentsOf: f) else { return nil }
        return PlatformImage(data: d)
    }

    /// Forgets everything saved (signed out, or another town or account).
    static func clear() {
        guard let d = dir, let files = try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: nil) else { return }
        for f in files where f.lastPathComponent == "snapshot.json" || (f.lastPathComponent.hasPrefix("cat-") && f.pathExtension == "png") {
            try? FileManager.default.removeItem(at: f)
        }
    }

    static func saveImage(_ png: Data, frame: String) {
        guard let f = dir?.appendingPathComponent("cat-\(frame).png") else { return }
        try? png.write(to: f, options: .atomic)
    }

    var status: String {
        if !signedIn { return "还没登录" }
        if !hasCat { return "还没有猫猫" }
        if townMode == "paused" { return "小镇暂停开放" }
        if townMode == "closed" { return "小镇要关门了" }
        if let v = visiting { return "在\(v)家做客" }
        if out, goingHome == true { return "在回家的路上" }
        if out { return place.map { "在\($0)" } ?? "出门探险中" }
        if sleepy { return "睡着了" }
        return mood
    }

    /// One more line for the bigger widgets: letters first, then today's wish.
    var extra: String? {
        if unread > 0 { return "有 \(unread) 封新信" }
        if let w = wish { return wishDone ? "心愿达成：\(w)" : "心愿 \(wishProgress)/\(wishNeed)：\(w)" }
        return nil
    }

    var showLine: String? {
        guard let s = show else { return nil }
        if showLive { return "正在演出：\(s)" }
        if showGathering { return "快开演了：\(s)" }
        return "今晚 19:30 \(s)"
    }

    /// For the widget gallery, before the app has run.
    static let sample = WidgetSnapshot(signedIn: true, hasCat: true, name: "汤圆", mood: "心情不错", hunger: 70, energy: 80, happy: 76, wish: "想玩逗猫棒", wishProgress: 1, wishNeed: 3, time: "19:05", weather: "晴", show: "小镇乐团", showGathering: true, town: "官方体验服")
}
