use axum::{routing::get, Router};

pub fn oauth_routes() -> Router {
    Router::new().route("/api/oauth", get(|| async { "ok" }))
}
