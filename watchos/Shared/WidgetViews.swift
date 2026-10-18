import SwiftUI
import WidgetKit

// The widgets' faces. Used by the widget extension, and by the app's debug screen
// so they can be looked at without adding them to a watch face.

/// The cat's picture, once the app has saved one. It keeps its colours on tinted watch faces
/// too (watchOS 11 and later); before that they'd flatten it to a blob, so it's left out there.
private func catPicture(_ s: WidgetSnapshot, _ mode: WidgetRenderingMode) -> UIImage? {
    if #unavailable(watchOS 11.0), mode == .accented { return nil }
    let frame = s.sleepy && !s.out ? "sleep" : s.happy > 80 ? "happy" : "sit"
    return WidgetSnapshot.image(frame) ?? WidgetSnapshot.image("sit")
}

private struct CatPicture: View {
    let image: UIImage
    var body: some View {
        if #available(watchOS 11.0, *) {
            Image(uiImage: image).resizable().widgetAccentedRenderingMode(.fullColor).scaledToFit()
        } else {
            Image(uiImage: image).resizable().scaledToFit()
        }
    }
}

/// The cat: inside its mood ring, beside its day, in a line, or in a corner.
struct CatWidgetView: View {
    @Environment(\.widgetRenderingMode) private var mode
    let s: WidgetSnapshot
    let family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Circle()
                    .trim(from: 0, to: max(0.02, s.happy / 100))
                    .stroke(style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .padding(2)
                    .widgetAccentable()
                if s.out || s.visiting != nil {
                    Image(systemName: "pawprint.fill").font(.system(size: 18))
                } else if let img = catPicture(s, mode) {
                    CatPicture(image: img).padding(7)
                } else {
                    Image(systemName: "cat.fill").font(.system(size: 18))
                }
            }
            .accessibilityLabel("\(s.name) \(s.status)")
        case .accessoryRectangular:
            HStack(spacing: 6) {
                Group {
                    if let img = catPicture(s, mode), !s.out { CatPicture(image: img) } else { Image(systemName: s.out ? "pawprint.fill" : "cat.fill").font(.title3) }
                }
                .frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 0) {
                    Text(s.hasCat ? s.name : "猫窝").font(.headline).widgetAccentable()
                    Text(s.status).font(.system(size: 14)).lineLimit(1)
                    if let e = s.extra { Text(e).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
            }
        case .accessoryInline:
            Label(s.hasCat ? "\(s.name) · \(s.status)" : "猫窝", systemImage: "pawprint.fill")
        case .accessoryCorner:
            Group {
                if let img = catPicture(s, mode), !s.out { CatPicture(image: img).padding(2) } else { Image(systemName: "pawprint.fill").font(.title3) }
            }
            .widgetLabel {
                Gauge(value: s.happy, in: 0...100) { Text(s.name) } currentValueLabel: { Text(s.status) }
            }
        default:
            Text(s.name)
        }
    }
}

/// The town: its time and sky, tonight's stage, and where the cat is.
struct TownWidgetView: View {
    let s: WidgetSnapshot
    let family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Image(systemName: s.showLive ? "music.mic" : s.show != nil ? "music.note" : "building.2").font(.system(size: 15)).widgetAccentable()
                    Text(s.time ?? "--:--").font(.system(size: 12, weight: .semibold)).minimumScaleFactor(0.7)
                }
            }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 0) {
                Text("小镇 \(s.time ?? "") · \(s.weather ?? "")").font(.headline).widgetAccentable().lineLimit(1)
                Text(s.showLine ?? "今晚没有演出").font(.system(size: 14)).lineLimit(1)
                Text(s.out ? "\(s.name)\(s.status)" : s.town).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .accessoryInline:
            Label(s.showLine ?? "小镇 \(s.time ?? "") \(s.weather ?? "")", systemImage: s.show != nil ? "music.note" : "building.2")
        default:
            Text(s.time ?? "")
        }
    }
}
