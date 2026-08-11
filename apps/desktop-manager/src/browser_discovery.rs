use std::env;
use std::path::{Path, PathBuf};

const DEVELOPMENT_BROWSER_ENVIRONMENT: &str = "JOB_BOARDWALK_BROWSER_EXECUTABLE_PATH";

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

fn describe_selection(candidate: &BrowserCandidate) -> String {
    match candidate.source {
        BrowserSource::Configured => "Browser executable · Selected in Settings".to_owned(),
        BrowserSource::Development => "Browser executable · Development override".to_owned(),
        BrowserSource::System => format!("{} · Detected automatically", candidate.label),
    }
}

fn discover_from_candidates(candidates: Vec<BrowserCandidate>) -> Result<BrowserSelection, String> {
    for candidate in candidates {
        if candidate.executable.is_file() {
            return Ok(BrowserSelection {
                detail: describe_selection(&candidate),
                executable: candidate.executable,
            });
        }
    }
    Err(
        "No Chrome, Edge, or Chromium executable found. Install one or select it in Settings."
            .to_owned(),
    )
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
    discover_from_candidates(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_browser_is_the_only_candidate() {
        let executable = std::env::current_exe().expect("test executable should be available");
        let selection = discover_from_candidates(vec![candidate(
            "Configured browser",
            &executable,
            BrowserSource::Configured,
        )])
        .expect("configured browser should be selected");

        assert_eq!(selection.executable, executable);
        assert_eq!(
            selection.detail,
            "Browser executable · Selected in Settings"
        );
    }

    #[test]
    fn reports_an_actionable_error_when_no_candidate_exists() {
        let error = discover_from_candidates(Vec::new()).expect_err("empty candidates should fail");

        assert_eq!(
            error,
            "No Chrome, Edge, or Chromium executable found. Install one or select it in Settings."
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
