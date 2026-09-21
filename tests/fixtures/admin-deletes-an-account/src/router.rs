use axum::routing::{delete, get, post};
use axum::Router;

pub fn router() -> Router {
    Router::new()
        .route("/register", post(handlers::user::register))
        .route("/login", post(handlers::user::login))
        .route("/accounts/:id", delete(handlers::admin::remove_account))
        .route("/accounts", get(handlers::admin::list_accounts))
}
