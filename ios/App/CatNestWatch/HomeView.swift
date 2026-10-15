import SwiftUI
import WatchKit

private let ink = Color(red: 0.29, green: 0.23, blue: 0.2)
private let cream = Color(red: 1, green: 0.97, blue: 0.92)

struct HomeView: View {
    @Environment(Store.self) private var store
    @State private var crown = 0.0
    @State private var lastStroke = 0.0
    @State private var strokes = 0
    @State private var showFeed = false
    @State private var showMore = false

    var body: some View {
        let night = store.home?.night ?? false
        NavigationStack {
            ZStack {
                Background(night: night)
                if let c = store.cat {
                    VStack(spacing: 2) {
                        if let say = store.say {
                            Text(say)
                                .font(.system(size: 13))
                                .foregroundStyle(ink)
                                .lineLimit(3)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(cream, in: RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(ink, lineWidth: 1.5))
                                .transition(.opacity.combined(with: .scale(scale: 0.9)))
                        }
                        Spacer(minLength: 0)
                        if c.out {
                            VStack(spacing: 6) {
                                Cushion()
                                Text("\(c.name)出门探险去了").font(.footnote).foregroundStyle(.secondary)
                                Button("叫它回家") { Task { await store.outing(false) } }
                                    .buttonStyle(.borderedProminent)
                                    .tint(Color(red: 0.94, green: 0.54, blue: 0.36))
                            }
                        } else {
                            CatView(frames: store.frames, sleepy: c.sleepy, reaction: store.reaction, hearts: store.hearts)
                                .frame(maxHeight: 130)
                                .contentShape(Rectangle())
                                .onTapGesture { Task { await store.act("pet") } }
                        }
                    }
                    .animation(.easeInOut(duration: 0.25), value: store.say)
                    .padding(.bottom, 2)
                }
            }
            .navigationTitle(store.cat?.name ?? "猫窝")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let c = store.cat {
                        Text(c.out ? "探险中" : c.sleepy ? "睡着了" : c.mood)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(night ? Color.white.opacity(0.8) : ink.opacity(0.75))
                    }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { showFeed = true } label: { Image(systemName: "fork.knife") }
                        .accessibilityLabel("喂食")
                        .disabled(store.cat?.out ?? true)
                    Button { Task { await store.act(store.home?.night == true ? "goodnight" : "play") } } label: {
                        Image(systemName: store.home?.night == true ? "moon.zzz.fill" : "sparkles")
                    }
                    .accessibilityLabel(store.home?.night == true ? "晚安" : "逗猫")
                    .disabled(store.cat?.out ?? true)
                    Button { showMore = true } label: {
                        Image(systemName: (store.home?.unread ?? 0) > 0 ? "envelope.badge.fill" : "ellipsis")
                    }
                    .accessibilityLabel("更多")
                }
            }
            .sheet(isPresented: $showFeed) { FeedView() }
            .sheet(isPresented: $showMore) { MoreView() }
        }
        .task {
            if Debug.screen == "more" { showMore = true }
            if Debug.screen == "feed" { showFeed = true }
            if Debug.pet {
                try? await Task.sleep(for: .seconds(2))
                await store.act("pet")
            }
        }
        // turning the Digital Crown strokes the cat (顺毛)
        .focusable()
        .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 0.1, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: false)
        .onChange(of: crown) { _, v in
            guard let c = store.cat, !c.out, abs(v - lastStroke) > 1.2 else { return }
            lastStroke = v
            strokes += 1
            WKInterfaceDevice.current().play(.click)
            if strokes % 5 == 0 { Task { await store.act("pet") } } else { store.hearts += strokes % 2 }
        }
    }
}

struct Background: View {
    let night: Bool
    var body: some View {
        LinearGradient(
            colors: night
                ? [Color(red: 0.12, green: 0.11, blue: 0.24), Color(red: 0.25, green: 0.19, blue: 0.33)]
                : [Color(red: 0.99, green: 0.93, blue: 0.82), Color(red: 0.96, green: 0.78, blue: 0.63)],
            startPoint: .top, endPoint: .bottom
        )
        .overlay {
            if night {
                Canvas { ctx, size in
                    for i in 0..<14 {
                        let x = CGFloat((i * 53) % 97) / 97 * size.width
                        let y = CGFloat((i * 31) % 59) / 59 * size.height * 0.55
                        ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 1.6, height: 1.6)), with: .color(.white.opacity(0.7)))
                    }
                }
            }
        }
        .ignoresSafeArea()
    }
}

struct FeedView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            let foods = store.home?.foods ?? []
            if foods.isEmpty {
                Text("没有吃的了").foregroundStyle(.secondary)
                Button("买一包小鱼干（8 🐟）") { Task { await store.buyFish() } }
            }
            ForEach(foods) { f in
                Button {
                    dismiss()
                    Task { await store.act("feed", item: f.id) }
                } label: {
                    HStack {
                        Text(f.name)
                        Spacer()
                        Text("×\(f.count)").foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("喂点什么")
    }
}

struct MoreView: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var confirmSignOut = false
    @State private var recoveryCode: String?

    var body: some View {
        NavigationStack {
            List {
                if let c = store.cat {
                    Section {
                        HStack {
                            Ring(value: c.stats.hunger, color: .orange, icon: "fork.knife", label: "饱腹")
                            Ring(value: c.stats.energy, color: .cyan, icon: "bolt.fill", label: "精力")
                            Ring(value: c.stats.mood, color: .pink, icon: "heart.fill", label: "心情")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    if let w = store.home?.wish {
                        Section("今天的小心愿") {
                            HStack {
                                Text(w.wish.text).font(.footnote)
                                Spacer()
                                Text(w.done ? "达成" : "\(w.progress)/\(w.wish.need)").font(.footnote).foregroundStyle(w.done ? .green : .secondary)
                            }
                        }
                    }
                    Section {
                        TextField("对\(c.name)说…", text: $text)
                            .onSubmit {
                                let t = text
                                text = ""
                                dismiss()
                                Task { await store.talk(t) }
                            }
                        Button(c.out ? "叫它回家" : "让它出门探险") {
                            dismiss()
                            Task { await store.outing(!c.out) }
                        }
                        if store.home?.night == true, !c.out {
                            Button("说晚安") {
                                dismiss()
                                Task { await store.act("goodnight") }
                            }
                        }
                    }
                    Section {
                        NavigationLink {
                            LettersView()
                        } label: {
                            HStack {
                                Text("信箱")
                                Spacer()
                                if let n = store.home?.unread, n > 0 { Text("\(n)").foregroundStyle(.orange) }
                            }
                        }
                    }
                }
                Section {
                    if let code = recoveryCode {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(code).font(.system(.body, design: .monospaced).bold())
                            Text("只显示这一次，请记下来。在手机或电脑上用它就能回到这个猫窝。").font(.footnote).foregroundStyle(.secondary)
                        }
                    } else {
                        Button("找回码") {
                            Task {
                                struct R: Decodable { let code: String }
                                if let r: R = try? await API.shared.send("POST", "/api/auth/recovery-code", [:]) { recoveryCode = r.code }
                            }
                        }
                    }
                } header: {
                    Text("保护猫窝")
                }
                Section {
                    Button("刷新") { Task { await store.refresh() } }
                    Button("退出登录", role: .destructive) { confirmSignOut = true }
                } footer: {
                    if let u = store.home?.user { Text("\(u.nickname) · 🐟 \(u.fish)") }
                }
            }
            .navigationTitle("更多")
            .confirmationDialog("退出后可以用手机重新配对登录", isPresented: $confirmSignOut) {
                Button("退出登录", role: .destructive) {
                    dismiss()
                    Task { await store.signOut() }
                }
            }
        }
    }
}

struct Ring: View {
    let value: Double
    let color: Color
    let icon: String
    let label: String
    var body: some View {
        Gauge(value: max(0, min(100, value)), in: 0...100) {
            Text(label)
        } currentValueLabel: {
            Image(systemName: icon).font(.system(size: 11))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(color)
        .accessibilityLabel("\(label) \(Int(value))")
    }
}

struct LettersView: View {
    @Environment(Store.self) private var store
    var body: some View {
        List {
            let letters = store.home?.letters ?? []
            if letters.isEmpty { Text("信箱空空的").foregroundStyle(.secondary) }
            ForEach(letters) { l in
                VStack(alignment: .leading, spacing: 2) {
                    Text(l.title).font(.headline).foregroundStyle(l.seen ? .primary : Color.orange)
                    Text(l.text).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("信箱")
        .task { await store.markLettersSeen() }
    }
}
