use axum::{routing::get, Router};

pub fn auth_routes() -> Router {
    Router::new().route("/api/auth", get(|| async { "ok" }))
}
