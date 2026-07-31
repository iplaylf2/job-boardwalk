use std::time::Duration;

const CADDY_ADMIN_ENVIRONMENT: &str = "JOB_BOARDWALK_CADDY_ADMIN";

#[derive(Clone)]
pub(crate) struct CaddyLifecycle {
    admin_address: String,
    shutdown_url: String,
}

impl CaddyLifecycle {
    pub(crate) fn prepare() -> Result<Self, String> {
        use std::net::TcpListener;

        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|error| format!("Cannot reserve a private Caddy admin port: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("Cannot inspect the private Caddy admin port: {error}"))?
            .port();
        drop(listener);
        let admin_address = format!("127.0.0.1:{port}");
        Ok(Self {
            shutdown_url: format!("http://{admin_address}/stop"),
            admin_address,
        })
    }

    pub(crate) fn environment(&self) -> (String, String) {
        (
            CADDY_ADMIN_ENVIRONMENT.to_owned(),
            self.admin_address.clone(),
        )
    }

    pub(crate) fn request_shutdown(&self) -> Result<(), String> {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(1)))
            .proxy(None)
            .build()
            .new_agent();
        agent
            .post(&self.shutdown_url)
            .send_empty()
            .map(|_| ())
            .map_err(|error| format!("Cannot request Caddy shutdown: {error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocates_a_private_loopback_admin_endpoint() {
        let lifecycle = CaddyLifecycle::prepare().expect("Caddy lifecycle should be prepared");
        let (_, address) = lifecycle.environment();

        assert_eq!(CADDY_ADMIN_ENVIRONMENT, "JOB_BOARDWALK_CADDY_ADMIN");
        assert!(address.starts_with("127.0.0.1:"));
        assert_eq!(lifecycle.shutdown_url, format!("http://{address}/stop"));
    }
}
