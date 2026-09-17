import Foundation
import Security

/// The passing side of the same fixture: the token goes to the keychain rather than to
/// a file, and the minimum supported version comes from the server.
enum Session {
    static func store(token: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: "session",
            kSecValueData as String: Data(token.utf8),
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    static func isSupported(minimumVersion: String, current: String) -> Bool {
        current.compare(minimumVersion, options: .numeric) != .orderedAscending
    }
}
