import SwiftUI
import WatchKit

/// Everything else, like the phone app's menu: one list the crown scrolls through.
struct MenuScreen: View {
    @Environment(Nest.self) private var nest
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        List {
            if let c = nest.cat {
                Section {
                    NavigationLink { StatusScreen() } label: {
                        Row(icon: "heart.text.square", tint: .pink, title: "\(c.name)的状态", detail: "\(c.mood) · \(c.bond.name)")
                    }
                    if let w = nest.home?.wish {
                        HStack(alignment: .top) {
                            Image(systemName: w.done ? "star.fill" : "star").foregroundStyle(.yellow)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("今天的小心愿").font(.caption2).foregroundStyle(.secondary)
                                Text(w.wish.text).font(.footnote)
                            }
                            Spacer(minLength: 0)
                            Text(w.done ? "达成" : "\(w.progress)/\(w.wish.need)").font(.footnote).foregroundStyle(w.done ? .green : .secondary)
                        }
                    }
                    TextField("对\(c.name)说…", text: $text)
                        .onSubmit {
                            let t = text
                            text = ""
                            dismiss()
                            Task { await nest.talk(t) }
                        }
                        .disabled(nest.shut)
                    if c.away == nil {
                        Button {
                            dismiss()
                            Task { await nest.outing(!c.out) }
                        } label: {
                            Row(icon: c.out ? "house" : "figure.walk", tint: coral, title: c.out ? "叫它回家" : "让它出门探险", detail: nil)
                        }
                        .disabled(nest.shut)
                    }
                    if !c.out, c.away == nil {
                        Button {
                            dismiss()
                            Task { await nest.act("brush") }
                        } label: {
                            Row(icon: "comb", tint: .teal, title: "给它梳梳毛", detail: nil)
                        }
                        .disabled(nest.shut)
                    }
                }
                Section {
                    NavigationLink { LettersScreen() } label: {
                        Row(icon: "envelope", tint: .orange, title: "信箱", detail: (nest.home?.unread ?? 0) > 0 ? "\(nest.home!.unread!) 封新信" : nil)
                    }
                    NavigationLink { JournalScreen() } label: { Row(icon: "book", tint: .brown, title: "日记", detail: nil) }
                    NavigationLink { CollectionScreen() } label: { Row(icon: "sparkles", tint: .yellow, title: "收藏册", detail: nil) }
                }
                Section {
                    NavigationLink { WardrobeScreen() } label: {
                        Row(icon: "tshirt", tint: .purple, title: "衣柜", detail: c.outfit.isEmpty ? nil : c.outfit.joined(separator: "、"))
                    }
                    NavigationLink { ShopScreen() } label: {
                        Row(icon: "bag", tint: .green, title: "商店", detail: "\(nest.home?.user.fish ?? 0) 小鱼干")
                    }
                }
                Section {
                    NavigationLink { TownMapScreen() } label: {
                        Row(icon: "map", tint: coral, title: "在小镇里玩", detail: c.out ? "\(c.name)正在外面" : "带\(c.name)出门逛逛")
                    }
                    .disabled(c.away != nil)
                    NavigationLink { TownScreen() } label: {
                        Row(icon: "building.2", tint: .blue, title: "小镇近况", detail: nest.home.map { "\($0.town.time) · \($0.town.weather)" })
                    }
                    NavigationLink { NeighborsScreen() } label: { Row(icon: "house.and.flag", tint: .mint, title: "邻居", detail: nil) }
                }
            }
            Section {
                NavigationLink { SettingsScreen() } label: { Row(icon: "gearshape", tint: .gray, title: "设置", detail: Towns.name(Config.server.absoluteString)) }
            }
        }
        .navigationTitle("菜单")
    }
}

struct Row: View {
    let icon: String
    let tint: Color
    let title: String
    let detail: String?
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: icon).foregroundStyle(tint).frame(width: 20)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                if let detail { Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(1) }
            }
        }
    }
}

// MARK: - status

struct StatusScreen: View {
    @Environment(Nest.self) private var nest

    var body: some View {
        List {
            if let c = nest.cat {
                Section {
                    HStack {
                        Ring(value: c.stats.hunger, color: .orange, icon: "fork.knife", label: "饱腹")
                        Ring(value: c.stats.energy, color: .cyan, icon: "bolt.fill", label: "精力")
                        Ring(value: c.stats.mood, color: .pink, icon: "heart.fill", label: "心情")
                    }
                    .frame(maxWidth: .infinity)
                    HStack {
                        Ring(value: c.stats.clean, color: .teal, icon: "drop.fill", label: "干净")
                        Ring(value: c.stats.social, color: .purple, icon: "person.2.fill", label: "陪伴")
                    }
                    .frame(maxWidth: .infinity)
                }
                Section("羁绊") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Lv.\(c.bond.level) \(c.bond.name)").font(.headline)
                        ProgressView(value: Double(c.bond.value), total: Double(max(c.bond.next, c.bond.value, 1)))
                            .tint(.pink)
                        Text("\(c.bond.value) / \(c.bond.next)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Section("关于\(c.name)") {
                    Fact(label: "年纪", value: "\(c.stage) · 第 \(c.days) 天")
                    Fact(label: "毛色", value: c.coat)
                    if !c.traits.isEmpty { Fact(label: "性格", value: c.traits.joined(separator: "、")) }
                    Fact(label: "小癖好", value: c.quirk)
                    Fact(label: "去过", value: "\(c.places.found) / \(c.places.total) 个地方")
                    if !c.outfit.isEmpty { Fact(label: "穿着", value: c.outfit.joined(separator: "、")) }
                }
            }
        }
        .navigationTitle("状态")
    }
}

struct Fact: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            Text(value).font(.footnote)
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

// MARK: - letters

struct LettersScreen: View {
    @Environment(Nest.self) private var nest
    @State private var mail: [Mail]?

    var body: some View {
        List {
            if let mail {
                if mail.isEmpty { Text("信箱空空的").foregroundStyle(.secondary) }
                ForEach(mail) { m in
                    NavigationLink {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(m.title).font(.headline)
                                Text(whenText(m.ts)).font(.caption2).foregroundStyle(.secondary)
                                Text(m.text).font(.body)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .navigationTitle("信")
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(m.title).font(.headline).foregroundStyle(m.seen == 0 ? Color.orange : .primary).lineLimit(1)
                            Text(m.text).font(.footnote).foregroundStyle(.secondary).lineLimit(2)
                            Text(whenText(m.ts)).font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("信箱")
        .task {
            mail = (try? await API.shared.send("GET", "/api/events") as [Mail]) ?? []
            if (nest.home?.unread ?? 0) > 0 {
                _ = try? await API.shared.send("POST", "/api/events/seen", [:], as: Empty.self)
                await nest.refresh()
            }
        }
    }
}

// MARK: - the diary

struct JournalScreen: View {
    @Environment(Nest.self) private var nest
    @State private var entries: [DiaryEntry] = []
    @State private var loading = true
    @State private var more = true

    var body: some View {
        List {
            if entries.isEmpty && !loading { Text("还没有日记").foregroundStyle(.secondary) }
            ForEach(entries) { e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(whenText(e.ts)).font(.caption2).foregroundStyle(.secondary)
                    Text(e.text).font(.footnote)
                }
            }
            if loading {
                ProgressView()
            } else if more, !entries.isEmpty {
                Button("更早的日记") { Task { await load() } }
            }
        }
        .navigationTitle("日记")
        .task { await load() }
    }

    private func load() async {
        guard let c = nest.cat else { return }
        loading = true
        defer { loading = false }
        let before = entries.last.map { "?before=\(Int($0.ts))" } ?? ""
        let page: [DiaryEntry] = (try? await API.shared.send("GET", "/api/cat/\(c.id)/journal\(before)")) ?? []
        entries += page.filter { e in !entries.contains { $0.id == e.id } }
        more = page.count >= 30
    }
}

// MARK: - the collection book

struct CollectionScreen: View {
    @State private var book: Book?

    var body: some View {
        List {
            if let book {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("收藏了 \(book.found.count) / \(book.total) 种").font(.headline)
                        ProgressView(value: Double(book.found.count), total: Double(max(book.total, 1))).tint(.yellow)
                    }
                }
                if book.found.isEmpty { Text("让它出门逛逛，会捡回小宝贝的").font(.footnote).foregroundStyle(.secondary) }
                ForEach(book.found) { it in
                    NavigationLink {
                        ScrollView {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(it.name).font(.headline)
                                Text(String(repeating: "★", count: it.rarity)).foregroundStyle(.yellow)
                                Text(it.desc).font(.footnote)
                                if it.count > 0 { Text("背包里有 \(it.count) 个").font(.caption2).foregroundStyle(.secondary) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    } label: {
                        HStack {
                            Text(it.name)
                            Spacer()
                            Text(String(repeating: "★", count: it.rarity)).font(.caption2).foregroundStyle(.yellow)
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("收藏册")
        .task { book = try? await API.shared.send("GET", "/api/watch/collection") }
    }
}

// MARK: - the town

struct TownScreen: View {
    @Environment(Nest.self) private var nest

    var body: some View {
        List {
            if let h = nest.home {
                Section("小镇现在") {
                    Fact(label: "时间", value: "\(h.town.time) · \(h.town.phase)")
                    Fact(label: "天气", value: "\(h.town.season) · \(h.town.weather)")
                    if h.town.mode != "open" {
                        Fact(label: h.town.mode == "paused" ? "暂停开放" : "要关门了", value: h.town.notice)
                    }
                }
                Section("今晚的舞台") {
                    if let s = h.town.show {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.name).font(.headline)
                            Text(s.live ? "正在演出" : s.gathering ? "大家正往舞台去" : s.rainedOff ? "下雨，今晚取消了" : "\(s.at) 开始").font(.caption2).foregroundStyle(s.live ? .green : .secondary)
                            Text(s.blurb).font(.footnote).foregroundStyle(.secondary)
                        }
                    } else {
                        Text("今晚没有演出").foregroundStyle(.secondary)
                    }
                }
                if let c = h.cat {
                    Section(c.name) {
                        Fact(label: "去过", value: "\(c.places.found) / \(c.places.total) 个地方")
                        if let t = h.trip {
                            Fact(label: "现在在", value: t.place)
                            if t.places > 0 { Fact(label: "这一趟", value: "逛了 \(t.places) 个地方") }
                            if !t.finds.isEmpty { Fact(label: "捡到了", value: t.finds.joined(separator: "、")) }
                            if !t.friends.isEmpty { Fact(label: "遇见了", value: t.friends.joined(separator: "、")) }
                        }
                    }
                }
            }
        }
        .navigationTitle("小镇")
        .task { await nest.refresh() }
    }
}

// MARK: - neighbours

struct NeighborsScreen: View {
    @Environment(Nest.self) private var nest
    @State private var hood: Hood?
    @State private var knocking: Hood.House?
    @State private var message: String?

    var body: some View {
        List {
            if let message { Text(message).font(.footnote).foregroundStyle(.orange) }
            if let hood {
                if hood.houses.isEmpty { Text("小区里暂时没有邻居").foregroundStyle(.secondary) }
                ForEach(hood.houses) { h in
                    Button { knocking = h } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text("\(h.n + 1)号 · \(h.name)家")
                                if h.close { Image(systemName: "heart.fill").font(.caption2).foregroundStyle(.pink) }
                            }
                            Text(h.cats.map { $0.out ? "\($0.name)（出门了）" : $0.name }.joined(separator: "、") + " · " + doorText(h.door))
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .disabled(h.door == "closed" || nest.shut)
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("邻居")
        .task { hood = try? await API.shared.send("GET", "/api/neighbors") }
        .confirmationDialog(knocking.map { "带\(nest.cat?.name ?? "猫猫")去\($0.name)家串门？" } ?? "", isPresented: Binding(get: { knocking != nil }, set: { if !$0 { knocking = nil } })) {
            Button("去敲门") {
                guard let h = knocking, let c = nest.cat else { return }
                knocking = nil
                Task {
                    do {
                        _ = try await API.shared.send("POST", "/api/neighbors/knock", ["catId": c.id, "host": h.uid], as: Empty.self)
                        WKInterfaceDevice.current().play(.success)
                        message = h.door == "ask" ? "敲门啦，等\(h.name)开门" : "\(c.name)去\(h.name)家玩啦"
                        await nest.refresh()
                    } catch {
                        WKInterfaceDevice.current().play(.failure)
                        message = error.localizedDescription
                    }
                }
            }
        }
    }

    private func doorText(_ d: String) -> String {
        d == "open" ? "门开着" : d == "ask" ? "要先敲门" : "门先关着"
    }
}
