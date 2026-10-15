import AppKit
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
    private var timer: Timer?
    private var inFlight = false
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
        poll()
    }

    func poll() {
        guard !inFlight else { return }
        inFlight = true
        Task {
            defer { inFlight = false }
            let host = Server.base.host ?? ""
            let cookies = await WKWebsiteDataStore.default().httpCookieStore.allCookies()
            guard let sid = cookies.first(where: { $0.name == "cn_sid" && host.hasSuffix($0.domain.trimmingCharacters(in: CharacterSet(charactersIn: "."))) }) else {
                onUpdate?(false, nil)
                return
            }
            var req = URLRequest(url: Server.url("/api/companion"))
            req.setValue("cn_sid=\(sid.value)", forHTTPHeaderField: "Cookie")
            req.setValue("CatNestMac/1.0", forHTTPHeaderField: "User-Agent")
            guard let (data, res) = try? await session.data(for: req), let http = res as? HTTPURLResponse else { return } // offline: keep what we show
            if http.statusCode == 401 {
                onUpdate?(false, nil)
                return
            }
            guard http.statusCode == 200, let home = try? JSONDecoder().decode(Home.self, from: data) else { return }
            onUpdate?(true, home)
            notifyNew(home.letters ?? [])
        }
    }

    private func notifyNew(_ letters: [Home.Letter]) {
        guard let newest = letters.map(\.id).max() else { return }
        let key = "lastNotifiedLetter"
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
