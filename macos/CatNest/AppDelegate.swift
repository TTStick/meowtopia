import AppKit
import ServiceManagement
import UserNotifications
import WebKit

@main
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, BridgeReceiver, NSPopoverDelegate, NSWindowDelegate, UNUserNotificationCenterDelegate {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory) // lives in the menu bar; a Dock icon only while the game window is open
        app.run()
    }

    private var statusItem: NSStatusItem!
    private var cat: StatusCat!
    private let popover = NSPopover()
    private var companion: WKWebView!
    private var gameWindow: NSWindow?
    private var gameView: WKWebView?
    private let sync = CompanionSync()

    // MARK: launch

    func applicationDidFinishLaunching(_ note: Notification) {
        UNUserNotificationCenter.current().delegate = self
        // a companion that lives in the menu bar must not be tidied away by the system
        ProcessInfo.processInfo.disableAutomaticTermination("猫猫在菜单栏陪着你")

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            cat = StatusCat(button: button)
            button.target = self
            button.action = #selector(statusClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
        }

        // The panel's page stays loaded in the background: it keeps the cat's state
        // fresh for the icon and notices new letters.
        companion = Web.make(bridge: self)
        let vc = NSViewController()
        vc.view = companion
        vc.preferredContentSize = NSSize(width: 340, height: 520)
        popover.contentViewController = vc
        popover.contentSize = NSSize(width: 340, height: 520)
        popover.behavior = .transient
        popover.animates = true
        popover.delegate = self
        companion.load(URLRequest(url: Server.url("/companion.html")))

        sync.onUpdate = { [weak self] signedIn, home in
            guard let self else { return }
            let c = home?.cat
            self.cat.update(loggedIn: signedIn && c != nil, catId: c?.id, name: c?.name ?? "", look: c?.look ?? "", out: c?.out ?? false, sleepy: c?.sleepy ?? false)
            self.cat.unread = home?.unread ?? 0
            DebugDump.stateArrived()
        }
        sync.start()

        DebugDump.startIfRequested(app: self)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        openGame()
        return true
    }

    // MARK: status item

    @objc private func statusClicked(_ sender: NSStatusBarButton) {
        if NSApp.currentEvent?.type == .rightMouseUp {
            showMenu()
        } else {
            togglePopover()
        }
    }

    func togglePopover() {
        if popover.isShown {
            popover.performClose(nil)
        } else if let b = statusItem.button {
            popover.show(relativeTo: b.bounds, of: b, preferredEdge: .minY)
            popover.contentViewController?.view.window?.makeKey()
            js("window.catnestNative?.onShow()")
        }
    }

    private func showMenu() {
        let m = NSMenu()
        m.addItem(withTitle: "打开猫窝", action: #selector(openGameAction), keyEquivalent: "o").target = self
        m.addItem(.separator())
        let login = NSMenuItem(title: "开机时陪着你", action: #selector(toggleLoginItem), keyEquivalent: "")
        login.state = loginItemOn ? .on : .off
        login.target = self
        m.addItem(login)
        m.addItem(.separator())
        m.addItem(withTitle: "退出猫窝", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        statusItem.menu = m
        statusItem.button?.performClick(nil)
        statusItem.menu = nil // so the next left click opens the panel again
    }

    // MARK: the full game window

    @objc private func openGameAction() { openGame() }

    func openGame(query: String = "") {
        popover.performClose(nil)
        let url = Server.url("/play/" + query)
        if let w = gameWindow {
            if !query.isEmpty { gameView?.load(URLRequest(url: url)) }
            NSApp.setActivationPolicy(.regular)
            w.makeKeyAndOrderFront(nil)
            NSApp.activate()
            return
        }
        let wv = Web.make(bridge: self)
        wv.load(URLRequest(url: url))
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1120, height: 760), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        w.title = "猫窝"
        w.titlebarAppearsTransparent = true
        w.contentView = wv
        w.contentMinSize = NSSize(width: 420, height: 560)
        w.isReleasedWhenClosed = false
        w.setFrameAutosaveName("CatNestGame")
        if !w.setFrameUsingName("CatNestGame") { w.center() }
        w.delegate = self
        gameWindow = w
        gameView = wv
        NSApp.setActivationPolicy(.regular)
        w.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    func popoverDidClose(_ notification: Notification) {
        sync.poll() // whatever happened in the panel shows on the icon
    }

    func windowWillClose(_ note: Notification) {
        guard (note.object as? NSWindow) === gameWindow else { return }
        // let the game page go (and its sound and music with it); back to being a quiet menu bar cat
        gameView?.load(URLRequest(url: URL(string: "about:blank")!))
        gameWindow = nil
        gameView = nil
        NSApp.setActivationPolicy(.accessory)
        sync.poll()
    }

    // MARK: messages from the pages

    func received(_ m: [String: Any], from webView: WKWebView?) {
        switch m["type"] as? String {
        case "ready":
            js("window.catnestNative?.setLoginItem(\(loginItemOn))")
        case "state":
            cat.update(loggedIn: m["loggedIn"] as? Bool ?? false,
                       catId: m["catId"] as? String,
                       name: m["name"] as? String ?? "",
                       look: m["look"] as? String ?? "",
                       out: m["out"] as? Bool ?? false,
                       sleepy: m["sleepy"] as? Bool ?? false)
            cat.unread = m["unread"] as? Int ?? 0
        case "mood":
            cat.cheer()
        case "openGame":
            var q: [String] = []
            if let p = m["panel"] as? String { q.append("panel=\(p)") }
            if let w = m["where"] as? String { q.append("scene=\(w)") }
            openGame(query: q.isEmpty ? "" : "?" + q.joined(separator: "&"))
        case "setLoginItem":
            setLoginItem(m["on"] as? Bool ?? false)
        case "enableNotifications":
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        case "game":
            // signed in (or out) in the game window: the panel and the icon should follow
            js("window.catnestNative?.onShow()")
            sync.poll()
        case "quit":
            NSApp.terminate(nil)
        default:
            break
        }
    }

    func js(_ code: String) {
        companion?.evaluateJavaScript(code, completionHandler: nil)
    }

    // MARK: notifications

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        await MainActor.run { self.openGame(query: "?panel=letters") }
    }

    // MARK: launch at login

    private var loginItemOn: Bool { SMAppService.mainApp.status == .enabled }

    @objc private func toggleLoginItem() { setLoginItem(!loginItemOn) }

    private func setLoginItem(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            NSLog("[catnest] login item: \(error.localizedDescription)")
        }
        if on && SMAppService.mainApp.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }
        js("window.catnestNative?.setLoginItem(\(loginItemOn))")
    }

    // MARK: for DebugDump
    var debugPopover: NSPopover { popover }
    var debugCompanion: WKWebView { companion }
    var debugGameView: WKWebView? { gameView }
    var debugCat: StatusCat { cat }
}
