import UIKit
import Capacitor

/// The game's web view, plus the app's own native plugins.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KeychainPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // the game draws its own background; avoid a white flash and rubber-banding
        webView?.isOpaque = false
        webView?.backgroundColor = UIColor(red: 0.965, green: 0.933, blue: 0.875, alpha: 1)
        webView?.scrollView.bounces = false
        webView?.allowsLinkPreview = false
    }
}
