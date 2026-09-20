use axum::{routing::get, Router};

pub fn jobs_routes() -> Router {
    Router::new().route("/api/jobs", get(|| async { "ok" }))
}
