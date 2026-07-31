use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const DEVELOPMENT_BROWSER_ENVIRONMENT: &str = "JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BrowserSource {
    Configured,
    Development,
    System,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct BrowserCandidate {
    executable: PathBuf,
    label: &'static str,
    source: BrowserSource,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct BrowserSelection {
    pub(crate) executable: PathBuf,
    pub(crate) detail: String,
}

fn candidate(
    label: &'static str,
    executable: impl Into<PathBuf>,
    source: BrowserSource,
) -> BrowserCandidate {
    BrowserCandidate {
        executable: executable.into(),
        label,
        source,
    }
}

fn automatic_candidates() -> Vec<BrowserCandidate> {
    #[cfg(target_os = "macos")]
    {
        vec![
            candidate(
                "Google Chrome",
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                BrowserSource::System,
            ),
            candidate(
                "Microsoft Edge",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                BrowserSource::System,
            ),
            candidate(
                "Chromium",
                "/Applications/Chromium.app/Contents/MacOS/Chromium",
                BrowserSource::System,
            ),
        ]
    }

    #[cfg(target_os = "windows")]
    {
        let roots = [
            env::var_os("PROGRAMFILES"),
            env::var_os("PROGRAMFILES(X86)"),
            env::var_os("LOCALAPPDATA"),
        ];
        roots
            .into_iter()
            .flatten()
            .flat_map(|root| {
                let root = PathBuf::from(root);
                [
                    candidate(
                        "Google Chrome",
                        root.join("Google/Chrome/Application/chrome.exe"),
                        BrowserSource::System,
                    ),
                    candidate(
                        "Microsoft Edge",
                        root.join("Microsoft/Edge/Application/msedge.exe"),
                        BrowserSource::System,
                    ),
                    candidate(
                        "Chromium",
                        root.join("Chromium/Application/chrome.exe"),
                        BrowserSource::System,
                    ),
                ]
            })
            .collect()
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        vec![
            candidate(
                "Google Chrome",
                "/usr/bin/google-chrome",
                BrowserSource::System,
            ),
            candidate(
                "Google Chrome",
                "/usr/bin/google-chrome-stable",
                BrowserSource::System,
            ),
            candidate(
                "Google Chrome",
                "/opt/google/chrome/chrome",
                BrowserSource::System,
            ),
            candidate(
                "Microsoft Edge",
                "/usr/bin/microsoft-edge",
                BrowserSource::System,
            ),
            candidate(
                "Microsoft Edge",
                "/usr/bin/microsoft-edge-stable",
                BrowserSource::System,
            ),
            candidate(
                "Microsoft Edge",
                "/opt/microsoft/msedge/msedge",
                BrowserSource::System,
            ),
            candidate("Chromium", "/usr/bin/chromium", BrowserSource::System),
            candidate(
                "Chromium",
                "/usr/bin/chromium-browser",
                BrowserSource::System,
            ),
            candidate("Chromium", "/snap/bin/chromium", BrowserSource::System),
        ]
    }
}

fn version_from_output(output: &str) -> Option<String> {
    output
        .split(|character: char| !(character.is_ascii_digit() || character == '.'))
        .find(|part| {
            let segments = part.split('.').collect::<Vec<_>>();
            segments.len() >= 2
                && segments.iter().all(|segment| {
                    !segment.is_empty() && segment.chars().all(|c| c.is_ascii_digit())
                })
        })
        .map(ToOwned::to_owned)
}

fn inspect_browser(executable: &Path) -> Result<String, String> {
    let mut command = Command::new(executable);
    command.arg("--version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|error| format!("cannot run version check: {error}"))?;
    if !output.status.success() {
        return Err(format!("version check exited with {}", output.status));
    }
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    version_from_output(&combined)
        .ok_or_else(|| "version check did not report a recognizable version".to_owned())
}

fn describe_selection(candidate: &BrowserCandidate, version: &str) -> String {
    match candidate.source {
        BrowserSource::Configured => format!("Browser {version} · Selected in Settings"),
        BrowserSource::Development => format!("Browser {version} · Development override"),
        BrowserSource::System => format!("{} {version} · Detected automatically", candidate.label),
    }
}

fn discover_from_candidates(
    candidates: Vec<BrowserCandidate>,
    inspect: impl Fn(&Path) -> Result<String, String>,
) -> Result<BrowserSelection, String> {
    let mut first_inspection_error = None;
    for candidate in candidates {
        if !candidate.executable.is_file() {
            continue;
        }
        match inspect(&candidate.executable) {
            Ok(version) => {
                return Ok(BrowserSelection {
                    detail: describe_selection(&candidate, &version),
                    executable: candidate.executable,
                });
            }
            Err(_) if first_inspection_error.is_none() => {
                first_inspection_error = Some(match candidate.source {
                    BrowserSource::Configured => {
                        "The selected browser could not be verified. Select a different executable in Settings."
                            .to_owned()
                    }
                    BrowserSource::Development => {
                        "The development browser override could not be verified.".to_owned()
                    }
                    BrowserSource::System => format!(
                        "{} was found but could not be verified. Select another browser in Settings.",
                        candidate.label
                    ),
                });
            }
            Err(_) => {}
        }
    }
    Err(first_inspection_error.unwrap_or_else(|| {
        "No compatible browser found. Install Chrome, Edge, or Chromium, or select one in Settings."
            .to_owned()
    }))
}

pub(crate) fn discover_browser(
    configured_executable: Option<&Path>,
) -> Result<BrowserSelection, String> {
    let candidates = if let Some(executable) = configured_executable {
        vec![candidate(
            "Configured browser",
            executable,
            BrowserSource::Configured,
        )]
    } else if let Some(executable) =
        env::var_os(DEVELOPMENT_BROWSER_ENVIRONMENT).filter(|value| !value.is_empty())
    {
        let executable = PathBuf::from(executable);
        if !executable.is_absolute() {
            return Err(format!(
                "{DEVELOPMENT_BROWSER_ENVIRONMENT} must be an absolute path."
            ));
        }
        vec![candidate(
            "Development browser",
            executable,
            BrowserSource::Development,
        )]
    } else {
        automatic_candidates()
    };
    discover_from_candidates(candidates, inspect_browser)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_browser_version_without_assuming_a_brand() {
        assert_eq!(
            version_from_output("Google Chrome for Testing 149.0.7827.55"),
            Some("149.0.7827.55".to_owned())
        );
    }

    #[test]
    fn configured_browser_is_the_only_candidate() {
        let executable = std::env::current_exe().expect("test executable should be available");
        let selection = discover_from_candidates(
            vec![candidate(
                "Configured browser",
                &executable,
                BrowserSource::Configured,
            )],
            |_| Ok("149.0.7827.55".to_owned()),
        )
        .expect("configured browser should be selected");

        assert_eq!(selection.executable, executable);
        assert_eq!(
            selection.detail,
            "Browser 149.0.7827.55 · Selected in Settings"
        );
    }

    #[test]
    fn reports_an_actionable_error_when_no_candidate_exists() {
        let error = discover_from_candidates(Vec::new(), |_| unreachable!())
            .expect_err("empty candidates should fail");

        assert_eq!(
            error,
            "No compatible browser found. Install Chrome, Edge, or Chromium, or select one in Settings."
        );
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_system_candidates_include_chromium() {
        assert!(
            automatic_candidates()
                .iter()
                .any(|candidate| candidate.executable == Path::new("/usr/bin/chromium"))
        );
    }
}
