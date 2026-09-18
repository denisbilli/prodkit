pub struct Session {
    documents: Vec<String>,
}

impl Session {
    pub fn open(&mut self, uri: String) {
        self.documents.push(uri);
    }
}
