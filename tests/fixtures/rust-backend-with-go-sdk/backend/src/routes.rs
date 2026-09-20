use axum::{routing::get, Router};

pub fn routes_routes() -> Router {
    Router::new().route("/api/routes", get(|| async { "ok" }))
}
