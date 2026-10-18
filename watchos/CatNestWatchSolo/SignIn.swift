import SwiftUI
import WatchKit

/// Before signing in: a cat to look at, three ways in, and which town this is.
struct WelcomeScreen: View {
    @Environment(Nest.self) private var nest
    @State private var hero: UIImage?
    @State private var status: TownStatus?
    @State private var pairing = Debug.screen == "pair"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 8) {
                    Group {
                        if let hero { Image(uiImage: hero).resizable().scaledToFit() } else { Color.clear }
                    }
                    .frame(height: 80)
                    Text("猫窝").font(.title3.bold())
                    Text("一只只属于你的小猫").font(.footnote).foregroundStyle(.secondary)
                    if let m = status?.mode, m != "open" {
                        Text(m == "paused" ? "这个小镇暂停开放了。在这里养过猫的，登录后可以把它带走。" : "这个小镇要关门了。在这里养过猫的，登录后可以把它带走。")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                            .multilineTextAlignment(.center)
                    }
                    Button("用手机或电脑登录") { pairing = true }
                        .buttonStyle(.borderedProminent)
                        .tint(coral)
                    NavigationLink("用找回码登录") { CodeScreen() }
                    if (status?.mode ?? "open") == "open" {
                        NavigationLink("在手表上养一只") { StartHereScreen() }
                    }
                    NavigationLink { TownsScreen() } label: {
                        Text("小镇：\(Towns.name(Config.server.absoluteString)) · 换一个").font(.caption2)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(coral)
                    .padding(.top, 4)
                }
                .padding(.horizontal, 4)
            }
            .navigationDestination(isPresented: $pairing) { PairScreen() }
        }
        .task {
            status = await Towns.check(Config.server.absoluteString)
            if let d = try? await API.shared.data("/api/sprite/seed/951/happy?size=200&outline=1") { hero = UIImage(data: d) }
        }
    }
}

/// Like signing in on a TV: show a code here, type it on a device that is signed in.
struct PairScreen: View {
    @Environment(Nest.self) private var nest

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                switch nest.pairing {
                case .waiting(let code):
                    Text(code.count == 6 ? "\(code.prefix(3)) \(code.suffix(3))" : code)
                        .font(.system(size: 26, weight: .bold, design: .monospaced))
                        .minimumScaleFactor(0.6)
                        .padding(.vertical, 4)
                    Text("在已经登录的手机 App、Mac 或网页上打开猫窝 → 设置 → 登录手表，输入这个码")
                        .font(.footnote)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    ProgressView().padding(.top, 4)
                case .expired:
                    Text("码过期了").font(.footnote)
                    Button("换一个码") { nest.startPairing(fresh: true) }
                case .failed(let msg):
                    Text(msg).font(.footnote).multilineTextAlignment(.center)
                    Button("再试一次") { nest.startPairing(fresh: true) }
                case .idle:
                    ProgressView()
                }
            }
        }
        .navigationTitle("配对登录")
        .onAppear { nest.startPairing() }
    }
}

/// Typing (or scribbling, or saying) the 12-character recovery code.
struct CodeScreen: View {
    @Environment(Nest.self) private var nest
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("输入找回码，比如 ABCD-EFGH-JKLM").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                TextField("找回码", text: $code)
                    .textInputAutocapitalization(.characters)
                    .onSubmit { Task { await signIn() } }
                Button(busy ? "…" : "登录") { Task { await signIn() } }
                    .buttonStyle(.borderedProminent)
                    .tint(coral)
                    .disabled(busy || code.trimmingCharacters(in: .whitespaces).count < 8)
                if let error { Text(error).font(.caption2).foregroundStyle(.red) }
            }
        }
        .navigationTitle("找回码")
    }

    private func signIn() async {
        busy = true
        defer { busy = false }
        do {
            let r: TokenReply = try await API.shared.send("POST", "/api/auth/code", ["code": code, "client": "app"])
            if let t = r.token {
                WKInterfaceDevice.current().play(.success)
                await nest.signIn(token: t)
            }
        } catch {
            self.error = error.localizedDescription
            WKInterfaceDevice.current().play(.failure)
        }
    }
}

/// A brand-new nest, made right on the watch.
struct StartHereScreen: View {
    @Environment(Nest.self) private var nest
    @State private var working = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("会在这个小镇开一个新的猫窝。以后想在手机或电脑上也玩，在「设置 → 生成找回码」，用它就能在别处登录。")
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
            if let t = r.token { await nest.signIn(token: t) }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Choosing a kitten, or bringing along a cat this watch carries from another town.
struct AdoptScreen: View {
    @Environment(Nest.self) private var nest
    @State private var seeds: [UInt32] = (0..<3).map { _ in UInt32.random(in: 1...2_000_000_000) }
    @State private var pics: [UInt32: UIImage] = [:]
    @State private var pick = 0
    @State private var name = "团子"
    @State private var busy = false
    @State private var pending: MoveStatus.Request?
    @State private var debugMove = Debug.screen == "movein"

    static let names = ["团子", "年糕", "芝麻", "豆包", "布丁", "奶茶", "汤圆", "麻薯", "雪球", "花卷", "糯米", "栗子", "煤球", "柚子", "豆豆", "毛毛", "饭团", "桃桃", "小满", "咕噜", "蛋挞", "云朵", "奶糖", "泡芙"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 6) {
                    if let p = pending, p.status == "pending" {
                        NavigationLink { MoveInScreen(kept: nil) } label: {
                            Text("\(p.summary.cat.name)的搬家申请在等回复").font(.footnote)
                        }
                    } else if let k = Keepsakes.fromElsewhere.first {
                        NavigationLink { MoveInScreen(kept: k) } label: {
                            VStack(spacing: 2) {
                                Text("带\(k.cat)搬过来").font(.footnote.bold())
                                Text("手表上带着它的搬家包").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .tint(coral)
                    }
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
            .navigationDestination(isPresented: $debugMove) { MoveInScreen(kept: Keepsakes.fromElsewhere.first) }
        }
        .task {
            name = Self.names.randomElement() ?? "团子"
            let st: MoveStatus? = try? await API.shared.send("GET", "/api/move/request")
            pending = st?.request
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
            await nest.refresh()
        } catch {
            nest.speak(error.localizedDescription)
        }
    }
}

/// Moving in with a package this watch carries: ask, then wait for the town's admin to say yes.
struct MoveInScreen: View {
    @Environment(Nest.self) private var nest
    let kept: Kept?
    @State private var request: MoveStatus.Request?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                if let r = request, r.status == "pending" {
                    Image(systemName: "shippingbox").font(.title2).foregroundStyle(coral)
                    Text("\(r.summary.cat.name)的搬家申请交上去啦").font(.headline).multilineTextAlignment(.center)
                    Text("这个小镇的管理员同意以后，\(r.summary.cat.name)就会出现在这里。过一会儿再来看看。").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    ProgressView()
                } else if let k = kept {
                    if let r = request, r.status == "rejected" {
                        Text("上次的申请没有通过\(r.reason.map { "：\($0)" } ?? "")").font(.caption2).foregroundStyle(.orange)
                    }
                    Image(systemName: "pawprint.fill").font(.title2).foregroundStyle(coral)
                    Text("带\(k.cat)搬过来").font(.headline)
                    Text("来自 \(URL(string: k.server)?.host ?? k.server) · \(whenText(k.at))存的").font(.caption2).foregroundStyle(.secondary)
                    Text("交上去以后，这个小镇的管理员会看一看，同意了就搬进来。").font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Button(busy ? "…" : "申请搬进来") { Task { await ask(k) } }
                        .buttonStyle(.borderedProminent)
                        .tint(coral)
                        .disabled(busy)
                } else {
                    ProgressView()
                }
                if let error { Text(error).font(.caption2).foregroundStyle(.red) }
            }
        }
        .navigationTitle("搬家")
        .task {
            if debugAsk, let k = kept {
                let st: MoveStatus? = try? await API.shared.send("GET", "/api/move/request")
                if st?.request?.status != "pending" { await ask(k) }
            }
            // keep an eye on the request: once it's approved, the cat is home
            while !Task.isCancelled {
                let st: MoveStatus? = try? await API.shared.send("GET", "/api/move/request")
                request = st?.request
                if request?.status == "approved" {
                    WKInterfaceDevice.current().play(.success)
                    await nest.refresh()
                    return
                }
                try? await Task.sleep(for: .seconds(15))
            }
        }
    }

    #if DEBUG
    private var debugAsk: Bool { UserDefaults.standard.bool(forKey: "CatNestDebugAsk") }
    #else
    private let debugAsk = false
    #endif

    private func ask(_ k: Kept) async {
        busy = true
        defer { busy = false }
        do {
            _ = try await API.shared.send("POST", "/api/move/request", ["pkg": k.pkg.asJSON], as: Empty.self)
            WKInterfaceDevice.current().play(.success)
            let st: MoveStatus? = try? await API.shared.send("GET", "/api/move/request")
            request = st?.request
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }
}
