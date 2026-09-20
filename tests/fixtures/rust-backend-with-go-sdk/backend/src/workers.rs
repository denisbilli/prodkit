use axum::{routing::get, Router};

pub fn workers_routes() -> Router {
    Router::new().route("/api/workers", get(|| async { "ok" }))
}
