use axum::{routing::post, Router};

mod rate_limiter;

#[tokio::main]
async fn main() {
    let app = Router::new().route("/crates/new", post(publish));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8888").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn publish() -> &'static str {
    "{}"
}
