#[macro_use]
extern crate rocket;

mod api;
mod ratelimit;

#[launch]
fn rocket() -> _ {
    rocket::build().mount("/", api::routes())
}
