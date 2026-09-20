use axum::{routing::get, Router};

pub fn settings_routes() -> Router {
    Router::new().route("/api/settings", get(|| async { "ok" }))
}
