import SwiftUI

let ink = Color(red: 0.29, green: 0.23, blue: 0.2)
let cream = Color(red: 1, green: 0.97, blue: 0.92)
let coral = Color(red: 0.94, green: 0.54, blue: 0.36)

/// Warm by day, a starry sky at night.
struct Sky: View {
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

/// What the cat says, in a little speech bubble.
struct Bubble: View {
    let text: String
    var body: some View {
        Text(text)
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
}

extension View {
    /// The double-pinch (double tap) on newer watches triggers this button.
    @ViewBuilder func doubleTapAction() -> some View {
        if #available(watchOS 11.0, *) { self.handGestureShortcut(.primaryAction) } else { self }
    }
}
