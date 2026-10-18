import SwiftUI
import WatchKit

/// The nest: the cat, what it says, and the things to do together. Turning the
/// Digital Crown strokes it (顺毛), the same as in the iPhone's companion watch app.
struct HomeScreen: View {
    @Environment(Nest.self) private var nest
    @State private var crown = 0.0
    @State private var lastStroke = 0.0
    @State private var strokes = 0
    @State private var showFeed = false
    @State private var showMenu = false
    @State private var showLetters = false
    @State private var debugScreen: String?

    var body: some View {
        NavigationStack {
            ZStack {
                Sky(night: nest.night)
                VStack(spacing: 2) {
                    if nest.shut, let t = nest.home?.town {
                        Text(t.mode == "paused" ? "小镇暂停开放 · 可以把猫带走" : "小镇要关门了 · 记得把猫带走")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(coral, in: Capsule())
                    }
                    if let say = nest.say { Bubble(text: say) }
                    Spacer(minLength: 0)
                    if let c = nest.cat {
                        if c.out {
                            OutingCard(cat: c, trip: nest.home?.trip)
                        } else if let host = c.away {
                            VStack(spacing: 6) {
                                Cushion()
                                Text("\(c.name)在\(host)家做客").font(.footnote).foregroundStyle(nest.night ? .white : ink)
                            }
                        } else {
                            CatView(frames: nest.frames, sleepy: c.sleepy, reaction: nest.reaction, hearts: nest.hearts)
                                .frame(maxHeight: 130)
                                .contentShape(Rectangle())
                                .onTapGesture { Task { await nest.act("pet") } }
                                .accessibilityAddTraits(.isButton)
                                .accessibilityHint("轻点摸摸它，转动表冠给它顺毛")
                        }
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: nest.say)
                .padding(.bottom, 2)
            }
            // turning the Digital Crown strokes the cat (顺毛): a soft click each stroke, a purr every fifth
            .focusable()
            .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 0.1, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: false)
            .onChange(of: crown) { _, v in
                guard let c = nest.cat, !c.out, c.away == nil, !nest.shut, abs(v - lastStroke) > 1.2 else { return }
                lastStroke = v
                strokes += 1
                WKInterfaceDevice.current().play(.click)
                if strokes % 5 == 0 { Task { await nest.act("pet") } } else { nest.hearts += strokes % 2 }
            }
            .navigationTitle(nest.cat?.name ?? "猫窝")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let c = nest.cat {
                        Text(c.out ? "探险中" : c.away != nil ? "做客中" : c.sleepy ? "睡着了" : c.mood)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(nest.night ? Color.white.opacity(0.8) : ink.opacity(0.75))
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showLetters = true } label: {
                        Image(systemName: (nest.home?.unread ?? 0) > 0 ? "envelope.badge.fill" : "envelope")
                    }
                    .accessibilityLabel((nest.home?.unread ?? 0) > 0 ? "信箱，有新信" : "信箱")
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    let home = nest.cat.map { !$0.out && $0.away == nil } ?? false
                    Button { showFeed = true } label: { Image(systemName: "fork.knife") }
                        .accessibilityLabel("喂食")
                        .disabled(!home || nest.shut)
                    Button { Task { await nest.act(nest.night ? "goodnight" : "play") } } label: {
                        Image(systemName: nest.night ? "moon.zzz.fill" : "sparkles")
                    }
                    .accessibilityLabel(nest.night ? "晚安" : "逗猫")
                    .disabled(!home || nest.shut)
                    .doubleTapAction()
                    Button { showMenu = true } label: { Image(systemName: "square.grid.2x2") }
                        .accessibilityLabel("菜单")
                }
            }
            .sheet(isPresented: $showFeed) { FeedSheet() }
            .navigationDestination(isPresented: $showMenu) { MenuScreen() }
            .navigationDestination(isPresented: $showLetters) { LettersScreen() }
            .navigationDestination(item: $debugScreen) { DebugDestination(name: $0) }
        }
        .task {
            if Debug.screen == "menu" { showMenu = true }
            if Debug.screen == "feed" { showFeed = true }
            if Debug.screen == "letters" { showLetters = true }
            if let s = Debug.screen, !["menu", "feed", "letters"].contains(s) { debugScreen = s }
            if Debug.pet {
                try? await Task.sleep(for: .seconds(2))
                await nest.act("pet")
            }
            #if DEBUG
            // -CatNestDebugAct "buy:straw_hat,wear:straw_hat,feed:treat_fish,brush" runs these in order
            for step in (UserDefaults.standard.string(forKey: "CatNestDebugAct") ?? "").split(separator: ",") {
                try? await Task.sleep(for: .seconds(2))
                let p = step.split(separator: ":").map(String.init)
                switch p[0] {
                case "buy": nest.speak(await nest.buy(p[1], qty: 1) ?? "买到了\(p[1])")
                case "wear": nest.speak(await nest.wear([p[1]]) ?? "戴上了\(p[1])")
                case "bare": nest.speak(await nest.wear([]) ?? "都摘下了")
                case "feed": await nest.act("feed", item: p[1])
                case "out": await nest.outing(true)
                case "home": await nest.outing(false)
                case "talk": await nest.talk(p[1])
                // (on its own task, like the town picker's button: this screen goes away as the town changes)
                case "town": let url = p[1...].joined(separator: ":"); Task { await nest.switchTown(url) }
                default: await nest.act(p[0])
                }
            }
            #endif
        }
    }
}

/// Debug builds can open a screen straight away: -CatNestDebugScreen wardrobe|shop|status|town|…
struct DebugDestination: View {
    let name: String
    var body: some View {
        switch name {
        case "status": StatusScreen()
        case "wardrobe": WardrobeScreen()
        case "shop": ShopScreen()
        case "town": TownScreen()
        case "map": TownMapScreen()
        case "neighbors": NeighborsScreen()
        case "collection": CollectionScreen()
        case "journal": JournalScreen()
        case "settings": SettingsScreen()
        case "towns": TownsScreen()
        default: MenuScreen()
        }
    }
}

/// While the cat is out: where it is, what it found, and a way to call it home.
struct OutingCard: View {
    @Environment(Nest.self) private var nest
    let cat: WatchHome.Cat
    let trip: WatchHome.Trip?

    var body: some View {
        VStack(spacing: 4) {
            Cushion()
            Text(trip.map { "\(cat.name)在「\($0.place)」" } ?? "\(cat.name)出门探险去了")
                .font(.footnote.weight(.semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(nest.night ? .white : ink)
            if let t = trip, !t.finds.isEmpty {
                Text("捡到了 " + t.finds.suffix(3).joined(separator: "、"))
                    .font(.caption2)
                    .lineLimit(1)
                    .foregroundStyle(nest.night ? Color.white.opacity(0.7) : ink.opacity(0.7))
            }
            HStack(spacing: 6) {
                NavigationLink { TownMapScreen() } label: { Label("去看看", systemImage: "map") }
                    .tint(coral)
                Button(trip?.goingHome == true ? "回家中" : "叫回家") { Task { await nest.outing(false) } }
                    .disabled(trip?.goingHome == true || nest.shut)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
    }
}

struct FeedSheet: View {
    @Environment(Nest.self) private var nest
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                let foods = nest.home?.foods ?? []
                if foods.isEmpty { Text("没有吃的了").foregroundStyle(.secondary) }
                ForEach(foods) { f in
                    Button {
                        dismiss()
                        Task { await nest.act("feed", item: f.id) }
                    } label: {
                        HStack {
                            Text(f.name)
                            Spacer()
                            Text("×\(f.count)").foregroundStyle(.secondary)
                        }
                    }
                }
                NavigationLink {
                    ShopScreen()
                } label: {
                    Label("去商店买", systemImage: "bag")
                }
            }
            .navigationTitle("喂点什么")
        }
    }
}
