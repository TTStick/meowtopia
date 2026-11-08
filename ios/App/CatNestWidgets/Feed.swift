import Foundation

/// Asks the town how the cat is doing (the same endpoint as the watch app) and keeps the answer
/// for the widgets. The iPhone's widgets call this themselves; on the Mac the menu bar app does.
enum WidgetFeed {
    /// name on disk -> pose on the server
    private static let frames = ["sit": "sit", "loaf": "loaf", "groom": "groom", "happy": "happy", "beg": "beg", "sleep": "sleep1"]

    private struct Home: Decodable {
        struct Stats: Decodable { let hunger: Double; let energy: Double; let mood: Double }
        struct Cat: Decodable { let id: String; let name: String; let out: Bool; let sleepy: Bool; let away: String?; let stats: Stats; let mood: String; let days: Int?; let look: String }
        struct Show: Decodable { let name: String; let live: Bool; let gathering: Bool; let rainedOff: Bool }
        struct Town: Decodable { let time: String; let phase: String; let weather: String; let season: String; let show: Show?; let mode: String }
        struct Trip: Decodable { let place: String?; let goingHome: Bool? }
        struct WishState: Decodable {
            struct Wish: Decodable { let text: String; let need: Int }
            let wish: Wish
            let progress: Int
            let done: Bool
        }
        let town: Town
        let unread: Int?
        let cat: Cat?
        let trip: Trip?
        let wish: WishState?
    }

    enum Outcome { case changed, same, signedOut, unreachable }

    /// `sign` adds whatever says who's asking (a bearer token, or the Mac app's cookie).
    static func refresh(server: URL, session: URLSession, sign: (inout URLRequest) -> Void) async -> Outcome {
        guard let url = URL(string: "/api/watch", relativeTo: server)?.absoluteURL else { return .unreachable }
        var req = URLRequest(url: url)
        sign(&req)
        guard let (data, res) = try? await session.data(for: req), let http = res as? HTTPURLResponse else { return .unreachable }
        if http.statusCode == 401 {
            let changed = WidgetSnapshot.load()?.signedIn != false
            WidgetSnapshot.clear()
            WidgetSnapshot().save()
            return changed ? .signedOut : .same
        }
        guard http.statusCode == 200, let h = try? JSONDecoder().decode(Home.self, from: data) else { return .unreachable }

        var s = WidgetSnapshot()
        s.signedIn = true
        s.time = h.town.time
        s.phase = h.town.phase
        s.weather = h.town.weather
        s.season = h.town.season
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
            s.goingHome = h.trip?.goingHome
            s.visiting = c.away
            s.days = c.days
            s.look = c.look
        }
        if let w = h.wish {
            s.wish = w.wish.text
            s.wishProgress = w.progress
            s.wishNeed = w.wish.need
            s.wishDone = w.done
        }

        // the pictures come first, so the widgets never show a new look's facts with an old look's picture
        var pictures = false
        if let c = h.cat, WidgetSnapshot.load()?.look != c.look || WidgetSnapshot.image("sit") == nil {
            for (name, pose) in frames {
                guard let u = URL(string: "/api/sprite/cat/\(c.id)/\(pose)?size=256&outline=1&v=\(c.look)", relativeTo: server)?.absoluteURL else { continue }
                var r = URLRequest(url: u)
                sign(&r)
                if let (d, res) = try? await session.data(for: r), (res as? HTTPURLResponse)?.statusCode == 200 {
                    WidgetSnapshot.saveImage(d, frame: name)
                    pictures = true
                }
            }
        }
        return s.save() || pictures ? .changed : .same
    }
}
