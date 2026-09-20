import Foundation

struct Browser {
    let identifier: UUID

    init(identifier: UUID = UUID()) {
        self.identifier = identifier
    }
}
