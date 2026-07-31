use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub(crate) const DEFAULT_WORKSPACE_PORT: u16 = 54310;
pub(crate) const DEFAULT_DASHBOARD_PORT: u16 = 54311;
pub(crate) const DEFAULT_BROWSER_PORT: u16 = 54312;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct DesktopSettings {
    pub(crate) browser_executable: Option<PathBuf>,
    pub(crate) browser_port: u16,
    pub(crate) dashboard_port: u16,
    pub(crate) workspace_port: u16,
}

impl Default for DesktopSettings {
    fn default() -> Self {
        Self {
            browser_executable: None,
            browser_port: DEFAULT_BROWSER_PORT,
            dashboard_port: DEFAULT_DASHBOARD_PORT,
            workspace_port: DEFAULT_WORKSPACE_PORT,
        }
    }
}

impl DesktopSettings {
    pub(crate) fn from_fields(
        workspace_port: &str,
        dashboard_port: &str,
        browser_port: &str,
        browser_executable: &str,
    ) -> Result<Self, String> {
        let browser_executable = match browser_executable.trim() {
            "" => None,
            value => Some(PathBuf::from(value)),
        };
        let settings = Self {
            browser_executable,
            browser_port: parse_port("Browser port", browser_port)?,
            dashboard_port: parse_port("Dashboard port", dashboard_port)?,
            workspace_port: parse_port("Workspace port", workspace_port)?,
        };
        settings.validate()?;
        Ok(settings)
    }

    pub(crate) fn dashboard_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.dashboard_port)
    }

    pub(crate) fn load(path: &Path) -> Result<Self, String> {
        let serialized = match fs::read_to_string(path) {
            Ok(serialized) => serialized,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Self::default()),
            Err(error) => return Err(format!("Cannot read {}: {error}", path.display())),
        };
        let settings: Self = serde_json::from_str(&serialized)
            .map_err(|error| format!("Cannot parse {}: {error}", path.display()))?;
        settings.validate()?;
        Ok(settings)
    }

    pub(crate) fn save(&self, path: &Path) -> Result<(), String> {
        self.validate()?;
        let parent = path
            .parent()
            .ok_or_else(|| "Settings path has no parent directory.".to_owned())?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("Cannot create settings directory: {error}"))?;
        let serialized = serde_json::to_string_pretty(self)
            .map_err(|error| format!("Cannot serialize settings: {error}"))?;
        fs::write(path, format!("{serialized}\n"))
            .map_err(|error| format!("Cannot write {}: {error}", path.display()))
    }

    fn validate(&self) -> Result<(), String> {
        let ports = [self.workspace_port, self.dashboard_port, self.browser_port];
        if ports.contains(&0) {
            return Err("Ports must be between 1 and 65535.".to_owned());
        }
        if ports.into_iter().collect::<HashSet<_>>().len() != ports.len() {
            return Err("Workspace, Dashboard, and Browser ports must differ.".to_owned());
        }
        if let Some(executable) = &self.browser_executable {
            if !executable.is_absolute() {
                return Err("Browser executable path must be absolute.".to_owned());
            }
            let metadata = executable.metadata().map_err(|error| {
                format!(
                    "Cannot access browser executable {}: {error}",
                    executable.display()
                )
            })?;
            if !metadata.is_file() {
                return Err(format!(
                    "Browser executable {} is not a file.",
                    executable.display()
                ));
            }
        }
        Ok(())
    }
}

fn parse_port(label: &str, value: &str) -> Result<u16, String> {
    value
        .trim()
        .parse::<u16>()
        .ok()
        .filter(|port| *port > 0)
        .ok_or_else(|| format!("{label} must be a number between 1 and 65535."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_preserve_the_documented_desktop_addresses() {
        let settings = DesktopSettings::default();

        assert_eq!(settings.workspace_port, 54310);
        assert_eq!(settings.dashboard_url(), "http://127.0.0.1:54311");
        assert_eq!(settings.browser_port, 54312);
        assert_eq!(settings.browser_executable, None);
    }

    #[test]
    fn rejects_duplicate_ports() {
        let result = DesktopSettings::from_fields("54310", "54310", "54312", "");

        assert_eq!(
            result.expect_err("duplicate ports should be rejected"),
            "Workspace, Dashboard, and Browser ports must differ."
        );
    }

    #[test]
    fn rejects_a_relative_browser_path() {
        let result = DesktopSettings::from_fields("54310", "54311", "54312", "relative/chrome");

        assert_eq!(
            result.expect_err("relative paths should be rejected"),
            "Browser executable path must be absolute."
        );
    }

    #[test]
    fn missing_settings_use_defaults() {
        let path = std::env::temp_dir().join(format!(
            "job-boardwalk-missing-settings-{}.json",
            std::process::id()
        ));
        let _ = fs::remove_file(&path);

        assert_eq!(
            DesktopSettings::load(&path).expect("missing settings should use defaults"),
            DesktopSettings::default()
        );
    }

    #[test]
    fn saves_and_loads_valid_settings() {
        let executable =
            std::env::current_exe().expect("the test executable path should be available");
        let settings = DesktopSettings::from_fields(
            "55310",
            "55311",
            "55312",
            executable
                .to_str()
                .expect("the test executable path should be UTF-8"),
        )
        .expect("synthetic settings should be valid");
        let directory = std::env::temp_dir().join(format!(
            "job-boardwalk-desktop-settings-{}",
            std::process::id()
        ));
        let path = directory.join("settings.json");
        let _ = fs::remove_dir_all(&directory);

        settings.save(&path).expect("settings should be saved");
        assert_eq!(
            DesktopSettings::load(&path).expect("settings should be loaded"),
            settings
        );

        fs::remove_dir_all(directory).expect("settings test directory should be removable");
    }
}
