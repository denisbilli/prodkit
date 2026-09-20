use axum::{routing::get, Router};

pub fn tokens_routes() -> Router {
    Router::new().route("/api/tokens", get(|| async { "ok" }))
}
