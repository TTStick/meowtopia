import Foundation
import Observation
import SwiftUI
import WatchKit

@MainActor
@Observable
final class Store {
    enum Phase { case loading, signedOut, adopt, ready }

    var phase: Phase = .loading
    var home: Home?
    var frames: [String: UIImage] = [:]
    var say: String?
    var reaction: String?        // a frame shown for a moment (happy, eat…)
    var hearts = 0               // bumps to float a heart
    var busy = false
    var error: String?

    static let frameNames = ["sit", "sit2", "blink", "happy", "meow", "groom", "loaf", "yawn", "eat", "beg", "sleep1", "sleep2"]
    private var loadedLook = ""
    private var sayTask: Task<Void, Never>?
    private var reactTask: Task<Void, Never>?

    var cat: Home.Cat? { home?.cat }

    // MARK: lifecycle

    func boot() async {
        if Debug.signOut { API.shared.token = nil }
        if API.shared.token == nil, let code = Debug.code {
            if let r: TokenReply = try? await API.shared.send("POST", "/api/auth/code", ["code": code, "client": "app"]), let t = r.token { API.shared.token = t }
        }
        guard API.shared.token != nil else {
            phase = .signedOut
            return
        }
        await refresh()
    }

    func refresh() async {
        do {
            let h: Home = try await API.shared.send("GET", "/api/companion")
            home = h
            phase = h.cat == nil ? .adopt : .ready
            if let c = h.cat, c.look != loadedLook { await loadFrames(c) }
            if say == nil, let line = h.line { speak(line) }
        } catch let e as APIError where e.status == 401 || e.status == 403 {
            API.shared.token = nil
            phase = .signedOut
        } catch {
            self.error = error.localizedDescription
            if phase == .loading { phase = home == nil ? .signedOut : .ready }
        }
    }

    func signIn(token: String) async {
        API.shared.token = token
        phase = .loading
        await refresh()
    }

    func signOut() async {
        _ = try? await API.shared.send("POST", "/api/auth/logout", [:], as: Empty.self)
        API.shared.token = nil
        home = nil
        frames = [:]
        loadedLook = ""
        phase = .signedOut
    }

    // MARK: pairing with a phone or computer (survives the screen being rebuilt)

    enum Pairing: Equatable { case idle, waiting(code: String), expired, failed(String) }
    var pairing: Pairing = .idle
    private var pairTask: Task<Void, Never>?

    func startPairing(fresh: Bool = false) {
        if !fresh, pairTask != nil, case .waiting = pairing { return } // already waiting on a code
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

    // MARK: sprites (drawn by the server with the game's own art, cached on the watch)

    nonisolated private static var cacheDir: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("sprites", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    private func loadFrames(_ c: Home.Cat) async {
        var out: [String: UIImage] = [:]
        await withTaskGroup(of: (String, UIImage?).self) { g in
            for f in Self.frameNames {
                g.addTask {
                    let file = Self.cacheDir.appendingPathComponent("\(c.id)-\(c.look)-\(f).png")
                    if let d = try? Data(contentsOf: file), let img = UIImage(data: d) { return (f, img) }
                    guard let d = try? await API.shared.data("/api/sprite/cat/\(c.id)/\(f)?size=256&outline=1"), let img = UIImage(data: d) else { return (f, nil) }
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

    // MARK: things to do together

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

    func buyFish() async {
        do {
            _ = try await API.shared.send("POST", "/api/shop/buy", ["item": "treat_fish", "qty": 1], as: Empty.self)
            await refresh()
        } catch {
            speak(error.localizedDescription)
        }
    }

    func markLettersSeen() async {
        _ = try? await API.shared.send("POST", "/api/events/seen", [:], as: Empty.self)
        await refresh()
    }
}
