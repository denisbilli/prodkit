use axum::{routing::get, Router};

pub fn schedule_routes() -> Router {
    Router::new().route("/api/schedule", get(|| async { "ok" }))
}
