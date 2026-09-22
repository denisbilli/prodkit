#[macro_use]
extern crate rocket;

mod auth;

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/identity", routes![connect_token])
}

#[post("/connect/token")]
fn connect_token() -> &'static str {
    "{}"
}
