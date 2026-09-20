use axum::{routing::get, Router};

pub fn audit_routes() -> Router {
    Router::new().route("/api/audit", get(|| async { "ok" }))
}
