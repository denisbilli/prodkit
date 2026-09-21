mod router;

#[tokio::main]
async fn main() {
    let app = router::router();
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8888").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
