import Foundation

enum Config {
    #if DEBUG
    static let defaultServer = "https://localhost"
    #else
    // 公共服务器；自己架服务器时改成你的域名（配对的 iPhone 也会自动告诉手表）
    static let defaultServer = "https://mycat.xioix.xin"
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
