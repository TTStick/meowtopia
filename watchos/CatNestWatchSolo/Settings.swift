import SwiftUI
import WatchKit

struct SettingsScreen: View {
    @Environment(Nest.self) private var nest
    @State private var code: String?
    @State private var confirmSignOut = false
    @State private var updating = false
    @State private var kept = Keepsakes.all[Config.server.absoluteString]

    var body: some View {
        List {
            Section("所在的小镇") {
                NavigationLink { TownsScreen() } label: {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(Towns.name(Config.server.absoluteString))
                        Text("换一个小镇").font(.caption2).foregroundStyle(coral)
                    }
                }
            }
            if let c = nest.cat {
                Section {
                    VStack(alignment: .leading, spacing: 3) {
                        if let k = kept {
                            Text("手表上带着\(k.cat)的搬家包").font(.footnote)
                            Text("最近一次：\(whenText(k.at))").font(.caption2).foregroundStyle(.secondary)
                        } else {
                            Text("还没有存搬家包").font(.footnote)
                        }
                        Text("每天自动存一份。就算这个小镇关了，换到别的小镇后，领养页就能带\(c.name)搬过去。")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Button(updating ? "正在打包…" : "现在更新") {
                        Task {
                            updating = true
                            await nest.refreshKeepsake(force: true)
                            kept = Keepsakes.all[Config.server.absoluteString]
                            updating = false
                        }
                    }
                    .disabled(updating)
                } header: {
                    Text("随身搬家包")
                }
            }
            Section {
                if let code {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(code).font(.system(.body, design: .monospaced).bold())
                        Text("只显示这一次，请记下来。在手机、电脑或别的手表上用它，就能回到这个猫窝。").font(.caption2).foregroundStyle(.secondary)
                    }
                } else {
                    Button("生成找回码") {
                        Task {
                            struct R: Decodable { let code: String }
                            if let r: R = try? await API.shared.send("POST", "/api/auth/recovery-code", [:]) { code = r.code }
                        }
                    }
                }
            } header: {
                Text("保护猫窝")
            } footer: {
                if nest.home?.user.secured == false { Text("猫窝还没上锁：换了手表就回不来了。") }
            }
            Section {
                Button("刷新") { Task { await nest.refresh() } }
                Button("退出登录", role: .destructive) { confirmSignOut = true }
            } footer: {
                if let u = nest.home?.user { Text("\(u.nickname) · \(u.fish) 小鱼干 · 猫窝手表版 \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")") }
            }
        }
        .navigationTitle("设置")
        .confirmationDialog("退出后，可以用找回码或手机配对再登录", isPresented: $confirmSignOut) {
            Button("退出登录", role: .destructive) { Task { await nest.signOut() } }
        }
    }
}

/// The towns this watch knows: the official trial town and any you add. Each keeps its own sign-in.
struct TownsScreen: View {
    @Environment(Nest.self) private var nest
    @State private var towns = Towns.list
    @State private var status: [String: TownStatus?] = [:]
    @State private var input = ""
    @State private var adding = false
    @State private var message: String?

    var body: some View {
        List {
            Section {
                ForEach(towns, id: \.self) { url in
                    let here = url == Config.server.absoluteString
                    Button {
                        guard !here else { return }
                        Task { await nest.switchTown(url) }
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 4) {
                                Text(Towns.name(url))
                                if here { Image(systemName: "checkmark").font(.caption2).foregroundStyle(coral) }
                            }
                            Text(stateText(url)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { idx in
                    for i in idx where towns[i] != Towns.official && towns[i] != Config.server.absoluteString { Towns.remove(towns[i]) }
                    towns = Towns.list
                }
            } footer: {
                Text("每个小镇是一台独立的服务器，账号和猫猫各住各的。")
            }
            Section("加一个小镇") {
                TextField("网址，比如 cat.example.com", text: $input)
                    .textContentType(.URL)
                    .onSubmit { Task { await add() } }
                if adding { ProgressView() }
                if let message { Text(message).font(.caption2).foregroundStyle(.orange) }
            }
        }
        .navigationTitle("选择小镇")
        .task {
            for url in towns { let s = await Towns.check(url); status[url] = .some(s) }
        }
    }

    private func stateText(_ url: String) -> String {
        guard let s = status[url] else { return "看看在不在…" }
        guard let s else { return "联系不上" }
        let mode = s.mode == "paused" ? "暂停开放中" : s.mode == "closed" ? "要关门了" : "开着"
        return s.trial == true ? "\(mode) · 体验服" : mode
    }

    private func add() async {
        guard let url = Towns.normalize(input) else {
            message = "这不像一个网址"
            return
        }
        adding = true
        defer { adding = false }
        guard let s = await Towns.check(url) else {
            message = "联系不上这个小镇：看看网址对不对、小镇有没有开着"
            return
        }
        Towns.add(url)
        towns = Towns.list
        status[url] = .some(s)
        input = ""
        message = nil
    }
}
