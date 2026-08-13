use std::env;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub(crate) struct ProductLayout {
    pub(crate) browser_profile_directory: PathBuf,
    pub(crate) browser_session_entrypoint: PathBuf,
    pub(crate) caddy_executable: PathBuf,
    pub(crate) caddy_config_home: PathBuf,
    pub(crate) caddy_data_home: PathBuf,
    pub(crate) caddyfile: PathBuf,
    pub(crate) dashboard_directory: PathBuf,
    pub(crate) log_path: PathBuf,
    pub(crate) migrations_directory: PathBuf,
    pub(crate) service_host_executable: PathBuf,
    pub(crate) settings_path: PathBuf,
    pub(crate) workspace_database: PathBuf,
    pub(crate) workspace_service_entrypoint: PathBuf,
}

fn executable_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_owned()
    }
}

pub(crate) fn resolve_product_layout(manager_executable: &Path) -> Result<ProductLayout, String> {
    let product_root = manager_executable
        .parent()
        .ok_or_else(|| "Desktop Manager executable has no parent directory.".to_owned())?;
    let runtime = product_root.join("runtime");
    let payload = product_root.join("payload");
    let data = product_root.join("data");
    let configured_service_host =
        env::var_os("JOB_BOARDWALK_NODE_SERVICE_HOST_EXECUTABLE").map(PathBuf::from);

    Ok(ProductLayout {
        browser_profile_directory: data.join("browser-profile"),
        browser_session_entrypoint: payload
            .join("browser-session")
            .join("dist")
            .join("index.cjs"),
        caddy_config_home: data.join("caddy").join("config"),
        caddy_data_home: data.join("caddy").join("data"),
        caddy_executable: runtime.join(executable_name("caddy")),
        caddyfile: payload.join("caddyfile"),
        dashboard_directory: payload.join("dashboard"),
        log_path: data.join("logs").join("services.log"),
        migrations_directory: payload.join("workspace-service").join("migrations"),
        service_host_executable: configured_service_host
            .unwrap_or_else(|| runtime.join(executable_name("node-service-host"))),
        settings_path: data.join("settings.json"),
        workspace_database: data.join("workspace.sqlite"),
        workspace_service_entrypoint: payload.join("workspace-service").join("index.mjs"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_every_desktop_path_from_the_manager_location() {
        let root = Path::new("/synthetic/job-boardwalk");
        let manager = root.join(executable_name("job-boardwalk"));
        let layout =
            resolve_product_layout(&manager).expect("synthetic product layout should resolve");

        assert_eq!(
            layout.caddy_executable,
            root.join("runtime").join(executable_name("caddy"))
        );
        assert_eq!(
            layout.caddy_data_home,
            root.join("data").join("caddy").join("data")
        );
        assert_eq!(
            layout.service_host_executable,
            root.join("runtime")
                .join(executable_name("node-service-host"))
        );
        assert_eq!(
            layout.browser_session_entrypoint,
            root.join("payload")
                .join("browser-session")
                .join("dist")
                .join("index.cjs")
        );
        assert_eq!(
            layout.workspace_database,
            root.join("data").join("workspace.sqlite")
        );
        assert_eq!(
            layout.settings_path,
            root.join("data").join("settings.json")
        );
    }
}
