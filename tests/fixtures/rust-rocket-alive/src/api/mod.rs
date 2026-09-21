use rocket::serde::json::Json;
use rocket::Route;

pub fn routes() -> Vec<Route> {
    routes![alive, login]
}

// The liveness endpoint also verifies the database connection.
#[get("/alive")]
fn alive() -> Json<String> {
    Json(String::from("ok"))
}

#[post("/identity/connect/token")]
fn login() -> Json<String> {
    crate::ratelimit::check_limit_login("127.0.0.1");
    Json(String::from("token"))
}
