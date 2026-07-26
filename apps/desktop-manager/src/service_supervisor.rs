use std::fs::{self, File, OpenOptions};
use std::process::{Child, ChildStdin, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::product_layout::ProductLayout;
use crate::service_plan::{ServiceSpec, ShutdownMethod, service_plan};

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);
const SERVICE_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);
const SERVICE_STARTUP_TIMEOUT: Duration = Duration::from_secs(20);

struct ManagedService {
    child: Child,
    name: &'static str,
    optional: bool,
    shutdown: ShutdownMethod,
    stdin: Option<ChildStdin>,
}

pub(crate) struct RunningServices {
    services: Vec<ManagedService>,
}

pub(crate) struct StartupResult {
    pub(crate) browser_detail: String,
    pub(crate) browser_running: bool,
    pub(crate) services: RunningServices,
}

pub(crate) enum ServiceExit {
    Mandatory {
        name: &'static str,
        status: ExitStatus,
    },
    Optional {
        name: &'static str,
        status: ExitStatus,
    },
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
    let mut child = Command::new(&executable)
        .args(spec.arguments)
        .envs(spec.environment)
        .stdin(Stdio::piped())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| {
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

fn wait_for_readiness(service: &mut ManagedService, health_url: &str) -> Result<(), String> {
    let deadline = Instant::now() + SERVICE_STARTUP_TIMEOUT;
    let agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(1)))
        .proxy(None)
        .build()
        .new_agent();
    while Instant::now() < deadline {
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
        if agent.get(health_url).call().is_ok() {
            return Ok(());
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
        ShutdownMethod::CloseStdin => {
            service.stdin.take();
        }
        ShutdownMethod::PostAdminEndpoint { url } => {
            let agent = ureq::Agent::config_builder()
                .timeout_global(Some(Duration::from_secs(1)))
                .proxy(None)
                .build()
                .new_agent();
            let _ = agent.post(*url).send_empty();
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

    pub(crate) fn poll_exit(&mut self) -> Result<Option<ServiceExit>, String> {
        for (index, service) in self.services.iter_mut().enumerate() {
            let status = service
                .child
                .try_wait()
                .map_err(|error| format!("Cannot inspect {}: {error}", service.name))?;
            if let Some(status) = status {
                let service = self.services.remove(index);
                return Ok(Some(if service.optional {
                    ServiceExit::Optional {
                        name: service.name,
                        status,
                    }
                } else {
                    ServiceExit::Mandatory {
                        name: service.name,
                        status,
                    }
                }));
            }
        }
        Ok(None)
    }
}

impl Drop for RunningServices {
    fn drop(&mut self) {
        self.stop();
    }
}

pub(crate) fn start_services(layout: &ProductLayout) -> Result<StartupResult, String> {
    let log = open_log_file(layout)?;
    let mut running = RunningServices {
        services: Vec::new(),
    };
    let mut browser_detail = "Browser Session is running.".to_owned();
    let mut browser_running = true;

    for spec in service_plan(layout) {
        let health_url = spec.health_url;
        let optional = spec.optional;
        let mut service = spawn_service(spec, &log)?;
        if let Err(error) = wait_for_readiness(&mut service, health_url) {
            stop_service(&mut service);
            if optional {
                browser_running = false;
                browser_detail = error;
                continue;
            }
            return Err(error);
        }
        running.services.push(service);
    }
    Ok(StartupResult {
        browser_detail,
        browser_running,
        services: running,
    })
}
