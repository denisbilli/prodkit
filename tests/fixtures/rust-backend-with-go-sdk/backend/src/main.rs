use axum::{routing::get, Router};

pub fn main_routes() -> Router {
    Router::new().route("/api/main", get(|| async { "ok" }))
}
