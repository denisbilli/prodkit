import Foundation

struct Permissions {
    let identifier: UUID

    init(identifier: UUID = UUID()) {
        self.identifier = identifier
    }
}
