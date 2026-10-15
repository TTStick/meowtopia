import SwiftUI
import WatchConnectivity

@main
struct CatNestWatchApp: App {
    @State private var store = Store()
    @Environment(\.scenePhase) private var scenePhase
    private let phone = PhoneLink.shared

    var body: some Scene {
        WindowGroup {
            Group {
                switch store.phase {
                case .loading:
                    ProgressView()
                case .signedOut:
                    WelcomeView()
                case .adopt:
                    AdoptView()
                case .ready:
                    HomeView()
                }
            }
            .environment(store)
            .task {
                phone.onToken = { token in Task { @MainActor in await store.signIn(token: token) } }
                phone.start()
                await store.boot()
            }
            .onChange(of: scenePhase) { _, p in
                if p == .active, store.phase == .ready { Task { await store.refresh() } }
            }
        }
    }
}

/// When the iPhone app is installed too, it hands the watch its own session, so
/// there's nothing to type. The watch works on its own without it.
final class PhoneLink: NSObject, WCSessionDelegate, @unchecked Sendable {
    static let shared = PhoneLink()
    var onToken: ((String) -> Void)?

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    private func take(_ info: [String: Any]) {
        if let server = info["server"] as? String, !server.isEmpty { Config.setServer(server) }
        guard let token = info["token"] as? String, !token.isEmpty, API.shared.token == nil else { return }
        DispatchQueue.main.async { self.onToken?(token) }
    }

    func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        if state == .activated { take(session.receivedApplicationContext) }
    }

    func session(_ session: WCSession, didReceiveApplicationContext ctx: [String: Any]) { take(ctx) }
    func session(_ session: WCSession, didReceiveUserInfo info: [String: Any] = [:]) { take(info) }
}
