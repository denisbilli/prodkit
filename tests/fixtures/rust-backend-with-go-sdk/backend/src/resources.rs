use axum::{routing::get, Router};

pub fn resources_routes() -> Router {
    Router::new().route("/api/resources", get(|| async { "ok" }))
}
