import SwiftUI
import WidgetKit

/// Debug builds: every widget face, drawn from what the app saved for them
/// (-CatNestDebugScreen widgets), to look at them without editing a watch face.
struct WidgetPreviewScreen: View {
    @State private var s = WidgetSnapshot.load()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let s {
                    Text("已保存 \(s.at.formatted(date: .omitted, time: .shortened))").font(.caption2).foregroundStyle(.secondary)
                    // -CatNestDebugIndex 1 starts with the town's
                    if UserDefaults.standard.integer(forKey: "CatNestDebugIndex") != 1 {
                        HStack(spacing: 10) {
                            CatWidgetView(s: s, family: .accessoryCircular).frame(width: 52, height: 52)
                            CatWidgetView(s: s, family: .accessoryCorner).frame(width: 36, height: 36)
                        }
                        CatWidgetView(s: s, family: .accessoryRectangular).frame(height: 56).padding(6).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                        CatWidgetView(s: s, family: .accessoryInline).font(.footnote)
                    }
                    TownWidgetView(s: s, family: .accessoryCircular).frame(width: 52, height: 52)
                    TownWidgetView(s: s, family: .accessoryRectangular).frame(height: 56).padding(6).background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    TownWidgetView(s: s, family: .accessoryInline).font(.footnote)
                } else {
                    Text("还没有为小组件保存过数据（共享容器不可用？）").font(.footnote)
                }
            }
        }
        .navigationTitle("小组件")
        .task {
            try? await Task.sleep(for: .seconds(2))
            s = WidgetSnapshot.load()
        }
    }
}
