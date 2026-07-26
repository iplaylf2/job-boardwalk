use std::path::PathBuf;

use crate::product_layout::ProductLayout;

pub(crate) struct ServiceSpec {
    pub(crate) arguments: Vec<String>,
    pub(crate) environment: Vec<(String, String)>,
    pub(crate) executable: PathBuf,
    pub(crate) health_url: &'static str,
    pub(crate) name: &'static str,
    pub(crate) optional: bool,
    pub(crate) shutdown: ShutdownMethod,
}

pub(crate) enum ShutdownMethod {
    CloseStdin,
    PostAdminEndpoint { url: &'static str },
}

pub(crate) fn service_plan(layout: &ProductLayout) -> Vec<ServiceSpec> {
    vec![
        ServiceSpec {
            arguments: vec![
                "--role=workspace-service".to_owned(),
                "--shutdown-on-stdin-end".to_owned(),
                format!("--module={}", layout.workspace_service_module.display()),
                format!(
                    "--workspace-database-path={}",
                    layout.workspace_database.display()
                ),
                format!(
                    "--migrations-directory={}",
                    layout.migrations_directory.display()
                ),
                "--hostname=127.0.0.1".to_owned(),
                "--port=54310".to_owned(),
            ],
            environment: Vec::new(),
            executable: layout.service_host_executable.clone(),
            health_url: "http://127.0.0.1:54310/health",
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
                (
                    "JOB_BOARDWALK_CADDY_ADMIN".to_owned(),
                    "127.0.0.1:54313".to_owned(),
                ),
                (
                    "JOB_BOARDWALK_DASHBOARD_ADDRESS".to_owned(),
                    "http://127.0.0.1:54311".to_owned(),
                ),
                (
                    "JOB_BOARDWALK_DASHBOARD_DIRECTORY".to_owned(),
                    layout.dashboard_directory.display().to_string(),
                ),
                (
                    "JOB_BOARDWALK_WORKSPACE_SERVICE_ADDRESS".to_owned(),
                    "127.0.0.1:54310".to_owned(),
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
            health_url: "http://127.0.0.1:54311/health",
            name: "Dashboard",
            optional: false,
            shutdown: ShutdownMethod::PostAdminEndpoint {
                url: "http://127.0.0.1:54313/stop",
            },
        },
        ServiceSpec {
            arguments: vec![
                "--role=browser-session".to_owned(),
                "--shutdown-on-stdin-end".to_owned(),
                format!("--module={}", layout.browser_session_module.display()),
                format!(
                    "--browser-profile-path={}",
                    layout.browser_profile_directory.display()
                ),
            ],
            environment: Vec::new(),
            executable: layout.service_host_executable.clone(),
            health_url: "http://127.0.0.1:54312/health",
            name: "Browser Session",
            optional: true,
            shutdown: ShutdownMethod::CloseStdin,
        },
    ]
}
