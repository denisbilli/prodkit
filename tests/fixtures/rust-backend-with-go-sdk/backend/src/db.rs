use axum::{routing::get, Router};

pub fn db_routes() -> Router {
    Router::new().route("/api/db", get(|| async { "ok" }))
}
