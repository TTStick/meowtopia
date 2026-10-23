import AppKit
import Network
import WebKit
import UserNotifications

/// Keeps the menu bar cat and the letter notifications up to date from native code.
/// (A page that isn't on screen gets suspended by WebKit, so it can't be relied on.)
/// Uses the same sign-in as the pages: the session cookie in the shared web data store.
@MainActor
final class CompanionSync: NSObject, URLSessionDelegate {
    struct Home: Decodable {
        struct Cat: Decodable { let id: String; let name: String; let out: Bool; let sleepy: Bool; let look: String; let mood: String }
        struct Letter: Decodable { let id: Int; let title: String; let text: String; let seen: Bool }
        let cat: Cat?
        let unread: Int?
        let letters: [Letter]?
    }

    var onUpdate: ((_ signedIn: Bool, _ home: Home?) -> Void)?
    /// The network is back (after the Mac woke or started, or Wi-Fi came back).
    var onOnline: (() -> Void)?
    private var timer: Timer?
    private var retry: Timer?
    private var inFlight = false
    private var failures = 0
    private let network = NWPathMonitor()
    private var online = true
    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpShouldSetCookies = false
        c.timeoutIntervalForRequest = 20
        return URLSession(configuration: c, delegate: self, delegateQueue: .main)
    }()

    nonisolated func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        Server.handle(challenge)
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 90, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.poll() }
        }
        timer?.tolerance = 15
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.poll() }
        }
        network.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            MainActor.assumeIsolated {
                guard let self, up != self.online else { return }
                self.online = up
                if up {
                    self.poll()
                    self.onOnline?()
                }
            }
        }
        network.start(queue: .main)
        poll()
    }

    /// Couldn't reach the town: ask again soon rather than in a minute and a half (10 s, 20 s, 40 s, then every 80 s).
    private func retrySoon() {
        failures += 1
        retry?.invalidate()
        retry = Timer.scheduledTimer(withTimeInterval: min(80, 10 * pow(2, Double(failures - 1))), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated { self?.poll() }
        }
    }

    func poll() {
        guard !inFlight else { return }
        inFlight = true
        Task {
            defer { inFlight = false }
            let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            guard let sid = Self.session(in: cookies, for: Server.base) else {
                onUpdate?(false, nil)
                return
            }
            var req = URLRequest(url: Server.url("/api/companion"))
            req.setValue("cn_sid=\(sid.value)", forHTTPHeaderField: "Cookie")
            req.setValue(Server.userAgent, forHTTPHeaderField: "User-Agent")
            guard let (data, res) = try? await session.data(for: req), let http = res as? HTTPURLResponse else {
                retrySoon() // offline: keep what we show
                DebugDump.note("companion: town unreachable, asking again soon")
                return
            }
            failures = 0
            await keepCookie(http)
            if http.statusCode == 401 {
                onUpdate?(false, nil)
                return
            }
            guard http.statusCode == 200, let home = try? JSONDecoder().decode(Home.self, from: data) else { return }
            DebugDump.note("companion: \(home.cat?.name ?? "no cat")")
            onUpdate?(true, home)
            notifyNew(home.letters ?? [])
        }
    }

    /// The sign-in cookie the pages would send to this town: one for exactly this host (or a domain
    /// cookie covering it), secure ones only over https, the latest if there are several.
    static func session(in cookies: [HTTPCookie], for base: URL) -> HTTPCookie? {
        let host = base.host ?? ""
        let https = base.scheme == "https"
        let now = Date()
        return cookies
            .filter { c in
                c.name == "cn_sid" && !c.value.isEmpty
                    && (c.domain == host || (c.domain.hasPrefix(".") && ".\(host)".hasSuffix(c.domain)))
                    && (https || !c.isSecure)
                    && (c.expiresDate.map { $0 > now } ?? true)
            }
            .max { ($0.expiresDate ?? .distantFuture) < ($1.expiresDate ?? .distantFuture) }
    }

    /// The town renews the sign-in now and then (Set-Cookie with a later expiry). This request
    /// doesn't use the pages' cookie jar, so hand the renewed cookie over, or the pages' copy
    /// would run out one day although the town still knows the session.
    private func keepCookie(_ http: HTTPURLResponse) async {
        guard let url = http.url, let fields = http.allHeaderFields as? [String: String] else { return }
        for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) where c.name == "cn_sid" && !c.value.isEmpty {
            await WKWebsiteDataStore.default().httpCookieStore.setCookie(c)
        }
    }

    private func notifyNew(_ letters: [Home.Letter]) {
        guard let newest = letters.map(\.id).max() else { return }
        let key = "lastNotifiedLetter@\(Server.base.host ?? "")" // letter numbers belong to one town
        let last = UserDefaults.standard.integer(forKey: key)
        UserDefaults.standard.set(max(last, newest), forKey: key)
        guard last > 0 else { return } // first run: don't replay old letters
        for l in letters.filter({ $0.id > last && !$0.seen }).reversed() {
            Task {
                let center = UNUserNotificationCenter.current()
                let s = await center.notificationSettings()
                guard s.authorizationStatus == .authorized || s.authorizationStatus == .provisional else { return }
                let c = UNMutableNotificationContent()
                c.title = l.title
                c.body = l.text
                c.sound = .default
                try? await center.add(UNNotificationRequest(identifier: "letter-\(l.id)", content: c, trigger: nil))
            }
        }
    }
}
