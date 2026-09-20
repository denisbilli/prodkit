import UIKit
import WebKit

final class BrowserViewController: UIViewController {
    private let webView = WKWebView()

    override func loadView() {
        view = webView
    }
}
