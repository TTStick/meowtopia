import SwiftUI

/// 猫窝手表版: the whole game in small, on a watch of its own (no iPhone needed).
/// The iPhone app's own companion watch app (ios/App/CatNestWatch) carries on beside it.
@main
struct CatNestWatchSoloApp: App {
    @State private var nest = Nest()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            Group {
                switch nest.phase {
                case .loading: ProgressView()
                case .signedOut: WelcomeScreen()
                case .adopt: AdoptScreen()
                case .ready: HomeScreen()
                }
            }
            .environment(nest)
            .task { await nest.boot() }
            .onChange(of: scenePhase) { _, p in
                if p == .active, nest.phase == .ready { Task { await nest.refresh() } }
            }
        }
    }
}
