use axum::{routing::get, Router};

pub fn scripts_routes() -> Router {
    Router::new().route("/api/scripts", get(|| async { "ok" }))
}
