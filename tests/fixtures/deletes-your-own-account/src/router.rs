use axum::routing::{delete, get, post};
use axum::Router;

pub fn router() -> Router {
    Router::new()
        .route("/register", post(handlers::user::register))
        .route("/login", post(handlers::user::login))
        .route("/account", delete(handlers::user::delete))
        .route("/history", get(handlers::history::list))
}
