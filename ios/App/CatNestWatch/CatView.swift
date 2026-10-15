import SwiftUI

/// Picks which frame the cat shows at a moment: mostly sitting, with blinks, tail
/// flicks, grooming and yawns sprinkled in, or curled up and breathing when asleep.
final class CatLife {
    private var override: (frame: String, until: Date)?
    private var nextBlink = Date().addingTimeInterval(2)
    private var nextGesture = Date().addingTimeInterval(6)

    func frame(at now: Date, sleepy: Bool, reaction: String?) -> String {
        if let reaction { return reaction }
        if sleepy { return Int(now.timeIntervalSinceReferenceDate / 1.8) % 2 == 0 ? "sleep1" : "sleep2" }
        if let o = override, now < o.until { return o.frame }
        override = nil
        if now >= nextBlink {
            override = ("blink", now.addingTimeInterval(0.18))
            nextBlink = now.addingTimeInterval(.random(in: 2.2...6))
            return "blink"
        }
        if now >= nextGesture {
            let g: [(String, TimeInterval)] = [("sit2", 1.8), ("groom", 2.6), ("meow", 1.1), ("loaf", 7), ("yawn", 1.5), ("sit2", 2.4)]
            let pick = g.randomElement()!
            override = (pick.0, now.addingTimeInterval(pick.1))
            nextGesture = now.addingTimeInterval(.random(in: 9...24))
            return pick.0
        }
        return "sit"
    }
}

struct CatView: View {
    let frames: [String: UIImage]
    let sleepy: Bool
    let reaction: String?
    let hearts: Int
    @State private var life = CatLife()

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let name = life.frame(at: ctx.date, sleepy: sleepy, reaction: reaction)
            let breathe = 1 + 0.018 * sin(t * (sleepy ? 1.7 : 2.6))
            ZStack {
                if let img = frames[name] ?? frames["sit"] {
                    Image(uiImage: img)
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .scaleEffect(x: 1, y: breathe, anchor: .bottom)
                } else {
                    ProgressView()
                }
                FloatingHearts(trigger: hearts)
            }
        }
        .accessibilityLabel(sleepy ? "猫猫在睡觉" : "猫猫")
    }
}

/// Little hearts that drift up when the cat is petted.
struct FloatingHearts: View {
    let trigger: Int
    @State private var bursts: [Burst] = []

    struct Burst: Identifiable {
        let id = UUID()
        let dx: CGFloat
        var up = false
    }

    var body: some View {
        ZStack {
            ForEach(bursts) { b in
                Image(systemName: "heart.fill")
                    .font(.system(size: 14))
                    .foregroundStyle(Color(red: 0.95, green: 0.45, blue: 0.5))
                    .offset(x: b.dx, y: b.up ? -70 : -10)
                    .opacity(b.up ? 0 : 1)
            }
        }
        .onChange(of: trigger) {
            for i in 0..<3 {
                let b = Burst(dx: CGFloat(i - 1) * 22 + .random(in: -6...6))
                bursts.append(b)
                withAnimation(.easeOut(duration: 1.3).delay(Double(i) * 0.12)) {
                    if let k = bursts.firstIndex(where: { $0.id == b.id }) { bursts[k].up = true }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                bursts.removeAll { $0.up }
            }
        }
        .allowsHitTesting(false)
    }
}

/// The empty cushion shown while the cat is out exploring.
struct Cushion: View {
    var body: some View {
        ZStack {
            Ellipse().fill(Color(red: 0.91, green: 0.56, blue: 0.44))
            Ellipse().fill(Color(red: 0.97, green: 0.71, blue: 0.6)).padding(8).offset(y: -3)
            Ellipse().stroke(Color(red: 0.29, green: 0.23, blue: 0.2), lineWidth: 2.5)
            Image(systemName: "pawprint.fill")
                .font(.system(size: 14))
                .foregroundStyle(Color(red: 0.29, green: 0.23, blue: 0.2).opacity(0.5))
                .offset(y: -3)
        }
        .frame(width: 104, height: 34)
    }
}
