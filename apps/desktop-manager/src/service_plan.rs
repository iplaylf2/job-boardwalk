use std::path::PathBuf;

use crate::browser_discovery::BrowserSelection;
use crate::caddy_lifecycle::CaddyLifecycle;
use crate::desktop_settings::DesktopSettings;
use crate::product_layout::ProductLayout;

pub(crate) struct ServiceSpec {
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<(String, String)>,
    pub(crate) executable: PathBuf,
    pub(crate) health_url: String,
    pub(crate) name: &'static str,
    pub(crate) optional: bool,
    pub(crate) shutdown: ShutdownMethod,
}

pub(crate) enum ShutdownMethod {
    Caddy(CaddyLifecycle),
    CloseStdin,
}

pub(crate) fn service_plan(
    layout: &ProductLayout,
    settings: &DesktopSettings,
    caddy_lifecycle: CaddyLifecycle,
    browser: Option<&BrowserSelection>,
) -> Vec<ServiceSpec> {
    let workspace_address = format!("127.0.0.1:{}", settings.workspace_port);
    let workspace_url = format!("http://{workspace_address}");
    let dashboard_url = settings.dashboard_url();
    let browser_url = format!("http://127.0.0.1:{}", settings.browser_port);
    let mut plan = vec![
        ServiceSpec {
            arguments: vec![
                "--role=workspace-service".to_owned(),
                format!(
                    "--service-entrypoint={}",
                    layout.workspace_service_entrypoint.display()
                ),
                format!(
                    "--workspace-database-path={}",
                    layout.workspace_database.display()
                ),
                format!(
                    "--migrations-directory={}",
                    layout.migrations_directory.display()
                ),
                "--hostname=127.0.0.1".to_owned(),
                format!("--port={}", settings.workspace_port),
            ],
            environment: Vec::new(),
            executable: layout.service_host_executable.clone(),
            health_url: format!("{workspace_url}/health"),
            name: "Workspace Service",
            optional: false,
            shutdown: ShutdownMethod::CloseStdin,
        },
        ServiceSpec {
            arguments: vec![
                "run".to_owned(),
                format!("--config={}", layout.caddyfile.display()),
                "--adapter=caddyfile".to_owned(),
            ],
            environment: vec![
                caddy_lifecycle.environment(),
                (
                    "JOB_BOARDWALK_DASHBOARD_ADDRESS".to_owned(),
                    dashboard_url.clone(),
                ),
                (
                    "JOB_BOARDWALK_DASHBOARD_DIRECTORY".to_owned(),
                    layout.dashboard_directory.display().to_string(),
                ),
                (
                    "JOB_BOARDWALK_WORKSPACE_SERVICE_ADDRESS".to_owned(),
                    workspace_address,
                ),
                (
                    "XDG_CONFIG_HOME".to_owned(),
                    layout.caddy_config_home.display().to_string(),
                ),
                (
                    "XDG_DATA_HOME".to_owned(),
                    layout.caddy_data_home.display().to_string(),
                ),
            ],
            executable: layout.caddy_executable.clone(),
            health_url: format!("{dashboard_url}/health"),
            name: "Dashboard",
            optional: false,
            shutdown: ShutdownMethod::Caddy(caddy_lifecycle),
        },
    ];
    if let Some(browser) = browser {
        plan.push(ServiceSpec {
            arguments: vec![
                "--role=browser-session".to_owned(),
                format!(
                    "--service-entrypoint={}",
                    layout.browser_session_entrypoint.display()
                ),
                format!(
                    "--browser-profile-path={}",
                    layout.browser_profile_directory.display()
                ),
                "--hostname=127.0.0.1".to_owned(),
                format!("--port={}", settings.browser_port),
                format!("--workspace-service-url={workspace_url}"),
                format!("--browser-executable-path={}", browser.executable.display()),
            ],
            environment: Vec::new(),
            executable: layout.service_host_executable.clone(),
            health_url: format!("{browser_url}/health"),
            name: "Browser",
            optional: true,
            shutdown: ShutdownMethod::CloseStdin,
        });
    }
    plan
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::product_layout::resolve_product_layout;

    #[test]
    fn desktop_plan_uses_configured_ports_and_browser_executable() {
        let manager = Path::new("/synthetic/job-boardwalk/job-boardwalk");
        let layout =
            resolve_product_layout(manager).expect("synthetic product layout should resolve");
        let settings = DesktopSettings {
            browser_executable: Some(PathBuf::from("/synthetic/chrome")),
            browser_port: 55312,
            dashboard_port: 55311,
            workspace_port: 55310,
        };
        let caddy_lifecycle =
            CaddyLifecycle::prepare().expect("Caddy lifecycle should be prepared");
        let browser = BrowserSelection {
            detail: "Configured browser 149.0.0.0 is ready.".to_owned(),
            executable: PathBuf::from("/synthetic/chrome"),
        };
        let plan = service_plan(&layout, &settings, caddy_lifecycle, Some(&browser));
        let workspace_service = plan
            .iter()
            .find(|service| service.name == "Workspace Service")
            .expect("Workspace Service should be in the desktop service plan");
        assert!(
            workspace_service
                .arguments
                .iter()
                .any(|argument| argument == "--port=55310")
        );
        assert_eq!(
            workspace_service.health_url,
            "http://127.0.0.1:55310/health"
        );

        let dashboard = plan
            .iter()
            .find(|service| service.name == "Dashboard")
            .expect("Dashboard should be in the desktop service plan");
        for expected in [
            ("JOB_BOARDWALK_DASHBOARD_ADDRESS", "http://127.0.0.1:55311"),
            ("JOB_BOARDWALK_WORKSPACE_SERVICE_ADDRESS", "127.0.0.1:55310"),
        ] {
            assert!(
                dashboard
                    .environment
                    .iter()
                    .any(|entry| entry.0 == expected.0 && entry.1 == expected.1),
                "Dashboard is missing environment setting {}={}",
                expected.0,
                expected.1
            );
        }
        assert_eq!(dashboard.health_url, "http://127.0.0.1:55311/health");
        assert!(matches!(dashboard.shutdown, ShutdownMethod::Caddy(_)));
        assert!(
            dashboard.environment.iter().any(|entry| {
                entry.0 == "JOB_BOARDWALK_CADDY_ADMIN" && entry.1.starts_with("127.0.0.1:")
            }),
            "Dashboard should use a private loopback Caddy admin endpoint"
        );

        let browser_session = plan
            .iter()
            .find(|service| service.name == "Browser")
            .expect("Browser should be in the desktop service plan");
        let entrypoint_argument = format!(
            "--service-entrypoint={}",
            layout.browser_session_entrypoint.display()
        );
        assert!(
            browser_session
                .arguments
                .iter()
                .any(|argument| argument == &entrypoint_argument)
        );

        for expected in [
            "--hostname=127.0.0.1",
            "--port=55312",
            "--workspace-service-url=http://127.0.0.1:55310",
            "--browser-executable-path=/synthetic/chrome",
        ] {
            assert!(
                browser_session
                    .arguments
                    .iter()
                    .any(|argument| argument == expected),
                "Browser is missing {expected}"
            );
        }
        assert!(browser_session.environment.is_empty());
        assert_eq!(browser_session.health_url, "http://127.0.0.1:55312/health");
    }

    #[test]
    fn desktop_plan_omits_browser_when_discovery_failed() {
        let manager = Path::new("/synthetic/job-boardwalk/job-boardwalk");
        let layout =
            resolve_product_layout(manager).expect("synthetic product layout should resolve");
        let caddy_lifecycle =
            CaddyLifecycle::prepare().expect("Caddy lifecycle should be prepared");
        let plan = service_plan(&layout, &DesktopSettings::default(), caddy_lifecycle, None);

        assert!(plan.iter().all(|service| service.name != "Browser"));
    }
}
