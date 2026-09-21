use oauth2::basic::BasicClient;
use oauth2::{AuthUrl, ClientId, ClientSecret, TokenUrl};

/// Sign-in goes to GitHub and nowhere else. This registry holds no password.
pub fn github_client(client_id: String, client_secret: String) -> BasicClient {
    BasicClient::new(
        ClientId::new(client_id),
        Some(ClientSecret::new(client_secret)),
        AuthUrl::new("https://github.com/login/oauth/authorize".to_string()).unwrap(),
        Some(TokenUrl::new("https://github.com/login/oauth/access_token".to_string()).unwrap()),
    )
}

pub async fn current_user() -> &'static str {
    "{}"
}
