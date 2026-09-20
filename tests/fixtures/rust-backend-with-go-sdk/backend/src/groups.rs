use axum::{routing::get, Router};

pub fn groups_routes() -> Router {
    Router::new().route("/api/groups", get(|| async { "ok" }))
}
