use axum::{routing::get, Router};

pub fn capture_routes() -> Router {
    Router::new().route("/api/capture", get(|| async { "ok" }))
}
