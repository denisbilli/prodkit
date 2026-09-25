use actix_web::{web, App, HttpResponse, HttpServer};

async fn post_comment(limiter: web::Data<Limiter>) -> HttpResponse {
    if !limiter.check() {
        return HttpResponse::TooManyRequests().finish();
    }
    HttpResponse::Ok().finish()
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().route("/comment", web::post().to(post_comment)))
        .bind(("0.0.0.0", 8536))?
        .run()
        .await
}
