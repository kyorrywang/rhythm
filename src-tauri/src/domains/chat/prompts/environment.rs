use std::path::Path;

/// Runtime environment information injected into the system prompt.
pub struct EnvironmentInfo {
    pub os_name: String,
    pub os_version: String,
    pub shell: String,
    pub cwd: String,
    pub date: String,
    pub is_git_repo: bool,
    pub git_branch: Option<String>,
    pub hostname: String,
}

pub fn get_environment_info(cwd: &Path) -> EnvironmentInfo {
    let os_name = std::env::consts::OS.to_string();
    let os_version = get_os_version();
    let shell = detect_shell();
    let cwd_str = cwd.display().to_string();
    let date = current_date();
    let (is_git_repo, git_branch) = detect_git(cwd);
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    EnvironmentInfo {
        os_name,
        os_version,
        shell,
        cwd: cwd_str,
        date,
        is_git_repo,
        git_branch,
        hostname,
    }
}

fn get_os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/C", "ver"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "Windows".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("uname")
            .arg("-r")
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_else(|_| "unknown".to_string())
    }
}

fn detect_shell() -> String {
    if cfg!(target_os = "windows") {
        if std::env::var("PSModulePath").is_ok() && std::env::var("WT_SESSION").is_ok() {
            return "pwsh".to_string();
        }
        if std::env::var("PSModulePath").is_ok() {
            return "powershell".to_string();
        }
        "cmd".to_string()
    } else {
        std::env::var("SHELL")
            .map(|s| s.split('/').last().unwrap_or("sh").to_string())
            .unwrap_or_else(|_| "sh".to_string())
    }
}

fn detect_git(cwd: &Path) -> (bool, Option<String>) {
    let git_dir = std::process::Command::new("git")
        .args(&["rev-parse", "--git-dir"])
        .current_dir(cwd)
        .output();

    let is_git_repo = match &git_dir {
        Ok(o) => o.status.success(),
        Err(_) => false,
    };

    if !is_git_repo {
        return (false, None);
    }

    let branch_output = std::process::Command::new("git")
        .args(&["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(cwd)
        .output();

    match branch_output {
        Ok(o) if o.status.success() => {
            let branch = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if branch == "HEAD" {
                (true, Some("HEAD (detached)".to_string()))
            } else {
                (true, Some(branch))
            }
        }
        _ => (true, None),
    }
}

fn current_date() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let days = secs / 86400;
    let mut year = 1970i64;
    let mut remaining_days = days as i64;

    loop {
        let days_in_year = if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
            366
        } else {
            365
        };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }

    let month_days = if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };

    let mut month = 1usize;
    let mut day = remaining_days;
    for (i, &days_in_month) in month_days.iter().enumerate() {
        if day < days_in_month as i64 {
            month = i + 1;
            break;
        }
        day -= days_in_month as i64;
    }
    let day = day + 1;

    format!("{:04}-{:02}-{:02}", year, month, day)
}

pub fn format_environment_section(env: &EnvironmentInfo) -> String {
    let mut lines = vec![
        "# Environment".to_string(),
        format!("- OS: {} {}", env.os_name, env.os_version),
        format!("- Shell: {}", env.shell),
        format!("- Working directory: {}", env.cwd),
        format!("- Date: {}", env.date),
        format!("- Hostname: {}", env.hostname),
    ];
    if env.is_git_repo {
        lines.push(format!(
            "- Git: yes{}",
            env.git_branch
                .as_deref()
                .map(|b| format!(" (branch: {})", b))
                .unwrap_or_default()
        ));
    } else {
        lines.push("- Git: no".to_string());
    }
    lines.join("\n")
}
