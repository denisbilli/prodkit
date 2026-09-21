use governor::{Quota, RateLimiter};
use std::num::NonZeroU32;

pub fn check_limit_login(ip: &str) -> bool {
    let quota = Quota::per_minute(NonZeroU32::new(10).unwrap());
    let limiter = RateLimiter::keyed(quota);
    limiter.check_key(&ip.to_string()).is_ok()
}
