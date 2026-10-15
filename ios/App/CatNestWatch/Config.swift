import Foundation

enum Config {
    #if DEBUG
    static let defaultServer = "https://localhost"
    #else
    // 发布前改成你的正式域名（也可以由配对的 iPhone 自动告诉手表）
    static let defaultServer = "https://cat.example.com"
    #endif

    /// The phone app tells the watch which server it uses; otherwise the default above.
    static var server: URL {
        if let s = UserDefaults.standard.string(forKey: "server"), let u = URL(string: s) { return u }
        return URL(string: defaultServer)!
    }

    static func setServer(_ s: String?) {
        UserDefaults.standard.set(s, forKey: "server")
    }
}
