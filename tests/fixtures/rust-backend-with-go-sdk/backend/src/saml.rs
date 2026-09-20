use axum::{routing::get, Router};

pub fn saml_routes() -> Router {
    Router::new().route("/api/saml", get(|| async { "ok" }))
}
