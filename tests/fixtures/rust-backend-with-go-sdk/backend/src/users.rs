use axum::{routing::get, Router};

pub fn users_routes() -> Router {
    Router::new().route("/api/users", get(|| async { "ok" }))
}
