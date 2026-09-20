use axum::{routing::get, Router};

pub fn queue_routes() -> Router {
    Router::new().route("/api/queue", get(|| async { "ok" }))
}
