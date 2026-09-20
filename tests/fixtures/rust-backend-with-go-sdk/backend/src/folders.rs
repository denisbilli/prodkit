use axum::{routing::get, Router};

pub fn folders_routes() -> Router {
    Router::new().route("/api/folders", get(|| async { "ok" }))
}
