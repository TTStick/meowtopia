import AppKit
import WebKit

/// Where the game lives. Builds carry a default (Info.plist `CatNestServer`);
/// override with `defaults write com.catnest.mac serverURL https://your.domain`.
enum Server {
    static var base: URL {
        if let s = UserDefaults.standard.string(forKey: "serverURL"), let u = URL(string: s) { return u }
        let s = Bundle.main.object(forInfoDictionaryKey: "CatNestServer") as? String ?? "https://localhost"
        return URL(string: s) ?? URL(string: "https://localhost")!
    }

    static func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)?.absoluteURL ?? base
    }

    /// Development builds talk to a local server whose certificate is self-signed.
    static func trustsDevCertificate(host: String) -> Bool {
        #if DEBUG
        return host == "localhost" || host == "127.0.0.1"
        #else
        return false
        #endif
    }

    static func handle(_ challenge: URLAuthenticationChallenge) -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           trustsDevCertificate(host: challenge.protectionSpace.host),
           let trust = challenge.protectionSpace.serverTrust {
            return (.useCredential, URLCredential(trust: trust))
        }
        return (.performDefaultHandling, nil)
    }
}

/// Messages the pages send with `window.webkit.messageHandlers.catnest.postMessage({...})`.
@MainActor
protocol BridgeReceiver: AnyObject {
    func received(_ message: [String: Any], from webView: WKWebView?)
}

/// The content controller holds its handlers strongly; this keeps the receiver weak.
@MainActor
private final class WeakBridge: NSObject, WKScriptMessageHandler {
    weak var receiver: BridgeReceiver?
    init(_ r: BridgeReceiver) { receiver = r }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        receiver?.received(body, from: message.webView)
    }
}

/// Shared navigation behaviour: stay on our site, open everything else in the browser.
final class WebNavigator: NSObject, WKNavigationDelegate, WKUIDelegate {
    static let shared = WebNavigator()

    func webView(_ webView: WKWebView, respondTo challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        Server.handle(challenge)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url, let host = url.host else { return .allow }
        if host != Server.base.host, action.navigationType == .linkActivated {
            NSWorkspace.shared.open(url)
            return .cancel
        }
        return .allow
    }

    // target=_blank links
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "好的")
        a.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "好的")
        a.addButton(withTitle: "取消")
        return a.runModal() == .alertFirstButtonReturn
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload() // the web process can be reclaimed while the app sits in the menu bar
    }
}

@MainActor
enum Web {
    /// One cookie jar for the panel and the game window, so signing in once is enough.
    static func make(bridge: BridgeReceiver) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "CatNestMac/1.0"
        config.userContentController.add(WeakBridge(bridge), name: "catnest")
        config.preferences.isElementFullscreenEnabled = true
        let wv = WKWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = WebNavigator.shared
        wv.uiDelegate = WebNavigator.shared
        wv.allowsBackForwardNavigationGestures = false
        wv.underPageBackgroundColor = NSColor(red: 0.965, green: 0.933, blue: 0.875, alpha: 1)
        return wv
    }
}
