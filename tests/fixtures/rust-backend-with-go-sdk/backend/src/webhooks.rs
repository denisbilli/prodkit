use axum::{routing::get, Router};

pub fn webhooks_routes() -> Router {
    Router::new().route("/api/webhooks", get(|| async { "ok" }))
}
