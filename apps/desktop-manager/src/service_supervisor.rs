use std::fs::{self, File, OpenOptions};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;

use crate::browser_discovery::discover_browser;
use crate::caddy_lifecycle::CaddyLifecycle;
use crate::desktop_settings::DesktopSettings;
use crate::product_layout::ProductLayout;
use crate::service_plan::{Readiness, ServiceSpec, ShutdownMethod, service_plan};

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);
const BROWSER_HEALTH_POLL_INTERVAL: Duration = Duration::from_secs(1);
const SERVICE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
const SERVICE_STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct ManagedService {
    child: Child,
    name: &'static str,
    optional: bool,
    shutdown: ShutdownMethod,
    stdin: Option<ChildStdin>,
}

pub(crate) struct RunningServices {
    browser_health: Option<BrowserHealthMonitor>,
    services: Vec<ManagedService>,
}

pub(crate) struct StartupResult {
    pub(crate) browser_detail: String,
    pub(crate) browser_running: bool,
    pub(crate) services: RunningServices,
}

pub(crate) enum StartupOutcome {
    Cancelled,
    Started(StartupResult),
}

enum ReadinessOutcome {
    Cancelled,
    Ready,
}

pub(crate) enum ServiceEvent {
    BrowserAvailabilityChanged {
        available: bool,
        detail: String,
    },
    MandatoryExit {
        name: &'static str,
        status: ExitStatus,
    },
    OptionalExit {
        name: &'static str,
        status: ExitStatus,
    },
}

struct BrowserHealthMonitor {
    agent: ureq::Agent,
    health_url: String,
    next_poll: Instant,
    tracker: BrowserAvailabilityTracker,
}

struct BrowserAvailabilityTracker {
    available: bool,
    available_detail: String,
}

fn open_log_file(layout: &ProductLayout) -> Result<File, String> {
    if let Some(log_directory) = layout.log_path.parent() {
        fs::create_dir_all(log_directory)
            .map_err(|error| format!("Cannot create service log directory: {error}"))?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&layout.log_path)
        .map_err(|error| format!("Cannot open service log: {error}"))
}

fn spawn_service(spec: ServiceSpec, log: &File) -> Result<ManagedService, String> {
    let stdout = log
        .try_clone()
        .map_err(|error| format!("Cannot clone service log handle: {error}"))?;
    let stderr = log
        .try_clone()
        .map_err(|error| format!("Cannot clone service log handle: {error}"))?;
    let executable = spec.executable;
    let mut command = Command::new(&executable);
    command
        .args(spec.arguments)
        .envs(spec.environment)
        .stdin(Stdio::piped())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().map_err(|error| {
        format!(
            "Cannot start {} with {}: {error}",
            spec.name,
            executable.display()
        )
    })?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| format!("{} stdin was not created.", spec.name))?;
    Ok(ManagedService {
        child,
        name: spec.name,
        optional: spec.optional,
        shutdown: spec.shutdown,
        stdin: Some(stdin),
    })
}

#[derive(Deserialize)]
struct BrowserHealth {
    browser: BrowserHealthStatus,
}

#[derive(Deserialize)]
struct BrowserHealthStatus {
    available: bool,
}

fn browser_health_is_ready(body: &str) -> bool {
    browser_health_availability(body).is_ok_and(|available| available)
}

fn browser_health_availability(body: &str) -> Result<bool, String> {
    serde_json::from_str::<BrowserHealth>(body)
        .map(|health| health.browser.available)
        .map_err(|error| format!("Browser Session returned invalid health data: {error}"))
}

fn health_agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(1)))
        .proxy(None)
        .build()
        .new_agent()
}

impl BrowserHealthMonitor {
    fn new(health_url: String, available_detail: String) -> Self {
        Self {
            agent: health_agent(),
            health_url,
            next_poll: Instant::now() + BROWSER_HEALTH_POLL_INTERVAL,
            tracker: BrowserAvailabilityTracker {
                available: true,
                available_detail,
            },
        }
    }

    fn poll(&mut self) -> Option<ServiceEvent> {
        if Instant::now() < self.next_poll {
            return None;
        }
        self.next_poll = Instant::now() + BROWSER_HEALTH_POLL_INTERVAL;
        let observation = self
            .agent
            .get(&self.health_url)
            .call()
            .map_err(|error| format!("Cannot reach Browser Session health endpoint: {error}"))
            .and_then(|mut response| {
                response.body_mut().read_to_string().map_err(|error| {
                    format!("Cannot read Browser Session health response: {error}")
                })
            })
            .and_then(|body| browser_health_availability(&body));
        self.tracker.observe(observation)
    }
}

impl BrowserAvailabilityTracker {
    fn observe(&mut self, observation: Result<bool, String>) -> Option<ServiceEvent> {
        let (available, detail) = match observation {
            Ok(true) => (true, self.available_detail.clone()),
            Ok(false) => (
                false,
                "Browser Session is running, but browser actions are unavailable.".to_owned(),
            ),
            Err(error) => (false, error),
        };
        if available == self.available {
            return None;
        }
        self.available = available;
        Some(ServiceEvent::BrowserAvailabilityChanged { available, detail })
    }
}

fn wait_for_readiness(
    service: &mut ManagedService,
    health_url: &str,
    readiness: Readiness,
    cancellation_requested: &mut impl FnMut() -> bool,
) -> Result<ReadinessOutcome, String> {
    let deadline = Instant::now() + SERVICE_STARTUP_TIMEOUT;
    let agent = health_agent();
    while Instant::now() < deadline {
        if cancellation_requested() {
            return Ok(ReadinessOutcome::Cancelled);
        }
        if let Some(status) = service
            .child
            .try_wait()
            .map_err(|error| format!("Cannot inspect {}: {error}", service.name))?
        {
            return Err(format!(
                "{} exited during startup with {status}.",
                service.name
            ));
        }
        if let Ok(mut response) = agent.get(health_url).call() {
            match readiness {
                Readiness::HttpAvailable => return Ok(ReadinessOutcome::Ready),
                Readiness::BrowserAvailable => {
                    if response
                        .body_mut()
                        .read_to_string()
                        .is_ok_and(|body| browser_health_is_ready(&body))
                    {
                        return Ok(ReadinessOutcome::Ready);
                    }
                }
            }
        }
        thread::sleep(PROCESS_POLL_INTERVAL);
    }
    Err(format!(
        "{} did not become ready within {} seconds.",
        service.name,
        SERVICE_STARTUP_TIMEOUT.as_secs()
    ))
}

fn stop_service(service: &mut ManagedService) {
    match &service.shutdown {
        ShutdownMethod::Caddy(lifecycle) => {
            let _ = lifecycle.request_shutdown();
        }
        ShutdownMethod::CloseStdin => {
            service.stdin.take();
        }
    }
    let deadline = Instant::now() + SERVICE_SHUTDOWN_TIMEOUT;
    while Instant::now() < deadline {
        match service.child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => thread::sleep(PROCESS_POLL_INTERVAL),
            Err(_) => break,
        }
    }
    let _ = service.child.kill();
    let _ = service.child.wait();
}

impl RunningServices {
    pub(crate) fn stop(&mut self) {
        for service in self.services.iter_mut().rev() {
            stop_service(service);
        }
        self.services.clear();
    }

    pub(crate) fn poll_event(&mut self) -> Result<Option<ServiceEvent>, String> {
        for (index, service) in self.services.iter_mut().enumerate() {
            let status = service
                .child
                .try_wait()
                .map_err(|error| format!("Cannot inspect {}: {error}", service.name))?;
            if let Some(status) = status {
                let service = self.services.remove(index);
                return Ok(Some(if service.optional {
                    self.browser_health = None;
                    ServiceEvent::OptionalExit {
                        name: service.name,
                        status,
                    }
                } else {
                    ServiceEvent::MandatoryExit {
                        name: service.name,
                        status,
                    }
                }));
            }
        }
        Ok(self
            .browser_health
            .as_mut()
            .and_then(BrowserHealthMonitor::poll))
    }
}

impl Drop for RunningServices {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) fn start_services(
    layout: &ProductLayout,
    settings: &DesktopSettings,
    mut cancellation_requested: impl FnMut() -> bool,
) -> Result<StartupOutcome, String> {
    if cancellation_requested() {
        return Ok(StartupOutcome::Cancelled);
    }
    let caddy_lifecycle = CaddyLifecycle::prepare()?;
    let log = open_log_file(layout)?;
    let mut running = RunningServices {
        browser_health: None,
        services: Vec::new(),
    };
    let browser = discover_browser(settings.browser_executable.as_deref());
    let (browser, mut browser_running, mut browser_detail) = match browser {
        Ok(browser) => {
            let detail = browser.detail.clone();
            (Some(browser), true, detail)
        }
        Err(error) => (None, false, error),
    };

    for spec in service_plan(layout, settings, caddy_lifecycle.clone(), browser.as_ref()) {
        if cancellation_requested() {
            return Ok(StartupOutcome::Cancelled);
        }
        let health_url = spec.health_url.clone();
        let optional = spec.optional;
        let readiness = spec.readiness;
        let mut service = spawn_service(spec, &log)?;
        match wait_for_readiness(
            &mut service,
            &health_url,
            readiness,
            &mut cancellation_requested,
        ) {
            Ok(ReadinessOutcome::Ready) => {}
            Ok(ReadinessOutcome::Cancelled) => {
                stop_service(&mut service);
                return Ok(StartupOutcome::Cancelled);
            }
            Err(error) => {
                stop_service(&mut service);
                if optional {
                    browser_running = false;
                    browser_detail = format!("{error} See the service log for details.");
                    continue;
                }
                return Err(error);
            }
        }
        if matches!(readiness, Readiness::BrowserAvailable) {
            running.browser_health = Some(BrowserHealthMonitor::new(
                health_url,
                browser_detail.clone(),
            ));
        }
        running.services.push(service);
    }
    if cancellation_requested() {
        return Ok(StartupOutcome::Cancelled);
    }
    Ok(StartupOutcome::Started(StartupResult {
        browser_detail,
        browser_running,
        services: running,
    }))
}

#[cfg(test)]
mod tests {
    use super::{
        BrowserAvailabilityTracker, ServiceEvent, StartupOutcome, browser_health_availability,
        browser_health_is_ready, start_services,
    };
    use crate::desktop_settings::DesktopSettings;
    use crate::product_layout::resolve_product_layout;

    #[test]
    fn cancels_before_starting_any_service() {
        let manager = std::env::temp_dir()
            .join("synthetic-job-boardwalk-cancelled-start")
            .join(if cfg!(windows) {
                "job-boardwalk.exe"
            } else {
                "job-boardwalk"
            });
        let layout = resolve_product_layout(&manager).expect("synthetic layout should resolve");

        let outcome = start_services(&layout, &DesktopSettings::default(), || true)
            .expect("cancellation should not require installed service artifacts");

        assert!(matches!(outcome, StartupOutcome::Cancelled));
    }

    #[test]
    fn accepts_browser_health_only_when_browser_actions_are_available() {
        assert!(browser_health_is_ready(
            r#"{"browser":{"available":true,"tabCount":0},"status":"ok"}"#
        ));
    }

    #[test]
    fn rejects_http_health_without_browser_availability() {
        for body in [
            r#"{"browser":{"available":false},"status":"ok"}"#,
            r#"{"status":"ok"}"#,
            "not-json",
        ] {
            assert!(!browser_health_is_ready(body));
        }
    }

    #[test]
    fn reports_browser_availability_loss_and_recovery_from_health_responses() {
        let mut tracker = BrowserAvailabilityTracker {
            available: true,
            available_detail: "Configured Chromium is ready.".to_owned(),
        };

        let loss = tracker
            .observe(browser_health_availability(
                r#"{"browser":{"available":false},"status":"ok"}"#,
            ))
            .expect("availability loss should produce an event");
        assert!(matches!(
            loss,
            ServiceEvent::BrowserAvailabilityChanged {
                available: false,
                ..
            }
        ));
        assert!(
            tracker
                .observe(browser_health_availability(
                    r#"{"browser":{"available":false},"status":"ok"}"#,
                ))
                .is_none(),
            "an unchanged unavailable response should not repeat the event"
        );

        let recovery = tracker
            .observe(browser_health_availability(
                r#"{"browser":{"available":true,"browserVersion":"149.0","tabCount":1},"status":"ok"}"#,
            ))
            .expect("availability recovery should produce an event");
        assert!(matches!(
            recovery,
            ServiceEvent::BrowserAvailabilityChanged {
                available: true,
                detail,
            } if detail == "Configured Chromium is ready."
        ));
    }
}
