use std::fs;
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

use atomic_write_file::AtomicWriteFile;
use serde::{Deserialize, Serialize};
use thiserror::Error;

pub(crate) const DEFAULT_WORKSPACE_PORT: u16 = 54310;
pub(crate) const DEFAULT_DASHBOARD_PORT: u16 = 54311;
pub(crate) const DEFAULT_BROWSER_PORT: u16 = 54312;

#[derive(Debug, Error)]
pub(crate) enum DesktopSettingsError {
    #[error("Cannot access browser executable {path}: {source}")]
    BrowserExecutable {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("Cannot parse {path}: {source}")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("Cannot read {path}: {source}")]
    Read {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("Cannot create settings directory: {0}")]
    SettingsDirectory(#[source] io::Error),
    #[error("Cannot serialize settings: {0}")]
    Serialize(#[source] serde_json::Error),
    #[error("{0}")]
    Validation(String),
    #[error("Cannot write {path}: {source}")]
    Write {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
}

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
    ) -> Result<Self, DesktopSettingsError> {
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

    pub(crate) fn load(path: &Path) -> Result<Self, DesktopSettingsError> {
        let serialized = match fs::read_to_string(path) {
            Ok(serialized) => serialized,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Self::default()),
            Err(source) => {
                return Err(DesktopSettingsError::Read {
                    path: path.to_owned(),
                    source,
                });
            }
        };
        let settings: Self =
            serde_json::from_str(&serialized).map_err(|source| DesktopSettingsError::Parse {
                path: path.to_owned(),
                source,
            })?;
        settings.validate()?;
        Ok(settings)
    }

    pub(crate) fn save(&self, path: &Path) -> Result<(), DesktopSettingsError> {
        self.validate()?;
        let parent = path
            .parent()
            .ok_or_else(|| validation_error("Settings path has no parent directory."))?;
        fs::create_dir_all(parent).map_err(DesktopSettingsError::SettingsDirectory)?;
        let serialized =
            serde_json::to_string_pretty(self).map_err(DesktopSettingsError::Serialize)?;
        let write_error = |source| DesktopSettingsError::Write {
            path: path.to_owned(),
            source,
        };
        let mut file = AtomicWriteFile::open(path).map_err(write_error)?;
        writeln!(file, "{serialized}").map_err(write_error)?;
        file.commit().map_err(write_error)
    }

    fn validate(&self) -> Result<(), DesktopSettingsError> {
        let ports = [self.workspace_port, self.dashboard_port, self.browser_port];
        if ports.contains(&0) {
            return Err(validation_error("Ports must be between 1 and 65535."));
        }
        if self.workspace_port == self.dashboard_port
            || self.workspace_port == self.browser_port
            || self.dashboard_port == self.browser_port
        {
            return Err(validation_error(
                "Workspace, Dashboard, and Browser ports must differ.",
            ));
        }
        if let Some(executable) = &self.browser_executable {
            if !executable.is_absolute() {
                return Err(validation_error(
                    "Browser executable path must be absolute.",
                ));
            }
            let metadata = executable.metadata().map_err(|source| {
                DesktopSettingsError::BrowserExecutable {
                    path: executable.clone(),
                    source,
                }
            })?;
            if !metadata.is_file() {
                return Err(validation_error(format!(
                    "Browser executable {} is not a file.",
                    executable.display()
                )));
            }
        }
        Ok(())
    }
}

fn parse_port(label: &str, value: &str) -> Result<u16, DesktopSettingsError> {
    value
        .trim()
        .parse::<u16>()
        .ok()
        .filter(|port| *port > 0)
        .ok_or_else(|| validation_error(format!("{label} must be a number between 1 and 65535.")))
}

fn validation_error(message: impl Into<String>) -> DesktopSettingsError {
    DesktopSettingsError::Validation(message.into())
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

        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_relative_browser_path() {
        let result = DesktopSettings::from_fields("54310", "54311", "54312", "relative/chrome");

        assert!(result.is_err());
    }

    #[test]
    fn missing_settings_use_defaults() {
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let path = directory.path().join("settings.json");

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
        let directory = tempfile::tempdir().expect("temporary directory should be created");
        let path = directory.path().join("settings.json");

        settings.save(&path).expect("settings should be saved");
        assert_eq!(
            DesktopSettings::load(&path).expect("settings should be loaded"),
            settings
        );
    }
}
