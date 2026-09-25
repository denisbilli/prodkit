use actix_extensible_rate_limit::RateLimiter;
use actix_web::{web, App, HttpResponse, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().wrap(RateLimiter::builder(backend(), input()).build()).route("/", web::get().to(|| async { HttpResponse::Ok().finish() })))
        .bind(("0.0.0.0", 8536))?
        .run()
        .await
}
