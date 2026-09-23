pub struct Router;

impl Router {
    pub fn new() -> Self {
        Router
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn builds() {
        let _ = super::Router::new();
    }
}
