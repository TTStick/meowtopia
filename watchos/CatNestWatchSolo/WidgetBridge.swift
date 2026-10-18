import Foundation
import UIKit
import WatchKit
import WidgetKit

/// Keeps the watch face up to date: after every refresh in the app, and in the
/// background about every half hour, it saves a few facts and the cat's pictures
/// for the widgets, and asks them to redraw only when something changed.
enum WidgetBridge {
    static let frames = ["sit": "sit", "sleep": "sleep1", "happy": "happy"]

    static func write(_ h: WatchHome?, signedIn: Bool) {
        var s = WidgetSnapshot()
        s.signedIn = signedIn
        s.town = Towns.name(Config.server.absoluteString)
        if let h {
            s.time = h.town.time
            s.weather = h.town.weather
            s.show = h.town.show?.rainedOff == true ? nil : h.town.show?.name
            s.showLive = h.town.show?.live ?? false
            s.showGathering = h.town.show?.gathering ?? false
            s.townMode = h.town.mode
            s.unread = h.unread ?? 0
            if let c = h.cat {
                s.hasCat = true
                s.name = c.name
                s.mood = c.mood
                s.hunger = c.stats.hunger
                s.energy = c.stats.energy
                s.happy = c.stats.mood
                s.sleepy = c.sleepy
                s.out = c.out
                s.place = h.trip?.place
                s.visiting = c.away
                s.look = c.look
            }
            if let w = h.wish {
                s.wish = w.wish.text
                s.wishProgress = w.progress
                s.wishNeed = w.wish.need
                s.wishDone = w.done
            }
        }
        let newLook = s.hasCat && (WidgetSnapshot.load()?.look != s.look || WidgetSnapshot.image("sit") == nil)
        if s.save() { WidgetCenter.shared.reloadAllTimelines() }
        // the pictures, small (a widget has little memory), only when the cat looks different
        if newLook, let id = h?.cat?.id {
            let look = s.look
            Task.detached { await savePictures(cat: id, look: look) }
        }
    }

    private static func savePictures(cat: String, look: String) async {
        for (name, frame) in frames {
            if let d = try? await API.shared.data("/api/sprite/cat/\(cat)/\(frame)?size=96&outline=1&v=\(look)") { WidgetSnapshot.saveImage(d, frame: name) }
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: in the background

    /// About every half hour while the app isn't open (the system decides exactly when).
    static func schedule() {
        WKApplication.shared().scheduleBackgroundRefresh(withPreferredDate: Date().addingTimeInterval(30 * 60), userInfo: nil) { _ in }
    }

    static func refreshInBackground() async {
        guard API.shared.token != nil else { return }
        guard let h: WatchHome = try? await API.shared.send("GET", "/api/watch") else { return }
        let changed = h.cat.map { WidgetSnapshot.load()?.look != $0.look } ?? false
        write(h, signedIn: true)
        if changed, let c = h.cat { await savePictures(cat: c.id, look: c.look) }
    }
}

/// Background refresh for the widgets.
final class AppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidEnterBackground() { WidgetBridge.schedule() }

    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            if let t = task as? WKApplicationRefreshBackgroundTask {
                Task {
                    await WidgetBridge.refreshInBackground()
                    WidgetBridge.schedule()
                    t.setTaskCompletedWithSnapshot(false)
                }
            } else {
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }
}
