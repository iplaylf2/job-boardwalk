use std::net::TcpListener;
use std::time::Duration;

const CADDY_ADMIN_ENVIRONMENT: &str = "JOB_BOARDWALK_CADDY_ADMIN";

pub(crate) struct CaddyLifecycle {
    admin_address: String,
    reservation: Option<TcpListener>,
    shutdown_url: String,
}

impl CaddyLifecycle {
    pub(crate) fn prepare() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0))
            .map_err(|error| format!("Cannot reserve a private Caddy admin port: {error}"))?;
        let port = listener
            .local_addr()
            .map_err(|error| format!("Cannot inspect the private Caddy admin port: {error}"))?
            .port();
        let admin_address = format!("127.0.0.1:{port}");
        Ok(Self {
            shutdown_url: format!("http://{admin_address}/stop"),
            admin_address,
            reservation: Some(listener),
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

    pub(crate) fn release_reservation(&mut self) {
        self.reservation.take();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_the_private_admin_endpoint_until_launch_handoff() {
        let mut lifecycle = CaddyLifecycle::prepare().expect("Caddy lifecycle should be prepared");
        let (_, address) = lifecycle.environment();

        assert_eq!(CADDY_ADMIN_ENVIRONMENT, "JOB_BOARDWALK_CADDY_ADMIN");
        assert!(address.starts_with("127.0.0.1:"));
        assert_eq!(lifecycle.shutdown_url, format!("http://{address}/stop"));
        assert!(
            TcpListener::bind(&address).is_err(),
            "the admin endpoint should remain reserved before Caddy starts"
        );

        lifecycle.release_reservation();
        TcpListener::bind(address).expect("the reservation should be released for Caddy");
    }
}
