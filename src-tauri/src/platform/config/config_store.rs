use super::*;

pub(super) fn load_config_bundle() -> ConfigBundle {
    let path = paths::get_settings_path();

    if !path.exists() {
        return create_default_config(&path);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[config] Failed to read config bundle: {}", e);
            return create_default_config(&path);
        }
    };

    let raw_value = match serde_json::from_str::<serde_json::Value>(&content) {
        Ok(value) => value,
        Err(e) => {
            eprintln!(
                "[config] Failed to parse config bundle, using defaults: {}",
                e
            );
            return create_default_config(&path);
        }
    };

    let (mut bundle, migrated) = match upgrade_config_bundle(raw_value) {
        Ok(result) => result,
        Err(error) => {
            eprintln!("[config] Failed to upgrade config bundle: {}", error);
            let bundle = create_default_config(&path);
            let _ = save_config_bundle(&bundle);
            return bundle;
        }
    };

    let normalized = normalize_config_bundle(&mut bundle);
    let agent_definitions = match crate::domains::agents::load_all_agent_definitions(None) {
        Ok(definitions) => definitions,
        Err(error) => {
            eprintln!("[config] Failed to load agent definitions: {}", error);
            crate::domains::agents::default_agent_definitions()
        }
    };
    crate::domains::agents::merge_agent_definitions_into_settings(&mut bundle, &agent_definitions);
    if let Err(errors) = validate_config_bundle(&bundle) {
        eprintln!(
            "[config] Invalid config bundle; restoring defaults:\n{}",
            errors.join("\n")
        );
        let bundle = create_default_config(&path);
        let _ = save_config_bundle(&bundle);
        return bundle;
    }

    if migrated || normalized {
        let _ = save_config_bundle(&bundle);
    }

    bundle
}

pub(super) fn create_default_config(path: &std::path::Path) -> ConfigBundle {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let mut bundle = ConfigBundle::default();
    normalize_config_bundle(&mut bundle);
    if let Ok(agent_definitions) = crate::domains::agents::load_all_agent_definitions(None) {
        crate::domains::agents::merge_agent_definitions_into_settings(
            &mut bundle,
            &agent_definitions,
        );
    }

    if let Err(e) = save_config_bundle(&bundle) {
        eprintln!("[config] Failed to write config bundle: {}", e);
    }

    bundle
}

pub(super) fn cleanup_legacy_config_path() {
    let legacy_path = paths::get_legacy_config_path();
    if legacy_path.exists() {
        let _ = fs::remove_file(&legacy_path);
    }
    if let Some(parent) = legacy_path.parent() {
        if parent.file_name().and_then(|segment| segment.to_str()) == Some("config") {
            let _ = fs::remove_dir(parent);
        }
    }
}

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

pub(super) fn save_config_bundle(bundle: &ConfigBundle) -> Result<(), String> {
    let path = paths::get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut normalized = bundle.clone();
    normalize_config_bundle(&mut normalized);
    validate_config_bundle(&normalized).map_err(|errors| errors.join("\n"))?;
    let mut persisted = normalized.clone();
    let agent_definitions = crate::domains::agents::load_all_agent_definitions(None)
        .unwrap_or_else(|_| crate::domains::agents::default_agent_definitions());
    crate::domains::agents::strip_agent_data_from_settings(&mut persisted, &agent_definitions);
    let json = serde_json::to_string_pretty(&persisted).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    cleanup_legacy_config_path();
    Ok(())
}
