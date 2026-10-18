import Foundation
import Observation
import SwiftUI
import WatchKit

/// Everything the standalone watch app knows and does. One instance, shared by all screens.
@MainActor
@Observable
final class Nest {
    enum Phase { case loading, signedOut, adopt, ready }

    var phase: Phase = .loading
    var home: WatchHome?
    var frames: [String: UIImage] = [:]
    var say: String?
    var reaction: String?
    var hearts = 0
    var busy = false

    static let frameNames = ["sit", "sit2", "blink", "happy", "meow", "groom", "loaf", "yawn", "eat", "beg", "sleep1", "sleep2"]
    private var loadedLook = ""
    private var sayTask: Task<Void, Never>?
    private var reactTask: Task<Void, Never>?

    var cat: WatchHome.Cat? { home?.cat }
    var night: Bool { home?.night ?? false }
    /// The town is paused or closed: nothing to do but take the cat along.
    var shut: Bool { (home?.town.mode ?? "open") != "open" }

    // MARK: lifecycle

    func boot() async {
        if Debug.signOut { API.shared.token = nil }
        if API.shared.token == nil, let code = Debug.code {
            if let r: TokenReply = try? await API.shared.send("POST", "/api/auth/code", ["code": code, "client": "app"]), let t = r.token { setToken(t) }
        }
        guard API.shared.token != nil else {
            phase = .signedOut
            return
        }
        await refresh()
    }

    func refresh() async {
        do {
            let h: WatchHome = try await API.shared.send("GET", "/api/watch")
            home = h
            phase = h.cat == nil ? .adopt : .ready
            if let c = h.cat, c.look != loadedLook { await loadFrames(c) }
            if h.cat != nil { await refreshKeepsake(force: shut) }
        } catch let e as APIError where e.status == 401 {
            setToken(nil)
            phase = .signedOut
        } catch {
            if phase == .loading { phase = home == nil ? .signedOut : .ready }
            speak(error.localizedDescription)
        }
    }

    /// The session for the town we're in; each town keeps its own, so coming back means no signing in.
    private func setToken(_ t: String?) {
        API.shared.token = t
        Keychain.set(Towns.sessionKey(Config.server.absoluteString), t)
    }

    func signIn(token: String) async {
        setToken(token)
        phase = .loading
        await refresh()
    }

    func signOut() async {
        _ = try? await API.shared.send("POST", "/api/auth/logout", [:], as: Empty.self)
        setToken(nil)
        Keepsakes.drop(server: Config.server.absoluteString)
        home = nil
        frames = [:]
        loadedLook = ""
        phase = .signedOut
    }

    // MARK: towns

    /// Go to another town: keep this town's session for later, bring out the other town's.
    func switchTown(_ url: String) async {
        // leaving with the cat as it is right now (the package kept on the watch is otherwise up to a day old)
        if cat != nil { await refreshKeepsake(force: true) }
        let here = Config.server.absoluteString
        if let t = API.shared.token { Keychain.set(Towns.sessionKey(here), t) }
        Config.setServer(url)
        API.shared.token = Keychain.get(Towns.sessionKey(url))
        home = nil
        frames = [:]
        loadedLook = ""
        say = nil
        phase = .loading
        await boot()
    }

    // MARK: pairing with a phone or computer

    enum Pairing: Equatable { case idle, waiting(code: String), expired, failed(String) }
    var pairing: Pairing = .idle
    private var pairTask: Task<Void, Never>?

    func startPairing(fresh: Bool = false) {
        if !fresh, pairTask != nil, case .waiting = pairing { return }
        pairTask?.cancel()
        pairing = .idle
        pairTask = Task {
            do {
                let s: PairStart = try await API.shared.send("POST", "/api/auth/device/start", [:])
                pairing = .waiting(code: s.code)
                for _ in 0..<200 {
                    try await Task.sleep(for: .seconds(s.interval))
                    let p: PairPoll = try await API.shared.send("POST", "/api/auth/device/poll", ["secret": s.secret])
                    if p.status == "ok", let t = p.token {
                        WKInterfaceDevice.current().play(.success)
                        pairing = .idle
                        pairTask = nil
                        await signIn(token: t)
                        return
                    }
                    if p.status == "expired" { break }
                }
                pairing = .expired
            } catch is CancellationError {
            } catch {
                pairing = .failed(error.localizedDescription)
            }
            pairTask = nil
        }
    }

    // MARK: pictures of the cat (drawn by the server with the game's own art, cached here)

    nonisolated static var cacheDir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("sprites", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private func loadFrames(_ c: WatchHome.Cat) async {
        var out: [String: UIImage] = [:]
        await withTaskGroup(of: (String, UIImage?).self) { g in
            for f in Self.frameNames {
                g.addTask {
                    let file = Self.cacheDir.appendingPathComponent("\(c.id)-\(c.look)-\(f)-2.png") // -2: copies saved before the look was in the URL may be stale
                    if let d = try? Data(contentsOf: file), let img = UIImage(data: d) { return (f, img) }
                    guard let d = try? await API.shared.data("/api/sprite/cat/\(c.id)/\(f)?size=256&outline=1&v=\(c.look)"), let img = UIImage(data: d) else { return (f, nil) }
                    try? d.write(to: file)
                    return (f, img)
                }
            }
            for await (f, img) in g { if let img { out[f] = img } }
        }
        if out["sit"] != nil {
            frames = out
            loadedLook = c.look
        }
    }

    // MARK: being together

    func speak(_ text: String, for seconds: Double = 5) {
        say = text
        sayTask?.cancel()
        sayTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled { say = nil }
        }
    }

    func react(_ frame: String, for seconds: Double = 2.6) {
        reaction = frame
        reactTask?.cancel()
        reactTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled { reaction = nil }
        }
    }

    /// A purr you can feel: a few soft, uneven taps.
    func purr() {
        Task {
            for i in 0..<5 {
                if i > 0 { try? await Task.sleep(for: .milliseconds(150 + i * 12)) }
                WKInterfaceDevice.current().play(.click)
            }
        }
    }

    func act(_ kind: String, item: String? = nil) async {
        guard let c = cat, !busy else { return }
        busy = true
        defer { busy = false }
        var body: [String: Any] = ["kind": kind]
        if let item { body["item"] = item }
        do {
            let r: ActReply = try await API.shared.send("POST", "/api/cat/\(c.id)/act", body)
            switch kind {
            case "pet": react("happy"); purr(); hearts += 1
            case "feed": react("eat", for: 3.5); WKInterfaceDevice.current().play(.success)
            case "play": react("beg", for: 2); WKInterfaceDevice.current().play(.click)
            case "brush": react("groom", for: 3); WKInterfaceDevice.current().play(.click)
            case "goodnight": react("sleep1", for: 4)
            default: break
            }
            if r.wishDone == true {
                WKInterfaceDevice.current().play(.success)
                speak("心愿达成啦！")
            } else if let l: Line = try? await API.shared.send("GET", "/api/cat/\(c.id)/line?ctx=\(kind)") {
                speak(l.text)
            }
            await refresh()
        } catch {
            speak(error.localizedDescription)
            WKInterfaceDevice.current().play(.failure)
        }
    }

    func outing(_ go: Bool) async {
        guard let c = cat else { return }
        do {
            _ = try await API.shared.send("POST", "/api/cat/\(c.id)/outing", ["go": go], as: Empty.self)
            WKInterfaceDevice.current().play(go ? .start : .success)
            speak(go ? "我出门转转，晚点回来讲给你听～" : "听到你叫我了，马上回来！")
            try? await Task.sleep(for: .milliseconds(600))
            await refresh()
        } catch {
            speak(error.localizedDescription)
            WKInterfaceDevice.current().play(.failure)
        }
    }

    func talk(_ text: String) async {
        guard let c = cat, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        speak("…")
        do {
            let r: Command = try await API.shared.send("POST", "/api/cat/\(c.id)/command", ["text": text, "where": c.out ? "world" : "nest"])
            speak(r.reply, for: 6)
            switch r.action {
            case "explore" where !c.out, "goto" where !c.out: await outing(true)
            case "home" where c.out: await outing(false)
            case "sleep": react("sleep1", for: 4)
            case "meow": react("meow"); WKInterfaceDevice.current().play(.click)
            case "groom": react("groom")
            case "eat": react("eat")
            default: break
            }
        } catch {
            speak(error.localizedDescription)
        }
    }

    /// Returns an error message, or nil when it worked.
    func buy(_ item: String, qty: Int) async -> String? {
        do {
            _ = try await API.shared.send("POST", "/api/shop/buy", ["item": item, "qty": qty], as: Empty.self)
            WKInterfaceDevice.current().play(.success)
            await refresh()
            return nil
        } catch {
            WKInterfaceDevice.current().play(.failure)
            return error.localizedDescription
        }
    }

    func wear(_ outfit: [String]) async -> String? {
        guard let c = cat else { return nil }
        do {
            _ = try await API.shared.send("POST", "/api/cat/\(c.id)/outfit", ["outfit": outfit], as: Empty.self)
            WKInterfaceDevice.current().play(.success)
            await refresh()
            return nil
        } catch {
            WKInterfaceDevice.current().play(.failure)
            return error.localizedDescription
        }
    }

    // MARK: the moving package kept on the watch

    /// About once a day, a fresh signed copy of the cat, so it can leave even a town that closes.
    func refreshKeepsake(force: Bool = false) async {
        guard let c = cat else { return }
        let server = Config.server.absoluteString
        if !force, let k = Keepsakes.all[server], Date().timeIntervalSince1970 * 1000 - k.at < 20 * 3600_000 { return }
        guard let pkg: MovePackage = try? await API.shared.send("POST", "/api/move/export", ["keep": true]) else { return }
        Keepsakes.keep(Kept(server: server, at: Date().timeIntervalSince1970 * 1000, cat: c.name, pkg: pkg))
    }
}

// MARK: - towns

enum Towns {
    static let official = "https://mycat.xioix.xin"
    private static let key = "towns"

    static func sessionKey(_ server: String) -> String { "session@\(server)" }

    /// The official town first, then any the player added; the current town is always listed.
    static var list: [String] {
        var out = [official]
        for u in [Config.server.absoluteString] + (UserDefaults.standard.stringArray(forKey: key) ?? []) where !out.contains(u) { out.append(u) }
        return out
    }

    static func add(_ url: String) {
        guard url != official else { return }
        var l = (UserDefaults.standard.stringArray(forKey: key) ?? []).filter { $0 != url }
        l.append(url)
        UserDefaults.standard.set(l, forKey: key)
    }

    static func remove(_ url: String) {
        UserDefaults.standard.set((UserDefaults.standard.stringArray(forKey: key) ?? []).filter { $0 != url }, forKey: key)
    }

    static func name(_ url: String) -> String {
        guard url != official, let u = URL(string: url), let host = u.host else { return url == official ? "官方体验服" : url }
        return host + (u.port.map { ":\($0)" } ?? "")
    }

    /// "cat.example.com" → "https://cat.example.com"; nil if it isn't a web address.
    static func normalize(_ input: String) -> String? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !s.isEmpty else { return nil }
        if !s.contains("://") { s = (s.hasPrefix("localhost") || s.hasPrefix("127.0.0.1") ? "http://" : "https://") + s }
        guard let u = URL(string: s), let host = u.host, host.contains(".") || host == "localhost", let scheme = u.scheme else { return nil }
        return "\(scheme)://\(host)\(u.port.map { ":\($0)" } ?? "")"
    }

    /// Is a town there? Its public status, asked without our session (it belongs to another town).
    static func check(_ url: String) async -> TownStatus? {
        guard let u = URL(string: url + "/api/status") else { return nil }
        var req = URLRequest(url: u, timeoutInterval: 8)
        req.setValue("CatNestWatch/1.0 watchOS", forHTTPHeaderField: "User-Agent")
        guard let (data, res) = try? await URLSession.shared.data(for: req), (res as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(TownStatus.self, from: data)
    }
}

// MARK: - moving packages

struct MovePackage: Codable {
    let format: String
    let v: Int
    let key: String
    let body: String
    let sig: String

    var asJSON: [String: Any] { ["format": format, "v": v, "key": key, "body": body, "sig": sig] }
}

struct Kept: Codable, Identifiable {
    let server: String
    let at: Double
    let cat: String
    let pkg: MovePackage
    var id: String { server }
}

enum Keepsakes {
    private static var file: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d.appendingPathComponent("keepsakes.json")
    }

    static var all: [String: Kept] {
        guard let d = try? Data(contentsOf: file) else { return [:] }
        return (try? JSONDecoder().decode([String: Kept].self, from: d)) ?? [:]
    }

    static func keep(_ k: Kept) {
        var a = all
        a[k.server] = k
        try? JSONEncoder().encode(a).write(to: file, options: .atomic)
    }

    static func drop(server: String) {
        var a = all
        a.removeValue(forKey: server)
        try? JSONEncoder().encode(a).write(to: file, options: .atomic)
    }

    /// The ones from other towns: what could move in here.
    static var fromElsewhere: [Kept] {
        all.values.filter { $0.server != Config.server.absoluteString }.sorted { $0.at > $1.at }
    }
}
