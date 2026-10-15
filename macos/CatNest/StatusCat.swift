import AppKit

/// Your cat, living in the menu bar. Frames come from the server (drawn with the
/// game's own art); the little life in between (blinks, tail flicks, grooming,
/// snoozing) is timed here.
@MainActor
final class StatusCat: NSObject, URLSessionDelegate {
    enum Mode: Equatable { case signedOut, awake, sleepy, away }

    static let frameNames = ["sit", "sit2", "blink", "happy", "meow", "groom", "loaf", "yawn", "sleep1", "sleep2"]
    static let point: CGFloat = 22

    private weak var button: NSStatusBarButton?
    private(set) var frames: [String: NSImage] = [:]
    private var catId: String?
    private var look = ""
    private(set) var mode: Mode = .signedOut
    private var name = ""
    var unread = 0 { didSet { if unread != oldValue { shown = nil } } }

    private var timer: Timer?
    private var override: (frame: String, until: Date)?
    private var happyUntil = Date.distantPast
    private var nextBlink = Date()
    private var nextGesture = Date().addingTimeInterval(12)
    private var shown: String?
    private lazy var session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)

    init(button: NSStatusBarButton) {
        self.button = button
        super.init()
        button.imagePosition = .imageOnly
        show(symbol: "cat.fill", tip: "猫窝")
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
            Task { await loadFrames(catId) }
        }
    }

    /// A happy face for a moment (after being petted, fed…).
    func cheer() {
        happyUntil = Date().addingTimeInterval(2.6)
    }

    private func loadFrames(_ id: String) async {
        var loaded: [String: NSImage] = [:]
        await withTaskGroup(of: (String, NSImage?).self) { group in
            for f in Self.frameNames {
                group.addTask { @MainActor in
                    let url = Server.url("/api/sprite/cat/\(id)/\(f)?size=44&outline=1")
                    guard let (data, res) = try? await self.session.data(from: url),
                          (res as? HTTPURLResponse)?.statusCode == 200,
                          let img = NSImage(data: data) else { return (f, nil) }
                    img.size = NSSize(width: Self.point, height: Self.point)
                    return (f, img)
                }
            }
            for await (f, img) in group { if let img { loaded[f] = img } }
        }
        guard id == catId, loaded["sit"] != nil else { return }
        frames = loaded
        composites.removeAll()
        shown = nil
    }

    // MARK: animation

    private func tick() {
        let now = Date()
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
