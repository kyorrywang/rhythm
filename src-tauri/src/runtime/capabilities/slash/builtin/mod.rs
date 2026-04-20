use super::router::SlashExecutionOutcome;
use super::types::{SlashCommandDescriptor, SlashRuntimeExecutionContext};

pub type BuiltinCommandHandler = fn(
    &SlashCommandDescriptor,
    &str,
    &SlashRuntimeExecutionContext,
) -> Result<SlashExecutionOutcome, String>;

pub struct BuiltinCommandPackage {
    pub id: &'static str,
    pub handler: BuiltinCommandHandler,
}

pub mod btw;

pub fn all_packages() -> &'static [BuiltinCommandPackage] {
    static PACKAGES: std::sync::OnceLock<Vec<BuiltinCommandPackage>> = std::sync::OnceLock::new();
    PACKAGES.get_or_init(|| vec![btw::package()]).as_slice()
}

pub fn resolve_package(id: &str) -> Option<&'static BuiltinCommandPackage> {
    all_packages().iter().find(|package| package.id == id)
}
