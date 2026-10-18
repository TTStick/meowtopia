import Foundation
import UIKit

/// What the watch face and the Smart Stack show: written by the app (when it's open,
/// and in the background about every half hour), read by the widgets. Only these
/// few facts and the cat's pictures are shared; the session stays in the app.
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

    static let group = "group.com.catnest.watch"
    private static var dir: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) }

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
        guard old != self else { return false }
        try? JSONEncoder().encode(self).write(to: f, options: .atomic)
        return true
    }

    /// The cat's pictures: sit, sleep, happy.
    static func image(_ frame: String) -> UIImage? {
        guard let f = dir?.appendingPathComponent("cat-\(frame).png"), let d = try? Data(contentsOf: f) else { return nil }
        return UIImage(data: d)
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
