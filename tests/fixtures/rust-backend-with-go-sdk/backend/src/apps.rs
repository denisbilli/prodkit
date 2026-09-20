use axum::{routing::get, Router};

pub fn apps_routes() -> Router {
    Router::new().route("/api/apps", get(|| async { "ok" }))
}
