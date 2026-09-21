use axum::{routing::get, Router};

mod auth;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/crates", get(|| async { "[]" }))
        .route("/me", get(auth::current_user));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8888").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
