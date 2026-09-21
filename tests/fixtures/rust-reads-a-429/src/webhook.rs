use http::StatusCode;

/// Calling somebody else's API. Being throttled is not throttling.
pub async fn deliver(client: &reqwest::Client, url: &str) -> bool {
    let response = client.post(url).send().await.unwrap();

    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        return false;
    }

    true
}
