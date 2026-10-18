import SwiftUI
import WatchKit

// MARK: - what the server sends

struct TownMap: Decodable {
    struct Building: Decodable { let x: Double; let y: Double; let w: Double; let h: Double; let kind: String; let label: String?; let v: Int }
    struct Place: Decodable, Identifiable { let id: String; let name: String; let x: Double; let y: Double }
    struct RoomBox: Decodable, Identifiable { let id: String; let name: String; let x: Double; let y: Double; let w: Double; let h: Double }
    let version: Int
    let tile: Double
    let w: Int
    let h: Int
    let ter: String
    let buildings: [Building]
    let trees: [[Int]]
    let places: [Place]
    let rooms: [RoomBox]
    let home: [Double]
}

struct TownNow: Decodable {
    struct Me: Decodable { let x: Double; let y: Double; let anim: String; let walking: Bool; let place: String; let room: String?; let goingHome: Bool }
    struct Ent: Decodable, Identifiable {
        let id: String
        let kind: String // cat | town | npc
        let name: String
        let x: Double
        let y: Double
        let dir: Int
        let anim: String
        let walking: Bool
        let mine: Bool
        let owner: String?
        let role: String?
        let special: String?
        let withMe: Bool
    }
    struct Event: Decodable { let t: String; let id: String?; let text: String?; let kind: String?; let who: String? }
    let out: Bool
    let me: Me?
    let ents: [Ent]
    let events: [Event]
}

// MARK: - the map, drawn once

/// Terrain as a tiny image, one pixel per tile (scaled up without smoothing: pixel art).
enum MapArt {
    static func color(_ t: Int) -> (UInt8, UInt8, UInt8) {
        switch t {
        case 1: return (0xec, 0xdc, 0xc0) // path
        case 2: return (0xef, 0xe4, 0xd2) // plaza
        case 3: return (0xa9, 0xd6, 0xec) // water
        case 4: return (0xf4, 0xe4, 0xbf) // sand
        case 5: return (0xe6, 0xe3, 0xa8) // field
        case 6: return (0xa9, 0xcf, 0x8c) // forest
        case 7: return (0xdc, 0xb5, 0x8a) // wood (bridges, boardwalk)
        case 8: return (0xd5, 0xeb, 0xb4) // hill
        case 9: return (0x93, 0xc6, 0xe3) // deep water
        case 10: return (0xc9, 0xc6, 0xc0) // stepping stones
        case 11: return (0xb4, 0xd7, 0x9c) // bamboo
        case 12: return (0xd6, 0xeb, 0xb0) // orchard
        default: return (0xcf, 0xe6, 0xae) // grass
        }
    }

    static func image(_ m: TownMap) -> UIImage? {
        let w = m.w, h = m.h
        var px = [UInt8](repeating: 255, count: w * h * 4)
        var i = 0
        for (k, ch) in m.ter.enumerated() where k < w * h {
            let t = Int(String(ch), radix: 36) ?? 0
            var (r, g, b) = color(t)
            let x = k % w, y = k / w
            // a darker (or, on water, lighter) pixel here and there, so it reads as pixel art
            if (x * 7 + y * 13) % 11 == 0, [0, 6, 3, 9].contains(t) {
                if t == 3 || t == 9 { (r, g, b) = (min(255, r + 22), min(255, g + 18), min(255, b + 10)) } else { (r, g, b) = (r - 12, g - 10, b - 10) }
            }
            px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
            i += 4
        }
        // trees: a darker green dot on their tile
        for t in m.trees where t.count >= 2 {
            let x = Int(Double(t[0]) / m.tile), y = Int(Double(t[1]) / m.tile) - 1
            guard x >= 0, y >= 0, x < w, y < h else { continue }
            let j = (y * w + x) * 4
            let (r, g, b): (UInt8, UInt8, UInt8) = t.count > 2 && t[2] == 1 ? (0xf2, 0xb8, 0xc6) : t.count > 2 && t[2] == 2 ? (0x86, 0xb8, 0x6a) : (0x7f, 0xae, 0x63)
            px[j] = r; px[j + 1] = g; px[j + 2] = b
        }
        let data = Data(px)
        guard let provider = CGDataProvider(data: data as CFData),
              let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                               bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)
        else { return nil }
        return UIImage(cgImage: cg)
    }

    static let roofs: [Color] = [
        Color(red: 0.89, green: 0.45, blue: 0.4), Color(red: 0.42, green: 0.55, blue: 0.85), Color(red: 0.87, green: 0.55, blue: 0.68),
        Color(red: 0.47, green: 0.68, blue: 0.47), Color(red: 0.91, green: 0.67, blue: 0.31), Color(red: 0.62, green: 0.5, blue: 0.8),
    ]
}

/// Pictures of whoever is around, fetched once each.
@MainActor
@Observable
final class TownSprites {
    var images: [String: UIImage] = [:]
    private var asked: Set<String> = []

    func want(_ e: TownNow.Ent) {
        guard !e.mine, !asked.contains(e.id) else { return }
        asked.insert(e.id)
        let path = e.kind == "npc" ? "/api/sprite/npc/\(e.id)/sit?size=64&outline=1" : "/api/sprite/cat/\(e.id)/sit?size=64&outline=1"
        Task {
            if let d = try? await API.shared.data(path), let img = UIImage(data: d) { images[e.id] = img }
        }
    }
}

// MARK: - the screen

/// The cat out in the town: walk it around, meet the residents and other cats.
struct TownMapScreen: View {
    @Environment(Nest.self) private var nest
    @State private var map: TownMap?
    @State private var mapImage: UIImage?
    @State private var now: TownNow?
    @State private var sprites = TownSprites()
    // smooth movement between updates: where each one was, where it's going, since when
    @State private var from: [String: CGPoint] = [:]
    @State private var to: [String: CGPoint] = [:]
    @State private var since = Date()
    @State private var bubbles: [String: (text: String, until: Date)] = [:]
    @State private var toast: String?
    @State private var zoom = 7.0 // points per tile (the crown changes it)
    @State private var pan = CGSize.zero // world units, away from the cat
    @State private var dragStart: CGSize?
    @State private var picked: TownNow.Ent?
    @State private var showPlaces = false
    @State private var target: CGPoint?
    @State private var error: String?

    private static let step = 1.5 // seconds between updates

    var body: some View {
        ZStack(alignment: .top) {
            if let map, let mapImage {
                GeometryReader { geo in
                    TimelineView(.animation(minimumInterval: 1 / 15)) { ctx in
                        let t = min(1, ctx.date.timeIntervalSince(since) / Self.step)
                        Canvas { g, size in
                            draw(g, size: size, map: map, image: mapImage, t: t, date: ctx.date)
                        }
                    }
                    .contentShape(Rectangle())
                    .gesture(SpatialTapGesture().onEnded { tap($0.location, in: geo.size) })
                }
                .simultaneousGesture(DragGesture(minimumDistance: 8).onChanged { v in
                    let s = scale(map)
                    if dragStart == nil { dragStart = pan }
                    pan = CGSize(width: dragStart!.width - v.translation.width / s, height: dragStart!.height - v.translation.height / s)
                }.onEnded { _ in dragStart = nil })
            } else {
                ProgressView()
            }
            VStack(spacing: 2) {
                if let p = now?.me?.place { Text(p).font(.system(size: 11, weight: .semibold)).padding(.horizontal, 6).background(.black.opacity(0.35), in: Capsule()) }
                if let toast { Text(toast).font(.system(size: 11)).foregroundStyle(ink).padding(.horizontal, 8).padding(.vertical, 3).background(cream, in: Capsule()).transition(.opacity) }
                if let error { Text(error).font(.system(size: 11)).foregroundStyle(.white).padding(.horizontal, 8).background(.red.opacity(0.7), in: Capsule()) }
            }
            .padding(.top, 2)
        }
        .ignoresSafeArea(edges: .bottom)
        .navigationTitle("小镇")
        .navigationBarTitleDisplayMode(.inline)
        .focusable()
        // the crown zooms
        .digitalCrownRotation($zoom, from: 4, through: 16, by: 0.5, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
        .toolbar {
            ToolbarItemGroup(placement: .bottomBar) {
                if now?.out == true {
                    Button { showPlaces = true } label: { Image(systemName: "mappin.and.ellipse") }
                        .accessibilityLabel("去哪里")
                    Button { pan = .zero } label: { Image(systemName: "scope") }
                        .accessibilityLabel("回到猫猫身边")
                    Button { Task { await send(["t": "leave"]); toastFor("叫它回家啦") } } label: { Image(systemName: "house") }
                        .accessibilityLabel("叫它回家")
                } else if now != nil {
                    Button {
                        Task { await send(["t": "enter"]); toastFor("出门啦") }
                    } label: { Label("出门", systemImage: "figure.walk") }
                }
            }
        }
        .sheet(isPresented: $showPlaces) { placesSheet }
        .confirmationDialog(picked?.name ?? "", isPresented: Binding(get: { picked != nil }, set: { if !$0 { picked = nil } })) {
            if let e = picked { actions(for: e) }
        }
        .task { await loadMap() }
        .task {
            while !Task.isCancelled {
                await poll()
                try? await Task.sleep(for: .seconds(Self.step))
            }
        }
    }

    // MARK: drawing

    /// Points per world unit. Shops are small, so indoors it zooms in on its own.
    private func scale(_ m: TownMap) -> Double { (now?.me?.room != nil ? max(zoom, 14) : zoom) / m.tile }

    private func lerp(_ id: String, _ t: Double) -> CGPoint? {
        guard let b = to[id] else { return nil }
        guard let a = from[id] else { return b }
        return CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
    }

    /// The point the camera looks at: the cat (or home), plus however far it's been dragged.
    private func camera(_ m: TownMap, _ t: Double) -> CGPoint {
        let mine = now?.ents.first(where: { $0.mine }).flatMap { lerp($0.id, t) }
        let c = mine ?? CGPoint(x: m.home.first ?? 0, y: m.home.last ?? 0)
        return CGPoint(x: c.x + pan.width, y: c.y + pan.height)
    }

    private func draw(_ g: GraphicsContext, size: CGSize, map m: TownMap, image: UIImage, t: Double, date: Date) {
        let s = scale(m)
        let cam = camera(m, t)
        let ox = size.width / 2 - cam.x * s, oy = size.height / 2 - cam.y * s
        let pt = { (x: Double, y: Double) in CGPoint(x: ox + x * s, y: oy + y * s) }

        // inside a shop: its floor; outside: the town
        if let room = now?.me?.room, let r = m.rooms.first(where: { $0.id == room }) {
            g.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.35, green: 0.28, blue: 0.25)))
            let rect = CGRect(origin: pt(r.x, r.y), size: CGSize(width: r.w * s, height: r.h * s))
            g.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(Color(red: 0.93, green: 0.85, blue: 0.72)))
            g.stroke(Path(roundedRect: rect, cornerRadius: 4), with: .color(ink), lineWidth: 2)
        } else {
            g.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(red: 0.66, green: 0.84, blue: 0.93)))
            var gi = g
            gi.draw(Image(uiImage: image).interpolation(.none), in: CGRect(origin: pt(0, 0), size: CGSize(width: Double(m.w) * m.tile * s, height: Double(m.h) * m.tile * s)))
            let view = CGRect(origin: .zero, size: size).insetBy(dx: -40, dy: -40)
            for b in m.buildings {
                let rect = CGRect(origin: pt(b.x * m.tile, b.y * m.tile), size: CGSize(width: b.w * m.tile * s, height: b.h * m.tile * s))
                guard rect.intersects(view) else { continue }
                let roof = b.kind == "shop" ? Color(red: 0.8, green: 0.45, blue: 0.32) : MapArt.roofs[b.v % MapArt.roofs.count]
                g.fill(Path(roundedRect: rect, cornerRadius: 2), with: .color(Color(red: 0.98, green: 0.94, blue: 0.86)))
                g.fill(Path(roundedRect: CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height * 0.45), cornerRadius: 2), with: .color(roof))
                g.stroke(Path(roundedRect: rect, cornerRadius: 2), with: .color(ink.opacity(0.8)), lineWidth: 1)
                if let label = b.label, zoom >= 7 {
                    g.draw(Text(label).font(.system(size: 9, weight: .semibold)).foregroundColor(ink), at: CGPoint(x: rect.midX, y: rect.maxY + 6))
                }
            }
        }

        // where it's walking to
        if let tp = target {
            let p = pt(tp.x, tp.y)
            g.stroke(Path(ellipseIn: CGRect(x: p.x - 6, y: p.y - 3, width: 12, height: 6)), with: .color(coral), lineWidth: 2)
        }

        // everyone around, back to front
        let ents = (now?.ents ?? []).compactMap { e -> (TownNow.Ent, CGPoint)? in lerp(e.id, t).map { (e, $0) } }.sorted { $0.1.y < $1.1.y }
        for (e, w) in ents {
            let p = pt(w.x, w.y)
            guard p.x > -40, p.y > -40, p.x < size.width + 40, p.y < size.height + 40 else { continue }
            let z = s * m.tile // the zoom in effect (bigger indoors)
            let h = e.mine ? max(30, z * 3.6) : max(22, z * 2.8)
            let bob = e.walking ? abs(sin(date.timeIntervalSinceReferenceDate * 9)) * 2 : 0
            let img: UIImage? = e.mine ? (nest.frames[e.walking ? "sit" : animFrame(e.anim)] ?? nest.frames["sit"]) : sprites.images[e.id]
            if let img {
                var gg = g
                if e.dir < 0 { gg.translateBy(x: p.x * 2, y: 0); gg.scaleBy(x: -1, y: 1) }
                gg.draw(Image(uiImage: img), in: CGRect(x: p.x - h / 2, y: p.y - h - bob, width: h, height: h))
            } else {
                g.fill(Path(ellipseIn: CGRect(x: p.x - 5, y: p.y - 10, width: 10, height: 10)), with: .color(e.kind == "npc" ? .blue : .orange))
            }
            if zoom >= 6 || e.mine {
                let tag = e.kind == "npc" ? e.name : e.name
                g.draw(Text(tag).font(.system(size: e.mine ? 10 : 8, weight: e.mine ? .bold : .regular)).foregroundColor(e.mine ? coral : ink), at: CGPoint(x: p.x, y: p.y + 6))
            }
            if let b = bubbles[e.id], b.until > date {
                let text = Text(b.text).font(.system(size: 10)).foregroundColor(ink)
                let r = g.resolve(text)
                let sz = r.measure(in: CGSize(width: 110, height: 60))
                let box = CGRect(x: p.x - sz.width / 2 - 5, y: p.y - h - sz.height - 10, width: sz.width + 10, height: sz.height + 6)
                g.fill(Path(roundedRect: box, cornerRadius: 6), with: .color(cream))
                g.stroke(Path(roundedRect: box, cornerRadius: 6), with: .color(ink), lineWidth: 1)
                g.draw(r, in: box.insetBy(dx: 5, dy: 3))
            }
        }
    }

    private func animFrame(_ anim: String) -> String {
        switch anim {
        case "sleep", "curl": return "sleep1"
        case "groom": return "groom"
        case "eat": return "eat"
        case "sit_happy", "happy", "purr": return "happy"
        case "meow": return "meow"
        case "loaf": return "loaf"
        case "beg", "play": return "beg"
        default: return "sit"
        }
    }

    // MARK: talking to the town

    private func loadMap() async {
        guard map == nil else { return }
        let m: TownMap? = try? await API.shared.send("GET", "/api/watch/map")
        map = m
        if let m { mapImage = MapArt.image(m) }
    }

    private func poll() async {
        do {
            let n: TownNow = try await API.shared.send("GET", "/api/watch/town")
            let t = min(1, Date().timeIntervalSince(since) / Self.step)
            var f: [String: CGPoint] = [:], dest: [String: CGPoint] = [:]
            for e in n.ents {
                f[e.id] = lerp(e.id, t) ?? CGPoint(x: e.x, y: e.y)
                dest[e.id] = CGPoint(x: e.x, y: e.y)
                sprites.want(e)
            }
            from = f
            to = dest
            since = Date()
            now = n
            error = nil
            if let me = n.me, let tp = target, hypot(me.x - tp.x, me.y - tp.y) < 40 || !me.walking { target = nil }
            for ev in n.events {
                switch ev.t {
                case "say":
                    if let id = ev.id, let text = ev.text { bubbles[id] = (text, Date().addingTimeInterval(4.5)) }
                case "emote":
                    if let id = ev.id, ev.kind == "heart" { bubbles[id] = ("❤️", Date().addingTimeInterval(2)) }
                case "event":
                    if let text = ev.text {
                        toastFor(text)
                        if ev.kind == "gift" || ev.kind == "find" { WKInterfaceDevice.current().play(.success) }
                    }
                default: break
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func send(_ body: [String: Any]) async {
        do {
            _ = try await API.shared.send("POST", "/api/watch/town", body, as: Empty.self)
            WKInterfaceDevice.current().play(.click)
            await poll()
        } catch {
            WKInterfaceDevice.current().play(.failure)
            self.error = error.localizedDescription
        }
    }

    private func toastFor(_ text: String) {
        withAnimation { toast = text }
        Task {
            try? await Task.sleep(for: .seconds(3))
            withAnimation { if toast == text { toast = nil } }
        }
    }

    /// A tap on someone opens what you can do with them; a tap anywhere else walks there.
    private func tap(_ loc: CGPoint, in size: CGSize) {
        guard let m = map, let n = now else { return }
        let s = scale(m)
        let t = min(1, Date().timeIntervalSince(since) / Self.step)
        let cam = camera(m, t)
        let wx = cam.x + (loc.x - size.width / 2) / s, wy = cam.y + (loc.y - size.height / 2) / s
        let hit = n.ents.compactMap { e -> (TownNow.Ent, Double)? in
            guard let p = lerp(e.id, t) else { return nil }
            let d = hypot((p.x - wx) * s, (p.y - 14 / s - wy) * s)
            return d < 22 ? (e, d) : nil
        }.min { $0.1 < $1.1 }
        if let (e, _) = hit {
            picked = e
            return
        }
        guard n.out else {
            toastFor("先让它出门吧")
            return
        }
        target = CGPoint(x: wx, y: wy)
        Task { await send(["t": "goto", "x": wx, "y": wy]) }
    }

    @ViewBuilder private func actions(for e: TownNow.Ent) -> some View {
        if e.mine {
            Button("喵一声") { Task { await send(["t": "act", "anim": "meow"]) } }
            Button("开心地坐一会儿") { Task { await send(["t": "act", "anim": "sit_happy"]) } }
            Button("随它自己逛") { Task { await send(["t": "explore"]) } }
        } else if e.kind == "npc" {
            Button("去打招呼") { Task { await send(["t": "interact", "target": e.id]) } }
            if let sp = e.special { Button(sp) { Task { await send(["t": "npcAct", "npc": e.id, "act": "special"]) } } }
            if e.withMe {
                Button("说再见") { Task { await send(["t": "npcAct", "npc": e.id, "act": "bye"]) } }
            } else {
                Button("一起逛逛") { Task { await send(["t": "npcAct", "npc": e.id, "act": "walk"]) } }
            }
        } else {
            Button(e.owner.map { "去找\($0)家的\(e.name)玩" } ?? "去找\(e.name)玩") { Task { await send(["t": "interact", "target": e.id]) } }
        }
    }

    private var placesSheet: some View {
        NavigationStack {
            List {
                if let m = map {
                    let me = now?.me.map { CGPoint(x: $0.x, y: $0.y) } ?? CGPoint(x: m.home.first ?? 0, y: m.home.last ?? 0)
                    Section("小镇里") {
                        ForEach(m.places.sorted { hypot($0.x - me.x, $0.y - me.y) < hypot($1.x - me.x, $1.y - me.y) }) { p in
                            Button {
                                showPlaces = false
                                target = CGPoint(x: p.x, y: p.y)
                                pan = .zero
                                Task { await send(["t": "goto", "x": p.x, "y": p.y]); toastFor("去「\(p.name)」") }
                            } label: {
                                HStack {
                                    Text(p.name)
                                    Spacer()
                                    Text(distance(hypot(p.x - me.x, p.y - me.y), tile: m.tile)).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Section("进店坐坐") {
                        ForEach(m.rooms) { r in
                            Button(r.name) {
                                showPlaces = false
                                pan = .zero
                                Task { await send(["t": "goto", "room": r.id]); toastFor("去\(r.name)") }
                            }
                        }
                    }
                }
            }
            .navigationTitle("去哪里")
        }
    }

    private func distance(_ units: Double, tile: Double) -> String {
        let tiles = units / tile
        return tiles < 6 ? "就在旁边" : tiles < 25 ? "不远" : "有点远"
    }
}
