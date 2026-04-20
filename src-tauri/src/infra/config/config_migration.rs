use super::defaults::default_schema_version;
use super::*;

pub(super) fn upgrade_config_bundle(
    raw_value: serde_json::Value,
) -> Result<(ConfigBundle, bool), String> {
    let version = raw_value
        .get("schema_version")
        .and_then(|value| value.as_u64())
        .or_else(|| {
            raw_value
                .get("schemaVersion")
                .and_then(|value| value.as_u64())
        })
        .unwrap_or(default_schema_version() as u64);

    match version {
        2 => {
            let bundle: ConfigBundle = serde_json::from_value(raw_value)
                .map_err(|e| format!("config bundle parse failed: {e}"))?;
            Ok((bundle, false))
        }
        other => Err(format!("Unsupported config schema version: {}", other)),
    }
}
