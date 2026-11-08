import Foundation
import Security
import Capacitor
import WatchConnectivity
import WidgetKit

/// The app's own native bits:
/// - the session token in the iOS Keychain (encrypted, this device only; Keychain
///   items survive reinstalling the app, so the nest isn't lost with it)
/// - sharing a file (data export, photos) through the system share sheet
/// - handing the paired Apple Watch its own session, so it signs in by itself
/// - telling the home screen widgets which town to ask, and with which session
@objc(KeychainPlugin)
public class KeychainPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "KeychainPlugin"
    public let jsName = "CatNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "watchState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendToWatch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "widgetSync", returnType: CAPPluginReturnPromise),
    ]

    private static weak var current: KeychainPlugin?
    private static var pendingPanel: String?

    /// A widget was tapped (catnest://open/letters); the page may not be up yet.
    static func openPanel(_ panel: String) {
        if let p = current {
            p.notifyListeners("open", data: ["panel": panel], retainUntilConsumed: true)
        } else {
            pendingPanel = panel
        }
    }

    override public func load() {
        Self.current = self
        if let panel = Self.pendingPanel {
            Self.pendingPanel = nil
            notifyListeners("open", data: ["panel": panel], retainUntilConsumed: true)
        }
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    private let service = "com.catnest.session"

    private func query(_ key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key required") }
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else { return call.reject("key and value required") }
        SecItemDelete(query(key) as CFDictionary)
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(q as CFDictionary, nil)
        status == errSecSuccess ? call.resolve() : call.reject("keychain error \(status)")
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { return call.reject("key required") }
        SecItemDelete(query(key) as CFDictionary)
        call.resolve()
    }

    /// { name, base64 } → a temporary file shown in the share sheet ("save to Files", AirDrop, …)
    @objc func shareFile(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let b64 = call.getString("base64"), let data = Data(base64Encoded: b64) else {
            return call.reject("name and base64 required")
        }
        let safe = name.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return call.reject("could not write file")
        }
        DispatchQueue.main.async {
            guard let vc = self.bridge?.viewController else { return call.reject("no view") }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            if let pop = sheet.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
            }
            sheet.completionWithItemsHandler = { _, completed, _, _ in
                try? FileManager.default.removeItem(at: url)
                call.resolve(["completed": completed])
            }
            vc.present(sheet, animated: true)
        }
    }

    // MARK: home screen widgets

    /// The widgets' copy of the session: a Keychain item only this app and its widgets can read.
    private func widgetQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.catnest.widget",
            kSecAttrAccount as String: "session",
            kSecAttrAccessGroup as String: WidgetSnapshot.group,
        ]
    }

    private func read(_ q: [String: Any]) -> String? {
        var q = q
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let d = item as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    /// { server } after every sign-in, sign-out and start: the widgets fetch the cat themselves.
    @objc func widgetSync(_ call: CAPPluginCall) {
        let server = call.getString("server") ?? ""
        let token = read(query("session"))
        let shared = UserDefaults(suiteName: WidgetSnapshot.group)
        let old = read(widgetQuery())
        if old != token || shared?.string(forKey: "server") != server {
            // another account or town: nothing of the last one should linger on the home screen
            WidgetSnapshot.clear()
            SecItemDelete(widgetQuery() as CFDictionary)
            if let token {
                var q = widgetQuery()
                q[kSecValueData as String] = Data(token.utf8)
                q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                SecItemAdd(q as CFDictionary, nil)
            }
            shared?.set(server, forKey: "server")
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    // MARK: Apple Watch

    @objc func watchState(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else { return call.resolve(["supported": false, "paired": false, "installed": false]) }
        let s = WCSession.default
        call.resolve(["supported": true, "paired": s.isPaired, "installed": s.isWatchAppInstalled])
    }

    /// { token, server } → the watch app (it keeps the latest context, even if it's not running now)
    @objc func sendToWatch(_ call: CAPPluginCall) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isWatchAppInstalled else {
            return call.reject("watch not available")
        }
        let info: [String: Any] = ["token": call.getString("token") ?? "", "server": call.getString("server") ?? "", "at": Date().timeIntervalSince1970]
        do {
            try WCSession.default.updateApplicationContext(info)
            WCSession.default.transferUserInfo(info)
            call.resolve()
        } catch {
            call.reject("could not reach the watch")
        }
    }

    public func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
