use std::sync::Arc;

pub struct AppState {
    pub active_registration_code: tokio::sync::RwLock<Option<String>>,
}

pub async fn get_otp(state: Arc<AppState>) -> Option<String> {
    let otp = state.active_registration_code.read().await.clone();
    otp
}

pub fn generate_otp() -> String {
    format!("{:06}", rand::random::<u32>() % 1_000_000)
}
