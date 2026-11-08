import SwiftUI
import WidgetKit

// What the home screen and desktop widgets look like (iPhone, iPad and Mac): a little scene
// that follows the town's clock, season and weather, with your cat in it.

private extension Color {
    init(_ hex: UInt32, _ opacity: Double = 1) {
        self.init(.sRGB, red: Double(hex >> 16 & 255) / 255, green: Double(hex >> 8 & 255) / 255, blue: Double(hex & 255) / 255, opacity: opacity)
    }
}

// MARK: the town's light

/// The colours of the hour.
struct Sky {
    enum Time { case dawn, day, dusk, night }
    let time: Time
    /// The system took the scene away (tinted home screen, a Mac desktop that isn't in front) and colours the words itself.
    var plain = false

    init(hour: Double, plain: Bool = false) {
        time = hour < 5 ? .night : hour < 7.2 ? .dawn : hour < 17.6 ? .day : hour < 19.8 ? .dusk : .night
        self.plain = plain
    }

    var dark: Bool { time == .night }

    private func by(_ dawn: UInt32, _ day: UInt32, _ dusk: UInt32, _ night: UInt32) -> Color {
        switch time {
        case .dawn: return Color(dawn)
        case .day: return Color(day)
        case .dusk: return Color(dusk)
        case .night: return Color(night)
        }
    }

    var top: Color { by(0xF4CDBB, 0xBFE2F2, 0xEE9F7E, 0x1E2346) }
    var bottom: Color { by(0xFCE8C8, 0xF4F3DE, 0xFAD6A0, 0x3D3B67) }
    var wall: Color { by(0xFBEBD7, 0xFBF2E0, 0xF7E0C2, 0x38345A) }
    var floor: Color { by(0xE7CDA9, 0xEBD3AE, 0xDFBA8F, 0x2A2746) }
    var ink: Color { plain ? .primary : dark ? Color(0xF8F0E0) : Color(0x4A3A34) }
    var soft: Color { plain ? .secondary : dark ? Color(0xF8F0E0, 0.72) : Color(0x4A3A34, 0.68) }
    var card: Color { plain ? .clear : dark ? Color(0x171A36, 0.6) : Color(0xFFFBF2, 0.82) }
    var track: Color { plain ? Color.primary.opacity(0.18) : dark ? Color(0xFFFFFF, 0.16) : Color(0x4A3A34, 0.12) }
    var line: Color { plain ? Color.primary.opacity(0.14) : dark ? Color(0xFFFFFF, 0.14) : Color(0x4A3A34, 0.16) }
    var panel: Color { dark ? Color(0x25274A) : Color(0xFFFBF2) }
}

/// Spring, summer, autumn, winter (as the town's ground is painted).
private func groundColor(_ season: String?, dark: Bool) -> Color {
    let c: UInt32
    switch season?.first {
    case "夏": c = dark ? 0x35503F : 0xC6E2A0
    case "秋": c = dark ? 0x4C4A3B : 0xEBD79F
    case "冬": c = dark ? 0x565A78 : 0xEFF2EC
    default: c = dark ? 0x3A5546 : 0xCFE8AE
    }
    return Color(c)
}

// MARK: drawing the scene

private struct Hill: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.minY + r.height * 0.34))
        p.addCurve(to: CGPoint(x: r.maxX, y: r.minY + r.height * 0.14),
                   control1: CGPoint(x: r.minX + r.width * 0.34, y: r.minY - r.height * 0.18),
                   control2: CGPoint(x: r.minX + r.width * 0.66, y: r.minY + r.height * 0.42))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

private struct Cloud: View {
    let color: Color
    let w: CGFloat
    var body: some View {
        ZStack(alignment: .bottom) {
            Capsule().frame(width: w, height: w * 0.3)
            Circle().frame(width: w * 0.46, height: w * 0.46).offset(x: -w * 0.1, y: -w * 0.08)
            Circle().frame(width: w * 0.32, height: w * 0.32).offset(x: w * 0.18, y: -w * 0.06)
        }
        .foregroundColor(color)
        .frame(width: w, height: w * 0.55, alignment: .bottom)
    }
}

/// Sun or moon, clouds, rain or snow; used out of doors and through the window.
private struct Heavens: View {
    let sky: Sky
    let weather: String?
    let size: CGSize

    private var unit: CGFloat { min(size.width, size.height, 180) }
    private var overcast: Bool { weather?.contains("云") == true || falling }
    private var falling: Bool { weather?.contains("雨") == true || weather?.contains("雪") == true }
    private var snow: Bool { weather?.contains("雪") == true }

    /// Scattered the same way every time.
    private func spot(_ i: Int) -> CGPoint {
        CGPoint(x: size.width * (0.07 + 0.91 * CGFloat((i * 37 + 11) % 97) / 97), y: size.height * (0.05 + 0.6 * CGFloat((i * 53 + 29) % 89) / 89))
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if sky.dark, !overcast {
                ForEach(0..<9, id: \.self) { i in
                    Circle().fill(Color(0xFFF6DA, i % 3 == 0 ? 0.95 : 0.6))
                        .frame(width: i % 3 == 0 ? 2.6 : 1.7, height: i % 3 == 0 ? 2.6 : 1.7)
                        .position(spot(i))
                }
            }
            if !overcast {
                if sky.dark {
                    Image(systemName: "moon.fill").font(.system(size: unit * 0.2)).foregroundColor(Color(0xFFEFC2))
                        .position(x: size.width * 0.78, y: size.height * 0.2)
                } else {
                    Circle().fill(Color(sky.time == .day ? 0xFFD98A : 0xFFC58C, 0.32))
                        .frame(width: unit * 0.34, height: unit * 0.34)
                        .position(x: size.width * 0.78, y: size.height * 0.22)
                    Circle().fill(Color(sky.time == .day ? 0xFFD27A : 0xFFB877))
                        .frame(width: unit * 0.2, height: unit * 0.2)
                        .position(x: size.width * 0.78, y: size.height * 0.22)
                }
            }
            if overcast {
                let shade = sky.dark ? Color(0x6A6A8C) : Color(0xFFFFFF, 0.92)
                Cloud(color: shade, w: unit * 0.44).position(x: size.width * 0.76, y: size.height * 0.2)
                Cloud(color: shade.opacity(0.8), w: unit * 0.3).position(x: size.width * 0.6, y: size.height * 0.37)
            }
            if falling {
                ForEach(0..<14, id: \.self) { i in
                    let p = spot(i + 20)
                    if snow {
                        Circle().fill(Color.white.opacity(0.92)).frame(width: 3, height: 3).position(p)
                    } else {
                        Capsule().fill(Color(sky.dark ? 0xAFC4E8 : 0x7FA8C9, 0.8)).frame(width: 1.5, height: 7).rotationEffect(.degrees(12)).position(p)
                    }
                }
            }
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
    }
}

private struct WindowPane: View {
    let sky: Sky
    let weather: String?
    let w: CGFloat
    var body: some View {
        let h = w * 0.86
        let frame = sky.dark ? Color(0x5A5580) : Color(0xFFFDF6)
        ZStack {
            LinearGradient(colors: [sky.top, sky.bottom], startPoint: .top, endPoint: .bottom)
            Heavens(sky: sky, weather: weather, size: CGSize(width: w, height: h))
            Rectangle().fill(frame).frame(width: 2.5)
            Rectangle().fill(frame).frame(height: 2.5)
        }
        .frame(width: w, height: h)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(frame, lineWidth: 3.5))
        .shadow(color: Color(0x4A3A34, 0.12), radius: 2, y: 1)
    }
}

/// Indoors with a window, or out on the hill.
private struct Backdrop: View {
    let s: WidgetSnapshot
    let sky: Sky
    let home: Bool
    /// Where the cat stands, 0...1 across.
    var catX: CGFloat = 0.5
    /// The window's centre, 0...1.
    var window = CGPoint(x: 0.77, y: 0.29)
    var windowWidth: CGFloat = 0.3
    var town = false
    /// Where the town stands, as a share of the width from the right.
    var townWidth: CGFloat = 1

    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            if home {
                ZStack(alignment: .topLeading) {
                    sky.wall
                    WindowPane(sky: sky, weather: s.weather, w: min(w, h) * windowWidth).position(x: w * window.x, y: h * window.y)
                    if sky.dark {
                        RadialGradient(colors: [Color(0xFFD08A, 0.34), Color(0xFFD08A, 0)], center: UnitPoint(x: catX, y: 0.74), startRadius: 0, endRadius: min(w, h) * 0.62)
                    }
                    sky.floor.frame(height: h * 0.2).offset(y: h * 0.8)
                    Rectangle().fill(sky.line).frame(height: 1).offset(y: h * 0.8)
                    Ellipse().fill(Color(sky.dark ? 0xA8695F : 0xF0A987))
                        .frame(width: min(w, h) * 0.72, height: h * 0.15)
                        .position(x: w * catX, y: h * 0.875)
                    Ellipse().fill(Color(sky.dark ? 0xC07E70 : 0xF8C4A6))
                        .frame(width: min(w, h) * 0.62, height: h * 0.1)
                        .position(x: w * catX, y: h * 0.86)
                }
            } else {
                ZStack(alignment: .topLeading) {
                    LinearGradient(colors: [sky.top, sky.bottom], startPoint: .top, endPoint: .bottom)
                    Heavens(sky: sky, weather: s.weather, size: g.size)
                    if town { Rooftops(sky: sky).frame(width: w * townWidth, height: h * 0.34).offset(x: w * (1 - townWidth), y: h * 0.42) }
                    Hill().fill(groundColor(s.season, dark: sky.dark)).frame(height: h * 0.3).offset(y: h * 0.7)
                }
            }
        }
    }
}

/// The town, far off.
private struct Rooftops: View {
    let sky: Sky
    var body: some View {
        GeometryReader { g in
            let u = g.size.height
            let body = sky.dark ? Color(0x4A4873) : Color(0xE7D6BF)
            let roof = sky.dark ? Color(0x5A4F76) : Color(0xD98E70)
            let lit = sky.dark ? Color(0xFFD98A) : Color(0x7E93A6, 0.6)
            let houses: [(x: CGFloat, w: CGFloat, h: CGFloat)] = [(0.08, 0.5, 0.56), (0.3, 0.62, 0.8), (0.56, 0.46, 0.5), (0.76, 0.56, 0.68)]
            ZStack(alignment: .topLeading) {
                ForEach(houses.indices, id: \.self) { i in
                    let h = houses[i]
                    let wall = CGRect(x: g.size.width * h.x, y: u * (1 - h.h), width: u * h.w, height: u * h.h)
                    Path(wall).fill(body)
                    Path { p in
                        p.move(to: CGPoint(x: wall.minX - u * 0.05, y: wall.minY))
                        p.addLine(to: CGPoint(x: wall.midX, y: wall.minY - u * 0.26))
                        p.addLine(to: CGPoint(x: wall.maxX + u * 0.05, y: wall.minY))
                        p.closeSubpath()
                    }.fill(roof)
                    RoundedRectangle(cornerRadius: 1.5).fill(lit)
                        .frame(width: u * 0.12, height: u * 0.13)
                        .position(x: wall.midX, y: wall.minY + u * 0.16)
                }
            }
        }
    }
}

// MARK: pieces

private struct CatPicture: View {
    let s: WidgetSnapshot
    let date: Date
    var body: some View {
        if let img = picture {
            if #available(iOS 18.0, macOS 15.0, *) {
                image(img).interpolation(.high).widgetAccentedRenderingMode(.fullColor).scaledToFit()
            } else {
                image(img).interpolation(.high).scaledToFit()
            }
        } else {
            Image(systemName: "cat.fill").resizable().scaledToFit().padding(16).foregroundColor(Color(0xF0A987))
        }
    }

    private func image(_ img: PlatformImage) -> Image {
        #if canImport(UIKit)
        Image(uiImage: img).resizable()
        #else
        Image(nsImage: img).resizable()
        #endif
    }

    private var picture: PlatformImage? {
        if s.isSample == true { return PlatformImage(named: "PreviewCat") }
        return WidgetSnapshot.image(s.pose(at: date)) ?? WidgetSnapshot.image("sit")
    }
}

private struct Bar: View {
    let name: String
    let value: Double
    let tint: UInt32
    let sky: Sky
    var body: some View {
        HStack(spacing: 5) {
            Text(name).font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundColor(sky.soft).fixedSize()
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(sky.track)
                    Capsule().fill(Color(tint)).frame(width: max(5, g.size.width * min(1, value / 100)))
                }
            }
            .frame(height: 5.5)
        }
    }
}

private struct Bars: View {
    let s: WidgetSnapshot
    let sky: Sky
    var body: some View {
        VStack(spacing: 5) {
            Bar(name: "饱腹", value: s.hunger, tint: 0xF0A25E, sky: sky)
            Bar(name: "精神", value: s.energy, tint: 0x7DBD8E, sky: sky)
            Bar(name: "心情", value: s.happy, tint: 0xEE8A8E, sky: sky)
        }
    }
}

private struct Letters: View {
    let n: Int
    let sky: Sky
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "envelope.fill").font(.system(size: 9.5, weight: .semibold))
            Text("\(n)").font(.system(size: 11, weight: .bold, design: .rounded))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 7)
        .padding(.vertical, 3.5)
        .background(Capsule().fill(Color(0xE9785A)))
    }
}

private struct NameLine: View {
    let s: WidgetSnapshot
    let sky: Sky
    var size: CGFloat = 17
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(s.name).font(.system(size: size, weight: .bold, design: .rounded)).foregroundColor(sky.ink).lineLimit(1)
            if let d = s.days, size >= 17 { Text("第 \(d) 天").font(.system(size: 10.5, design: .rounded)).foregroundColor(sky.soft).fixedSize() }
        }
    }
}

private struct StatusLine: View {
    let s: WidgetSnapshot
    let date: Date
    let sky: Sky
    var size: CGFloat = 12
    var body: some View {
        Text(s.statusLine(at: date)).font(.system(size: size, design: .rounded)).foregroundColor(sky.soft).lineLimit(1).minimumScaleFactor(0.8)
    }
}

/// Signed out, or no cat yet: say what to do next.
private struct Invitation: View {
    let s: WidgetSnapshot
    let sky: Sky
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "pawprint.fill").font(.system(size: 26)).foregroundColor(Color(0xF0A987))
            Text(s.signedIn ? "还没有猫猫" : "猫窝").font(.system(size: 15, weight: .bold, design: .rounded)).foregroundColor(sky.ink)
            Text(s.signedIn ? "打开猫窝领养一只吧" : "打开 App 登录后，这里会住进你的猫").font(.system(size: 11, design: .rounded)).foregroundColor(sky.soft).multilineTextAlignment(.center)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: the cat widget

/// The bubble's little tail, pointing at the cat.
private struct BubbleTail: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.maxX, y: r.minY))
        p.addLine(to: CGPoint(x: r.minX, y: r.midY))
        p.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        p.closeSubpath()
        return p
    }
}

struct CatFace: View {
    let s: WidgetSnapshot
    let date: Date
    let family: WidgetFamily
    @Environment(\.widgetRenderingMode) private var mode
    @Environment(\.showsWidgetContainerBackground) private var hasBackground

    private var fullSky: Sky { Sky(hour: s.hour(at: date)) }
    private var sky: Sky { Sky(hour: s.hour(at: date), plain: mode != .fullColor || !hasBackground) }
    private var home: Bool { !s.out && s.visiting == nil }
    private var ready: Bool { s.signedIn && s.hasCat }
    /// How much of the large widget is the picture.
    private static let largeScene: CGFloat = 0.52

    /// The widget's background, which the system can take away.
    @ViewBuilder var scene: some View {
        if !ready {
            Backdrop(s: s, sky: fullSky, home: false)
        } else if family == .systemMedium {
            Backdrop(s: s, sky: fullSky, home: home, catX: 0.215, window: CGPoint(x: 0.1, y: 0.25), windowWidth: 0.34)
        } else if family == .systemLarge {
            GeometryReader { g in
                VStack(spacing: 0) {
                    Backdrop(s: s, sky: fullSky, home: home, catX: 0.34, window: CGPoint(x: 0.83, y: 0.34), windowWidth: 0.42)
                        .frame(height: g.size.height * Self.largeScene)
                    fullSky.panel
                }
            }
        } else {
            Backdrop(s: s, sky: fullSky, home: home, window: CGPoint(x: 0.77, y: 0.27), windowWidth: 0.27)
        }
    }

    var body: some View {
        if ready {
            switch family {
            case .systemMedium: medium
            case .systemLarge: large
            default: small
            }
        } else {
            Invitation(s: s, sky: sky)
        }
    }

    private var small: some View {
        GeometryReader { g in
            ZStack(alignment: .topLeading) {
                CatPicture(s: s, date: date)
                    .frame(width: g.size.width * 0.66, height: g.size.height * 0.66)
                    .position(x: g.size.width * 0.5, y: g.size.height * 0.6)
                VStack(alignment: .leading, spacing: 1) {
                    NameLine(s: s, sky: sky, size: 15)
                    StatusLine(s: s, date: date, sky: sky, size: 11)
                }
                .padding(.top, 12)
                .padding(.leading, 13)
                .padding(.trailing, 58)
                if s.unread > 0 {
                    Letters(n: s.unread, sky: sky).position(x: g.size.width - 28, y: 20)
                }
            }
        }
    }

    private var medium: some View {
        GeometryReader { g in
            let side = g.size.height
            ZStack(alignment: .topLeading) {
                CatPicture(s: s, date: date)
                    .frame(width: side * 0.76, height: side * 0.76)
                    .position(x: g.size.width * 0.215, y: side * 0.56)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 4) {
                        NameLine(s: s, sky: sky)
                        Spacer(minLength: 0)
                        if s.unread > 0 { Letters(n: s.unread, sky: sky) }
                    }
                    StatusLine(s: s, date: date, sky: sky).padding(.top, 1)
                    Spacer(minLength: 5)
                    Bars(s: s, sky: sky)
                    if let e = s.extraLine {
                        Spacer(minLength: 5)
                        Text(e).font(.system(size: 11, design: .rounded)).foregroundColor(sky.soft).lineLimit(1).minimumScaleFactor(0.8)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(width: g.size.width * 0.57, height: side - 20)
                .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(sky.card))
                .position(x: g.size.width * 0.685, y: side * 0.5)
            }
        }
    }

    private var large: some View {
        GeometryReader { g in
            let sceneH = g.size.height * Self.largeScene
            VStack(spacing: 0) {
                ZStack {
                    CatPicture(s: s, date: date)
                        .frame(width: sceneH * 0.78, height: sceneH * 0.78)
                        .position(x: g.size.width * 0.34, y: sceneH * 0.56)
                    if let w = s.saying {
                        HStack(spacing: -1) {
                            BubbleTail().fill(Color(0xFFFBF2)).frame(width: 8, height: 12)
                            Text(w)
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundColor(Color(0x4A3A34))
                                .lineLimit(2)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color(0xFFFBF2)))
                        }
                        .shadow(color: Color(0x4A3A34, 0.14), radius: 2, y: 1)
                        .frame(maxWidth: g.size.width * 0.42)
                        .position(x: g.size.width * 0.69, y: sceneH * 0.74)
                    }
                }
                .frame(height: sceneH)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center) {
                        NameLine(s: s, sky: sky, size: 20)
                        Spacer(minLength: 0)
                        if s.unread > 0 { Letters(n: s.unread, sky: sky) }
                    }
                    StatusLine(s: s, date: date, sky: sky, size: 13).padding(.top, 1)
                    Bars(s: s, sky: sky).padding(.top, 9)
                    Spacer(minLength: 5)
                    Rectangle().fill(sky.line).frame(height: 1)
                    Spacer(minLength: 5)
                    if s.wishNeed > 0 {
                        Text(s.wishDone ? "今天的心愿实现啦" : "今天的心愿 \(s.wishProgress)/\(s.wishNeed)").font(.system(size: 11.5, weight: .medium, design: .rounded)).foregroundColor(sky.ink).lineLimit(1)
                    }
                    Text(s.showLine ?? "小镇\(WidgetSnapshot.phaseName(s.hour(at: date)))\(s.weather.map { "，\($0)" } ?? "")").font(.system(size: 11.5, design: .rounded)).foregroundColor(sky.soft).lineLimit(1).padding(.top, 2)
                }
                .padding(.horizontal, 15)
                .padding(.vertical, 12)
                .frame(maxHeight: .infinity)
            }
        }
    }
}

// MARK: the town widget

struct TownFace: View {
    let s: WidgetSnapshot
    let date: Date
    let family: WidgetFamily
    @Environment(\.widgetRenderingMode) private var mode
    @Environment(\.showsWidgetContainerBackground) private var hasBackground

    private var fullSky: Sky { Sky(hour: s.hour(at: date)) }
    private var sky: Sky { Sky(hour: s.hour(at: date), plain: mode != .fullColor || !hasBackground) }
    private var title: String { "\(WidgetSnapshot.phaseName(s.hour(at: date)))\(s.weather.map { " · \($0)" } ?? "")" }

    @ViewBuilder var scene: some View {
        if !s.signedIn {
            Backdrop(s: s, sky: fullSky, home: false)
        } else {
            Backdrop(s: s, sky: fullSky, home: false, town: true, townWidth: family == .systemMedium ? 0.42 : 1)
        }
    }

    var body: some View {
        if s.signedIn {
            GeometryReader { g in
                if family == .systemMedium { medium(g) } else { small(g) }
            }
        } else {
            Invitation(s: s, sky: sky)
        }
    }

    private func small(_ g: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("小镇").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundColor(sky.soft)
            Text(title).font(.system(size: 16, weight: .bold, design: .rounded)).foregroundColor(sky.ink).lineLimit(1).minimumScaleFactor(0.75)
            Spacer(minLength: 0)
            Text(s.showShort).font(.system(size: 11.5, weight: .medium, design: .rounded)).foregroundColor(sky.plain ? .primary : Color(0x4A3A34)).lineLimit(1).minimumScaleFactor(0.8)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Capsule().fill(sky.plain ? Color.clear : Color(0xFFFBF2, 0.9)))
        }
        .padding(12)
        .frame(width: g.size.width, height: g.size.height, alignment: .topLeading)
    }

    private func medium(_ g: GeometryProxy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("小镇\(s.season.map { " · \($0)" } ?? "")").font(.system(size: 11, weight: .medium, design: .rounded)).foregroundColor(sky.soft)
            Text(title).font(.system(size: 19, weight: .bold, design: .rounded)).foregroundColor(sky.ink).lineLimit(1)
            Spacer(minLength: 4)
            Text(s.showLine ?? "今晚没有演出").font(.system(size: 12.5, weight: .medium, design: .rounded)).foregroundColor(sky.ink).lineLimit(1).minimumScaleFactor(0.8)
            if s.hasCat {
                HStack(spacing: 5) {
                    CatPicture(s: s, date: date).frame(width: 25, height: 25)
                    Text("\(s.name)\(s.townStatus)").font(.system(size: 12, design: .rounded)).foregroundColor(sky.soft).lineLimit(1).minimumScaleFactor(0.8)
                }
                .padding(.top, 3)
            }
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .frame(width: g.size.width * 0.56, height: g.size.height - 20, alignment: .topLeading)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(sky.card))
        .position(x: g.size.width * 0.31, y: g.size.height * 0.5)
    }
}

// MARK: what the faces say

extension WidgetSnapshot {
    /// The town's hour at `date`, from its clock when this was saved.
    func hour(at date: Date) -> Double {
        let parts = (time ?? "12:00").split(separator: ":").compactMap { Double($0) }
        let then = (parts.first ?? 12) + (parts.count > 1 ? parts[1] / 60 : 0)
        let h = (then + date.timeIntervalSince(at) / 3600).truncatingRemainder(dividingBy: 24)
        return h < 0 ? h + 24 : h
    }

    static func phaseName(_ h: Double) -> String {
        h < 5 ? "深夜" : h < 7 ? "清晨" : h < 11 ? "上午" : h < 14.5 ? "中午" : h < 18 ? "下午" : h < 21.5 ? "傍晚" : "夜晚"
    }

    /// Which picture, at this moment: a little life between refreshes.
    func pose(at date: Date) -> String {
        if sleepy && !out { return "sleep" }
        if hunger < 30 { return "beg" }
        if happy > 80 { return "happy" }
        return ["sit", "loaf", "sit", "groom"][Int(date.timeIntervalSince1970 / 1200) % 4]
    }

    /// The status, and how old it is once that matters.
    func statusLine(at date: Date) -> String {
        let hours = Int(date.timeIntervalSince(at) / 3600)
        if signedIn, hours >= 3 { return "\(status) · \(hours >= 24 ? "\(hours / 24) 天" : "\(hours) 小时")前" }
        return status
    }

    var extraLine: String? {
        if unread > 0, let w = wish { return wishDone ? "心愿实现啦：\(w)" : w }
        return extra
    }

    /// What it's saying in the speech bubble.
    var saying: String? {
        if sleepy && !out { return "呼……" }
        if hunger < 30 { return "肚子饿了……" }
        if let w = wish, !wishDone { return w }
        return mood.isEmpty ? nil : mood
    }

    var showShort: String {
        guard let s = show else { return "今晚没有演出" }
        return showLive ? "演出中：\(s)" : showGathering ? "快开演：\(s)" : "19:30 \(s)"
    }

    var townStatus: String {
        if let v = visiting { return "在\(v)家做客" }
        if out { return goingHome == true ? "在回家的路上" : place.map { "在\($0)" } ?? "在外面玩" }
        return sleepy ? "在家睡觉" : "在家里"
    }

    /// For the widget gallery.
    static let desktopSample = WidgetSnapshot(signedIn: true, hasCat: true, name: "汤圆", mood: "心情不错", hunger: 72, energy: 84, happy: 76, wish: "想玩逗猫棒", wishProgress: 1, wishNeed: 3, time: "15:20", weather: "晴", show: "小镇乐团", days: 12, phase: "下午", season: "秋天", isSample: true)
}
