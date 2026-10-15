import SwiftUI
import WatchKit

private let coral = Color(red: 0.94, green: 0.54, blue: 0.36)

struct WelcomeView: View {
    @Environment(Store.self) private var store
    @State private var hero: UIImage?
    @State private var pairing = Debug.screen == "pair"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    Group {
                        if let hero { Image(uiImage: hero).resizable().scaledToFit() } else { Color.clear }
                    }
                    .frame(height: 86)
                    Text("猫窝").font(.title3.bold())
                    Text("一只只属于你的小猫").font(.footnote).foregroundStyle(.secondary)
                    Button("用手机或电脑登录") { pairing = true }
                        .buttonStyle(.borderedProminent)
                        .tint(coral)
                    NavigationLink("在手表上养一只") { StartHereView() }
                }
                .padding(.horizontal, 4)
            }
            .navigationDestination(isPresented: $pairing) { PairView() }
        }
        .task {
            if let d = try? await API.shared.data("/api/sprite/seed/951/happy?size=200&outline=1") { hero = UIImage(data: d) }
        }
    }
}

/// Like signing in on a TV: show a code here, type it on a device that is signed in.
struct PairView: View {
    @Environment(Store.self) private var store

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                switch store.pairing {
                case .waiting(let code):
                    Text(spaced(code))
                        .font(.system(size: 26, weight: .bold, design: .monospaced))
                        .minimumScaleFactor(0.6)
                        .padding(.vertical, 4)
                    Text("在手机或电脑上打开猫窝 → 设置 → 登录手表，输入这个码")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    ProgressView().padding(.top, 4)
                case .expired:
                    Text("码过期了").font(.footnote)
                    Button("换一个码") { store.startPairing(fresh: true) }
                case .failed(let msg):
                    Text(msg).font(.footnote).multilineTextAlignment(.center)
                    Button("再试一次") { store.startPairing(fresh: true) }
                case .idle:
                    ProgressView()
                }
            }
        }
        .navigationTitle("配对登录")
        .onAppear { store.startPairing() }
    }

    private func spaced(_ c: String) -> String {
        c.count == 6 ? "\(c.prefix(3)) \(c.suffix(3))" : c
    }
}

/// A brand-new nest, made right on the watch.
struct StartHereView: View {
    @Environment(Store.self) private var store
    @State private var working = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("会在手表上开一个新的猫窝。以后想在手机或电脑上也玩，在「更多 → 找回码」生成一串码，用它就能在别处登录。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if working {
                    ProgressView("正在准备猫窝…")
                } else {
                    Button("开始") { Task { await start() } }
                        .buttonStyle(.borderedProminent)
                        .tint(coral)
                }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }
        }
        .navigationTitle("新的猫窝")
    }

    private func start() async {
        working = true
        defer { working = false }
        do {
            let pow: API.Pow = try await API.shared.send("GET", "/api/auth/pow")
            let n = await Task.detached(priority: .userInitiated) { API.shared.solve(pow) }.value
            let body: [String: Any] = [
                "nickname": "铲屎官",
                "client": "app",
                "tzOffset": -TimeZone.current.secondsFromGMT() / 60,
                "pow": ["c": pow.c, "d": pow.d, "e": pow.e, "s": pow.s, "n": n],
            ]
            let r: TokenReply = try await API.shared.send("POST", "/api/auth/guest", body)
            if let t = r.token { await store.signIn(token: t) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct AdoptView: View {
    @Environment(Store.self) private var store
    @State private var seeds: [UInt32] = (0..<3).map { _ in UInt32.random(in: 1...2_000_000_000) }
    @State private var pics: [UInt32: UIImage] = [:]
    @State private var pick = 0
    @State private var name = "团子"
    @State private var busy = false

    static let names = ["团子", "年糕", "芝麻", "豆包", "布丁", "奶茶", "汤圆", "麻薯", "雪球", "花卷", "糯米", "栗子", "煤球", "柚子", "豆豆", "毛毛", "饭团", "桃桃", "小满", "咕噜", "蛋挞", "云朵", "奶糖", "泡芙"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 6) {
                    Text("谁会是你的猫猫？").font(.headline)
                    TabView(selection: $pick) {
                        ForEach(Array(seeds.enumerated()), id: \.offset) { i, s in
                            Group {
                                if let img = pics[s] { Image(uiImage: img).resizable().scaledToFit() } else { ProgressView() }
                            }
                            .tag(i)
                        }
                    }
                    .tabViewStyle(.page)
                    .frame(height: 110)
                    Picker("名字", selection: $name) {
                        ForEach(Self.names, id: \.self) { Text($0) }
                    }
                    .frame(height: 50)
                    Button(busy ? "…" : "带\(name)回家") { Task { await adopt() } }
                        .buttonStyle(.borderedProminent)
                        .tint(coral)
                        .disabled(busy)
                }
            }
            .navigationTitle("领养")
        }
        .task {
            name = Self.names.randomElement() ?? "团子"
            for s in seeds {
                if let d = try? await API.shared.data("/api/sprite/seed/\(s)/sit?size=200&outline=1") { pics[s] = UIImage(data: d) }
            }
        }
    }

    private func adopt() async {
        busy = true
        defer { busy = false }
        do {
            _ = try await API.shared.send("POST", "/api/adopt", ["name": name, "seed": seeds[pick]], as: Empty.self)
            WKInterfaceDevice.current().play(.success)
            await store.refresh()
        } catch {
            store.speak(error.localizedDescription)
        }
    }
}
