import SwiftUI
import WatchKit

// MARK: - wardrobe: turn the crown to try things on

/// One outfit at a time: the crown flips through them and the cat tries each one on.
struct WardrobeScreen: View {
    @Environment(Nest.self) private var nest
    @State private var wardrobe: Wardrobe?
    @State private var index = 0.0
    @State private var looks: [String: UIImage] = [:]
    @State private var busy = false
    @State private var message: String?

    /// About two fifths of the screen, so the button still fits on the smallest watches.
    static let pictureHeight = min(100, WKInterfaceDevice.current().screenBounds.height * 0.42)

    private enum Entry: Hashable {
        case bare
        case owned(Wardrobe.Item)
        case sale(Wardrobe.Item)
    }

    private var entries: [Entry] {
        guard let w = wardrobe else { return [] }
        return [.bare] + w.owned.map(Entry.owned) + w.forSale.map(Entry.sale)
    }

    private var current: Entry? {
        let e = entries
        guard !e.isEmpty else { return nil }
        return e[min(max(Int(index.rounded()), 0), e.count - 1)]
    }

    /// What the cat would wear: today's outfit with this one swapped into its slot.
    private func outfit(for e: Entry) -> [String] {
        let worn = wardrobe?.worn ?? []
        switch e {
        case .bare: return []
        case .owned(let it), .sale(let it):
            let slotOf = Dictionary(uniqueKeysWithValues: ((wardrobe?.owned ?? []) + (wardrobe?.forSale ?? [])).map { ($0.id, $0.slot) })
            return worn.filter { slotOf[$0] != it.slot } + [it.id]
        }
    }

    var body: some View {
        VStack(spacing: 2) {
            if let e = current, let c = nest.cat {
                let key = outfit(for: e).sorted().joined(separator: ",")
                // the picture keeps its size; the crown flips the pages
                Group {
                    if let img = looks[key] {
                        Image(uiImage: img).resizable().interpolation(.high).scaledToFit()
                    } else {
                        ProgressView()
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: Self.pictureHeight)
                .task(id: key) { await load(key, cat: c.id) }
                .accessibilityHint("转动表冠换一件")
                Text(title(e)).font(.headline).lineLimit(1)
                Text(message ?? "\(Int(index.rounded()) + 1)/\(entries.count) · \(detail(e))")
                    .font(.caption2)
                    .foregroundStyle(message == nil ? Color.secondary : Color.orange)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Button(actionTitle(e)) { Task { await act(e) } }
                    .buttonStyle(.borderedProminent)
                    .tint(coral)
                    .controlSize(.small)
                    .disabled(busy || nest.shut || isNoop(e))
            } else {
                ProgressView()
            }
        }
        .padding(.horizontal, 4)
        .focusable()
        .digitalCrownRotation($index, from: 0, through: Double(max(entries.count - 1, 0)), by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: index) { message = nil }
        .navigationTitle("衣柜")
        .task { await reload(keepPlace: false) }
    }

    private func title(_ e: Entry) -> String {
        switch e {
        case .bare: return "什么都不戴"
        case .owned(let it), .sale(let it): return it.name
        }
    }

    private func detail(_ e: Entry) -> String {
        switch e {
        case .bare: return (wardrobe?.worn.isEmpty ?? true) ? "现在就是这样" : "全部摘下来"
        case .owned(let it): return (wardrobe?.worn.contains(it.id) ?? false) ? "正戴在\(it.slotName)" : "戴在\(it.slotName)"
        case .sale(let it): return "裁缝铺有卖 · \(it.price) 小鱼干"
        }
    }

    private func actionTitle(_ e: Entry) -> String {
        switch e {
        case .bare: return "全部摘下"
        case .owned(let it): return (wardrobe?.worn.contains(it.id) ?? false) ? "摘下" : "戴上"
        case .sale: return "买下"
        }
    }

    private func isNoop(_ e: Entry) -> Bool {
        if case .bare = e { return wardrobe?.worn.isEmpty ?? true }
        return false
    }

    private func act(_ e: Entry) async {
        busy = true
        defer { busy = false }
        let worn = wardrobe?.worn ?? []
        switch e {
        case .bare:
            message = await nest.wear([])
        case .owned(let it):
            message = await nest.wear(worn.contains(it.id) ? worn.filter { $0 != it.id } : outfit(for: e))
        case .sale(let it):
            if let err = await nest.buy(it.id, qty: 1) {
                message = err
            } else {
                message = "买到啦，可以戴上了"
            }
        }
        await reload(keepPlace: true)
    }

    private func reload(keepPlace: Bool) async {
        let was = current
        wardrobe = try? await API.shared.send("GET", "/api/watch/wardrobe")
        // stay on the same piece after it moves from "for sale" to "owned"
        if keepPlace, let was {
            let id: String? = { if case .owned(let it) = was { return it.id }; if case .sale(let it) = was { return it.id }; return nil }()
            if let id, let i = entries.firstIndex(where: { if case .owned(let it) = $0 { return it.id == id }; return false }) { index = Double(i) }
        } else if let worn = wardrobe?.worn.first, let i = entries.firstIndex(where: { if case .owned(let it) = $0 { return it.id == worn }; return false }) {
            index = Double(i)
        }
        #if DEBUG
        if !keepPlace, UserDefaults.standard.integer(forKey: "CatNestDebugIndex") > 0 { index = Double(UserDefaults.standard.integer(forKey: "CatNestDebugIndex")) }
        #endif
    }

    private func load(_ key: String, cat: String) async {
        guard looks[key] == nil else { return }
        let q = key.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? key
        if let d = try? await API.shared.data("/api/sprite/cat/\(cat)/happy?size=200&outline=1&outfit=\(q)"), let img = UIImage(data: d) {
            looks[key] = img
        }
    }
}

// MARK: - shop: food, with the crown choosing how many

struct ShopScreen: View {
    @Environment(Nest.self) private var nest
    @State private var shop: ShopList?

    var body: some View {
        List {
            if let shop {
                Section {
                    Label("\(shop.fish) 小鱼干", systemImage: "fish").foregroundStyle(.secondary)
                }
                ForEach(shop.foods) { f in
                    NavigationLink {
                        BuyScreen(food: f, fish: shop.fish) { await reload() }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(f.name)
                                if f.owned > 0 { Text("家里有 \(f.owned)").font(.caption2).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text("\(f.price) 🐟").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("商店")
        .task { await reload() }
    }

    private func reload() async {
        shop = try? await API.shared.send("GET", "/api/watch/shop")
    }
}

struct BuyScreen: View {
    @Environment(Nest.self) private var nest
    @Environment(\.dismiss) private var dismiss
    let food: ShopList.Food
    let fish: Int
    let done: () async -> Void
    @State private var qty = 1.0
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        let n = Int(qty.rounded())
        let cost = food.price * n
        VStack(spacing: 4) {
            Text(food.name).font(.headline)
            Text(food.desc).font(.caption2).foregroundStyle(.secondary).lineLimit(2).multilineTextAlignment(.center)
            HStack(spacing: 14) {
                Button { qty = max(1, qty - 1) } label: { Image(systemName: "minus") }.buttonStyle(.plain)
                Text("×\(n)").font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit().frame(minWidth: 64)
                Button { qty = min(20, qty + 1) } label: { Image(systemName: "plus") }.buttonStyle(.plain)
            }
            Text("共 \(cost) 小鱼干 · 有 \(fish)").font(.caption2).foregroundStyle(cost > fish ? .red : .secondary)
            Button(busy ? "…" : "买下") {
                Task {
                    busy = true
                    message = await nest.buy(food.id, qty: n)
                    busy = false
                    if message == nil {
                        await done()
                        dismiss()
                    }
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(coral)
            .disabled(busy || cost > fish || nest.shut)
            if let message { Text(message).font(.caption2).foregroundStyle(.orange) }
        }
        .padding(.horizontal, 4)
        // the crown picks how many
        .focusable()
        .digitalCrownRotation($qty, from: 1, through: 20, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
        .navigationTitle("买几个")
    }
}
