import Foundation

struct Share {
    let identifier: UUID

    init(identifier: UUID = UUID()) {
        self.identifier = identifier
    }
}
