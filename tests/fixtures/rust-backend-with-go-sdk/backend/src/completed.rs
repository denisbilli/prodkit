use axum::{routing::get, Router};

pub fn completed_routes() -> Router {
    Router::new().route("/api/completed", get(|| async { "ok" }))
}
