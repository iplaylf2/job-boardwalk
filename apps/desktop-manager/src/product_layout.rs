use std::env;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub(crate) struct ProductLayout {
    pub(crate) browser_profile_directory: PathBuf,
    pub(crate) browser_session_module: PathBuf,
    pub(crate) caddy_executable: PathBuf,
    pub(crate) caddy_config_home: PathBuf,
    pub(crate) caddy_data_home: PathBuf,
    pub(crate) caddyfile: PathBuf,
    pub(crate) dashboard_directory: PathBuf,
    pub(crate) log_path: PathBuf,
    pub(crate) migrations_directory: PathBuf,
    pub(crate) service_host_executable: PathBuf,
    pub(crate) workspace_database: PathBuf,
    pub(crate) workspace_service_module: PathBuf,
}

fn executable_name(base: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{base}.exe")
    } else {
        base.to_owned()
    }
}

pub(crate) fn resolve_product_layout(manager_executable: &Path) -> Result<ProductLayout, String> {
    let binary_directory = manager_executable
        .parent()
        .ok_or_else(|| "Desktop Manager executable has no parent directory.".to_owned())?;
    let product_root = binary_directory
        .parent()
        .ok_or_else(|| "Desktop Manager is outside the product layout.".to_owned())?;
    let payload = product_root.join("payload");
    let data = product_root.join("data");
    let configured_service_host =
        env::var_os("JOB_BOARDWALK_DESKTOP_SERVICE_HOST_EXECUTABLE").map(PathBuf::from);

    Ok(ProductLayout {
        browser_profile_directory: data.join("browser-profile"),
        browser_session_module: payload.join("browser-session.cjs"),
        caddy_config_home: data.join("caddy").join("config"),
        caddy_data_home: data.join("caddy").join("data"),
        caddy_executable: binary_directory.join(executable_name("caddy")),
        caddyfile: payload.join("Caddyfile"),
        dashboard_directory: payload.join("dashboard"),
        log_path: data.join("logs").join("services.log"),
        migrations_directory: payload.join("migrations"),
        service_host_executable: configured_service_host.unwrap_or_else(|| {
            binary_directory.join(executable_name("job-boardwalk-desktop-service-host"))
        }),
        workspace_database: data.join("workspace.sqlite"),
        workspace_service_module: payload.join("workspace-service.mjs"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_every_desktop_path_from_the_manager_location() {
        let root = Path::new("/synthetic/Job Boardwalk");
        let manager = root
            .join("bin")
            .join(executable_name("job-boardwalk-desktop-manager"));
        let layout =
            resolve_product_layout(&manager).expect("synthetic product layout should resolve");

        assert_eq!(
            layout.caddy_executable,
            root.join("bin").join(executable_name("caddy"))
        );
        assert_eq!(
            layout.caddy_data_home,
            root.join("data").join("caddy").join("data")
        );
        assert_eq!(
            layout.service_host_executable,
            root.join("bin")
                .join(executable_name("job-boardwalk-desktop-service-host"))
        );
        assert_eq!(
            layout.workspace_database,
            root.join("data").join("workspace.sqlite")
        );
    }
}
