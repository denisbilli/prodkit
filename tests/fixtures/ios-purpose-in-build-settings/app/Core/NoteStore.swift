import Foundation
import Network

class NoteStore {
    let network_monitor = NWPathMonitor()

    func attach(photo: Data) {
        UserDefaults.standard.set(photo, forKey: "pending")
    }
}
