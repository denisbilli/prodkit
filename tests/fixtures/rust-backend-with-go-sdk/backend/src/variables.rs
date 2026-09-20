use axum::{routing::get, Router};

pub fn variables_routes() -> Router {
    Router::new().route("/api/variables", get(|| async { "ok" }))
}
