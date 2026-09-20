import SwiftUI

struct NotesView: View {
    @State private var notes: [String] = []

    var body: some View {
        List(notes, id: \.self) { note in
            Text(note)
        }
    }
}
