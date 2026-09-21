use http::StatusCode;

/// A bucket per publisher, refilled on a schedule. No crate: this is the whole thing.
pub struct RateLimiter {
    tokens: u32,
}

impl RateLimiter {
    pub fn check(&mut self) -> Result<(), (StatusCode, &'static str)> {
        if self.tokens == 0 {
            return Err((StatusCode::TOO_MANY_REQUESTS, "too many uploads"));
        }

        self.tokens -= 1;
        Ok(())
    }
}
