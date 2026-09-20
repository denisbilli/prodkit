use axum::{routing::get, Router};

pub fn flows_routes() -> Router {
    Router::new().route("/api/flows", get(|| async { "ok" }))
}
