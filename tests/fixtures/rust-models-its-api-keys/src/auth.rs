use serde::{Deserialize, Serialize};

pub type OrgApiKeyId = String;

#[derive(Debug, Serialize, Deserialize)]
pub struct OrgApiKeyLoginJwtClaims {
    pub exp: i64,
    pub iss: String,
    pub sub: OrgApiKeyId,
    pub client_id: String,
    pub scope: Vec<String>,
}

pub fn decode_api_org(token: &str) -> Result<OrgApiKeyLoginJwtClaims, Error> {
    decode_jwt(token, JWT_ORG_API_KEY_ISSUER.to_string())
}
