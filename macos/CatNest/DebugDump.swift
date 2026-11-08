import AppKit
import WebKit

/// Development aid: `CatNest -CatNestDump YES` writes what the app shows (menu bar
/// frames, the open panel, the game window) as PNGs into the app container's
/// `dump/` folder, so the UI can be checked without screen recording.
@MainActor
enum DebugDump {
    #if DEBUG
    private static weak var app: AppDelegate?
    private static var started = false
    private static var dir: URL { URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("dump", isDirectory: true) }
    #endif

    static func startIfRequested(app: AppDelegate) {
        #if DEBUG
        guard UserDefaults.standard.bool(forKey: "CatNestDump") else { return }
        self.app = app
        try? FileManager.default.removeItem(at: dir)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        log("dump started, server \(Server.base.absoluteString)")
        Task {
            // -CatNestDumpDelay N: look only after N seconds (to see the app recover from a bad start)
            try? await Task.sleep(for: .seconds(UserDefaults.standard.integer(forKey: "CatNestDumpDelay")))
            // optional test sign-in: -CatNestDebugCode XXXX-XXXX-XXXX (test accounts only). Done natively:
            // a page that isn't on screen may be suspended, and then a script in it never finishes.
            if let code = UserDefaults.standard.string(forKey: "CatNestDebugCode") {
                var req = URLRequest(url: Server.url("/api/auth/code"))
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.setValue("1", forHTTPHeaderField: "x-catnest")
                req.setValue(Server.userAgent, forHTTPHeaderField: "User-Agent")
                req.httpBody = try? JSONSerialization.data(withJSONObject: ["code": code])
                if let (_, res) = try? await URLSession(configuration: .ephemeral).data(for: req), let http = res as? HTTPURLResponse, let url = http.url, let fields = http.allHeaderFields as? [String: String] {
                    log("debug sign-in: \(http.statusCode)")
                    for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) { await WKWebsiteDataStore.default().httpCookieStore.setCookie(c) }
                    app.debugCompanion.reload()
                    app.debugSync.poll()
                }
                try? await Task.sleep(for: .seconds(2))
            }
            // wait for the cat's frames to arrive
            for _ in 0..<60 where app.debugCat.frames.isEmpty && app.debugCat.mode != .signedOut {
                try? await Task.sleep(for: .milliseconds(500))
            }
            try? await Task.sleep(for: .seconds(1))
            log("mode \(app.debugCat.mode), frames \(app.debugCat.frames.keys.sorted())")
            for (name, img) in app.debugCat.frames { write(img, "frame-\(name).png") }

            app.togglePopover()
            try? await Task.sleep(for: .seconds(3))
            await snapshot(app.debugCompanion, "popover.png")

            app.openGame()
            try? await Task.sleep(for: .seconds(6))
            if let g = app.debugGameView {
                await snapshot(g, "game.png")
                // the snapshot API can skip GPU-backed canvases: ask the page for its canvas directly
                let js = "const c = document.querySelector('canvas.game'); const p = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data; return JSON.stringify({ vis: document.visibilityState, focus: document.hasFocus(), now: new Date().toString(), w: c.width, h: c.height, center: [...p], url: c.toDataURL('image/png') })"
                if let out = try? await g.callAsyncJavaScript(js, contentWorld: .page) as? String,
                   let obj = try? JSONSerialization.jsonObject(with: Data(out.utf8)) as? [String: Any] {
                    log("game page \(obj["vis"] ?? "?") focus \(obj["focus"] ?? "?") clock \(obj["now"] ?? "?"), canvas \(obj["w"] ?? 0)x\(obj["h"] ?? 0), centre pixel \(obj["center"] ?? "")")
                    if let u = obj["url"] as? String, let b64 = u.split(separator: ",").last, let d = Data(base64Encoded: String(b64)) {
                        try? d.write(to: dir.appendingPathComponent("game-canvas.png"))
                    }
                }
            }
            log("done")
            if UserDefaults.standard.bool(forKey: "CatNestDumpQuit") { NSApp.terminate(nil) }
        }
        #endif
    }

    /// A line in the system log (debug builds), readable with `log show --predicate 'process == "CatNest"'`.
    static func note(_ s: String) {
        #if DEBUG
        NSLog("[catnest-dump] %@", s)
        #endif
    }

    static func stateArrived() {
        #if DEBUG
        if app != nil, !started {
            started = true
            log("state received")
        }
        #endif
    }

    #if DEBUG
    private static func snapshot(_ wv: WKWebView, _ name: String) async {
        let cfg = WKSnapshotConfiguration()
        do {
            let img = try await wv.takeSnapshot(configuration: cfg)
            write(img, name)
        } catch {
            log("snapshot \(name) failed: \(error.localizedDescription)")
        }
    }

    private static func write(_ img: NSImage, _ name: String) {
        guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: dir.appendingPathComponent(name))
    }

    private static func log(_ s: String) {
        NSLog("[catnest-dump] %@", s)
        let f = dir.appendingPathComponent("log.txt")
        let line = "\(Date()) \(s)\n"
        if let h = try? FileHandle(forWritingTo: f) {
            h.seekToEndOfFile()
            h.write(line.data(using: .utf8)!)
            try? h.close()
        } else {
            try? line.write(to: f, atomically: true, encoding: .utf8)
        }
    }
    #endif
}
