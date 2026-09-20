import CoreData
import Foundation

/// Notes are written on a train and synchronised later, so they live on the device.
final class Store {
    let container: NSPersistentContainer

    init() {
        container = NSPersistentContainer(name: "Notes")
        container.loadPersistentStores { _, error in
            if let error { fatalError("unreadable store: \(error)") }
        }
    }

    func save(_ context: NSManagedObjectContext) throws {
        if context.hasChanges { try context.save() }
    }
}
