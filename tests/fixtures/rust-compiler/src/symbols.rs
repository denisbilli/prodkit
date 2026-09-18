use crate::member::ScopedMemberId;

pub struct Definition {
    id: ScopedMemberId,
}

pub fn resolve(env: &str) -> Result<String, std::env::VarError> {
    std::env::var(env).map_err(|_| std::env::VarError::NotPresent)
}

pub fn rule_code() -> &'static str {
    "PandasUseOfDotPivotOrUnstack"
}
