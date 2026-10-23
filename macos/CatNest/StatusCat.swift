import AppKit

/// Your cat, living in the menu bar. Frames come from the server (drawn with the
/// game's own art); the little life in between (blinks, tail flicks, grooming,
/// snoozing) is timed here. The last frames are kept on disk, so after a restart the
/// cat is there straight away, even before the network is.
@MainActor
final class StatusCat: NSObject, URLSessionDelegate {
    enum Mode: Equatable { case signedOut, awake, sleepy, away }

    static let frameNames = ["sit", "sit2", "blink", "happy", "meow", "groom", "loaf", "yawn", "sleep1", "sleep2"]
    static let point: CGFloat = 22

    private weak var button: NSStatusBarButton?
    private(set) var frames: [String: NSImage] = [:]
    private var catId: String?
    private var look = ""
    /// Whose frames are showing ("id|look"). Until it matches catId and look, loading is tried
    /// again (a failed try, say just after the Mac starts and the network isn't up yet, isn't the end).
    private var loaded = ""
    private var loading = false
    private var failures = 0
    private var retryAt = Date.distantPast
    private(set) var mode: Mode = .signedOut
    private var name = ""
    var unread = 0 { didSet { if unread != oldValue { shown = nil } } }

    private var timer: Timer?
    private var override: (frame: String, until: Date)?
    private var happyUntil = Date.distantPast
    private var nextBlink = Date()
    private var nextGesture = Date().addingTimeInterval(12)
    private var shown: String?
    /// The pictures are public. On macOS a default session shares the pages' cookie jar, and a request
    /// with their sign-in cookie but without the app's name looks like a browser, which the town turns
    /// away while its web version is off (that kept the menu bar cat white): no cookies, and our name.
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.default
        c.httpShouldSetCookies = false
        c.httpCookieAcceptPolicy = .never
        c.httpAdditionalHeaders = ["User-Agent": Server.userAgent]
        return URLSession(configuration: c, delegate: self, delegateQueue: .main)
    }()

    init(button: NSStatusBarButton) {
        self.button = button
        super.init()
        button.imagePosition = .imageOnly
        show(symbol: "cat.fill", tip: "猫窝")
        restore()
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        timer?.tolerance = 0.05
    }

    nonisolated func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        Server.handle(challenge)
    }

    // MARK: state from the companion page

    func update(loggedIn: Bool, catId: String?, name: String, look: String, out: Bool, sleepy: Bool) {
        self.name = name
        guard loggedIn, let catId else {
            mode = .signedOut
            shown = nil
            return
        }
        mode = out ? .away : sleepy ? .sleepy : .awake
        shown = nil
        if catId != self.catId || look != self.look {
            self.catId = catId
            self.look = look
            failures = 0
            retryAt = .distantPast
        }
        loadIfNeeded()
    }

    /// A happy face for a moment (after being petted, fed…).
    func cheer() {
        happyUntil = Date().addingTimeInterval(2.6)
    }

    private func loadIfNeeded() {
        guard let id = catId, "\(id)|\(look)" != loaded, !loading, Date() >= retryAt else { return }
        loading = true
        let look = look
        Task { await loadFrames(id, look: look) }
    }

    private func loadFrames(_ id: String, look: String) async {
        defer { loading = false }
        var got: [String: Data] = [:]
        await withTaskGroup(of: (String, Data?).self) { group in
            for f in Self.frameNames {
                group.addTask { @MainActor in
                    // the look in the address: a new outfit is a new picture, never an old one from the cache
                    let url = Server.url("/api/sprite/cat/\(id)/\(f)?size=44&outline=1&v=\(look)")
                    guard !Self.debugFail(),
                          let (data, res) = try? await self.session.data(from: url),
                          (res as? HTTPURLResponse)?.statusCode == 200,
                          NSImage(data: data) != nil else { return (f, nil) }
                    return (f, data)
                }
            }
            for await (f, d) in group { if let d { got[f] = d } }
        }
        DebugDump.note("frames: \(got.count)/\(Self.frameNames.count) loaded (try \(failures + 1))")
        guard id == catId, look == self.look else { return } // someone else by now; the next tick loads them
        if got["sit"] != nil {
            frames = got.compactMapValues(Self.image)
            composites.removeAll()
            shown = nil
        }
        if got.count == Self.frameNames.count {
            loaded = "\(id)|\(look)"
            failures = 0
            save(got, id: id, look: look)
        } else {
            // try again soon, then less often: 5 s, 10 s, 20 s … at most every 5 minutes
            failures += 1
            retryAt = Date().addingTimeInterval(min(300, 5 * pow(2, Double(failures - 1))))
        }
    }

    private static func image(_ data: Data) -> NSImage? {
        let img = NSImage(data: data)
        img?.size = NSSize(width: point, height: point)
        return img
    }

    // MARK: kept on disk

    private static var store: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?.appendingPathComponent("menu-bar-cat", isDirectory: true)
    }

    private func save(_ pictures: [String: Data], id: String, look: String) {
        guard let dir = Self.store else { return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for (f, d) in pictures { try? d.write(to: dir.appendingPathComponent("\(f).png"), options: .atomic) }
        UserDefaults.standard.set(["server": Server.base.absoluteString, "id": id, "look": look, "name": name], forKey: "menuBarCat")
    }

    /// The cat from last time (in this town), until the town says how it is now.
    private func restore() {
        guard let m = UserDefaults.standard.dictionary(forKey: "menuBarCat") as? [String: String],
              m["server"] == Server.base.absoluteString, let id = m["id"], let look = m["look"], let dir = Self.store else { return }
        var got: [String: NSImage] = [:]
        for f in Self.frameNames {
            if let d = try? Data(contentsOf: dir.appendingPathComponent("\(f).png")), let img = Self.image(d) { got[f] = img }
        }
        guard got.count == Self.frameNames.count else { return }
        DebugDump.note("frames: restored \(got.count) from disk")
        frames = got
        catId = id
        self.look = look
        loaded = "\(id)|\(look)"
        name = m["name"] ?? ""
        mode = .awake
    }

    /// Debug builds: -CatNestDebugFailSprites N makes the first N picture requests fail, to try the retrying.
    private static var debugFailLeft = UserDefaults.standard.integer(forKey: "CatNestDebugFailSprites")
    private static func debugFail() -> Bool {
        #if DEBUG
        guard debugFailLeft > 0 else { return false }
        debugFailLeft -= 1
        return true
        #else
        return false
        #endif
    }

    // MARK: animation

    private func tick() {
        let now = Date()
        if mode != .signedOut { loadIfNeeded() }
        switch mode {
        case .signedOut:
            show(symbol: "cat.fill", tip: "猫窝 · 点一下登录")
            return
        case .away:
            show(symbol: "pawprint.fill", tip: "\(name)出门探险去了")
            return
        default:
            break
        }
        guard !frames.isEmpty else { return }
        var frame = "sit"
        if now < happyUntil {
            frame = "happy"
        } else if mode == .sleepy {
            frame = Int(now.timeIntervalSince1970 / 1.6) % 2 == 0 ? "sleep1" : "sleep2"
        } else if let o = override, now < o.until {
            frame = o.frame
        } else {
            override = nil
            if now >= nextBlink {
                override = ("blink", now.addingTimeInterval(0.16))
                nextBlink = now.addingTimeInterval(.random(in: 2.5...7))
                frame = "blink"
            } else if now >= nextGesture {
                let g: [(String, TimeInterval)] = [("sit2", 1.6), ("groom", 2.4), ("meow", 1.0), ("loaf", 9), ("yawn", 1.3), ("sit2", 2.2)]
                let pick = g.randomElement()!
                override = (pick.0, now.addingTimeInterval(pick.1))
                nextGesture = now.addingTimeInterval(.random(in: 14...40))
                frame = pick.0
            }
        }
        show(frame: frame)
    }

    private var composites: [String: NSImage] = [:]

    private func show(frame: String) {
        let key = "\(frame)|\(unread > 0)"
        guard key != shown, let base = frames[frame] ?? frames["sit"] else { return }
        shown = key
        var img = base
        if unread > 0 {
            img = composites[frame] ?? {
                // a little coral dot for unread letters
                let c = NSImage(size: base.size, flipped: false) { r in
                    base.draw(in: r)
                    NSColor(red: 0.94, green: 0.45, blue: 0.36, alpha: 1).setFill()
                    NSBezierPath(ovalIn: NSRect(x: r.maxX - 7, y: r.maxY - 7, width: 6, height: 6)).fill()
                    return true
                }
                composites[frame] = c
                return c
            }()
        }
        img.isTemplate = false
        button?.image = img
        let mood = mode == .sleepy ? "睡着了" : "陪着你"
        button?.toolTip = unread > 0 ? "\(name) · \(unread) 封新信" : "\(name) · \(mood)"
    }

    private func show(symbol: String, tip: String) {
        let key = "sf:\(symbol)"
        guard key != shown else { return }
        shown = key
        let img = NSImage(systemSymbolName: symbol, accessibilityDescription: tip)
        img?.isTemplate = true
        button?.image = img
        button?.toolTip = tip
    }
}
