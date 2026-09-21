use argon2::password_hash::{PasswordHasher, SaltString};
use argon2::Argon2;
use oauth2::basic::BasicClient;

/// GitHub is offered, and so is a password of our own — which is a password to reset.
pub fn hash(password: &str, salt: &SaltString) -> String {
    Argon2::default()
        .hash_password(password.as_bytes(), salt)
        .unwrap()
        .to_string()
}

pub async fn current_user() -> &'static str {
    "{}"
}

pub fn github_client() -> Option<BasicClient> {
    None
}
