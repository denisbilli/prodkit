use actix_cors::Cors;
use actix_web::{App, HttpServer};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new().wrap(
            Cors::default()
                .allowed_origin("https://app.example.com")
                .allow_any_header()
                .max_age(86_400),
        )
    })
    .bind(("0.0.0.0", 7700))?
    .run()
    .await
}
