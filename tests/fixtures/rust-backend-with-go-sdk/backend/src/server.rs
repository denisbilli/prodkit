use axum::{routing::get, Router};

pub fn server_routes() -> Router {
    Router::new().route("/api/server", get(|| async { "ok" }))
}
