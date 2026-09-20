use std::env;

pub struct Authentication {
    pub secret_key: String,
}

impl Authentication {
    pub fn from_environment() -> Self {
        Self {
            secret_key: env::var("WEBHOOK_SECRET_KEY").expect("WEBHOOK_SECRET_KEY must be set"),
        }
    }

    pub fn verify(&self, signature: &str) -> bool {
        signature == self.secret_key
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_the_wrong_secret() {
        let method = Authentication {
            secret_key: "wrong_secret".to_string(),
        };

        assert!(!method.verify("correct_secret"));
    }

    #[test]
    fn accepts_the_right_one() {
        let method = Authentication {
            secret_key: "changeme".to_string(),
        };

        assert!(method.verify("changeme"));
    }
}
