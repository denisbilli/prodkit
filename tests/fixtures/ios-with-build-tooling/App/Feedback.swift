import Foundation

struct Feedback {
    let identifier: UUID

    init(identifier: UUID = UUID()) {
        self.identifier = identifier
    }
}
