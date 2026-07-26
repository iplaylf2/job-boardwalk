#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod desktop_lifecycle_protocol;

use std::env;
use std::error::Error;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::Duration;

use desktop_lifecycle_protocol::{read_runtime_message, runtime_status, wire, write_shutdown};

slint::include_modules!();

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);

enum ControllerCommand {
    Start,
    Stop,
    Exit,
}

struct RuntimeProcess {
    child: Child,
    stdin: ChildStdin,
}

fn runtime_executable_path() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("JOB_BOARDWALK_DESKTOP_RUNTIME_EXECUTABLE") {
        return Ok(PathBuf::from(configured));
    }
    let manager = env::current_exe()
        .map_err(|error| format!("Cannot locate Desktop Manager executable: {error}"))?;
    let executable_name = if cfg!(target_os = "windows") {
        "job-boardwalk-desktop-runtime.exe"
    } else {
        "job-boardwalk-desktop-runtime"
    };
    Ok(manager
        .parent()
        .ok_or_else(|| "Desktop Manager executable has no parent directory.".to_owned())?
        .join(executable_name))
}

fn update_window(
    weak_window: &slint::Weak<ManagerWindow>,
    update: impl FnOnce(ManagerWindow) + Send + 'static,
) {
    let weak_window = weak_window.clone();
    let _ = slint::invoke_from_event_loop(move || {
        if let Some(window) = weak_window.upgrade() {
            update(window);
        }
    });
}

fn runtime_state_label(state: &wire::RuntimeState) -> &'static str {
    match state {
        wire::RuntimeState::Unspecified => "Unknown",
        wire::RuntimeState::Starting => "Starting",
        wire::RuntimeState::Running => "Running",
        wire::RuntimeState::Stopping => "Stopping",
        wire::RuntimeState::Failed => "Failed",
    }
}

fn system_browser_state_label(state: &wire::SystemBrowserState) -> &'static str {
    match state {
        wire::SystemBrowserState::Unspecified => "Unknown",
        wire::SystemBrowserState::Recognized => "Detected",
        wire::SystemBrowserState::Missing => "Browser required",
        wire::SystemBrowserState::Uninspectable => "Browser unavailable",
    }
}

fn apply_status(weak_window: &slint::Weak<ManagerWindow>, status: wire::RuntimeStatus) {
    let state =
        wire::RuntimeState::try_from(status.state).unwrap_or(wire::RuntimeState::Unspecified);
    update_window(weak_window, move |window| {
        let running = matches!(state, wire::RuntimeState::Running);
        window.set_runtime_state(runtime_state_label(&state).into());
        window.set_status_detail(status.detail.into());
        window.set_dashboard_available(running && status.dashboard_url.is_some());
        window.set_logs_available(!status.log_path.is_empty());
        if let Some(system_browser) = status.system_browser {
            let system_browser_state = wire::SystemBrowserState::try_from(system_browser.state)
                .unwrap_or(wire::SystemBrowserState::Unspecified);
            window.set_browser_state(system_browser_state_label(&system_browser_state).into());
            window.set_browser_detail(system_browser.detail.into());
        }
    });
}

fn report_status_channel_failure(weak_window: &slint::Weak<ManagerWindow>, error: String) {
    update_window(weak_window, move |window| {
        window.set_runtime_state("Failed".into());
        window.set_status_detail(format!("Desktop Runtime status channel failed: {error}").into());
        window.set_dashboard_available(false);
    });
}

fn stream_runtime_status(
    stdout: impl std::io::Read + Send + 'static,
    weak_window: slint::Weak<ManagerWindow>,
) {
    let _ = thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            match read_runtime_message(&mut reader) {
                Ok(Some(message)) => match runtime_status(message) {
                    Ok(status) => apply_status(&weak_window, status),
                    Err(error) => {
                        report_status_channel_failure(&weak_window, error);
                        return;
                    }
                },
                Ok(None) => return,
                Err(error) => {
                    report_status_channel_failure(&weak_window, error);
                    return;
                }
            }
        }
    });
}

fn stream_runtime_log(
    stderr: impl std::io::Read + Send + 'static,
    mut log: File,
    weak_window: slint::Weak<ManagerWindow>,
) {
    let _ = thread::spawn(move || {
        if let Err(error) = io::copy(&mut BufReader::new(stderr), &mut log) {
            update_window(&weak_window, move |window| {
                window.set_logs_available(false);
                window.set_status_detail(format!("Runtime log unavailable: {error}").into());
            });
        }
    });
}

fn start_runtime(
    weak_window: &slint::Weak<ManagerWindow>,
    log_path: &Path,
) -> Result<RuntimeProcess, String> {
    if let Some(log_directory) = log_path.parent() {
        fs::create_dir_all(log_directory)
            .map_err(|error| format!("Cannot create runtime log directory: {error}"))?;
    }
    let log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| format!("Cannot open runtime log: {error}"))?;
    let executable = runtime_executable_path()?;
    let mut child = Command::new(&executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Cannot start {}: {error}", executable.display()))?;
    let stdin = child
        .stdin
        .take()
        .expect("runtime stdin was configured as piped");
    let stdout = child
        .stdout
        .take()
        .expect("runtime stdout was configured as piped");
    let stderr = child
        .stderr
        .take()
        .expect("runtime stderr was configured as piped");
    stream_runtime_status(stdout, weak_window.clone());
    stream_runtime_log(stderr, log, weak_window.clone());
    Ok(RuntimeProcess { child, stdin })
}

fn request_runtime_shutdown(runtime: &mut RuntimeProcess) -> Result<(), String> {
    write_shutdown(&mut runtime.stdin)
}

fn controller_loop(
    receiver: Receiver<ControllerCommand>,
    weak_window: slint::Weak<ManagerWindow>,
    log_path: PathBuf,
) {
    let mut runtime: Option<RuntimeProcess> = None;
    loop {
        let command = match receiver.recv_timeout(PROCESS_POLL_INTERVAL) {
            Ok(command) => Some(command),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => Some(ControllerCommand::Exit),
        };
        match command {
            Some(ControllerCommand::Start) if runtime.is_none() => {
                update_window(&weak_window, |window| {
                    window.set_can_start(false);
                    window.set_runtime_state("Starting".into());
                    window.set_status_detail("Launching Desktop Runtime".into());
                });
                match start_runtime(&weak_window, &log_path) {
                    Ok(process) => {
                        runtime = Some(process);
                        update_window(&weak_window, |window| {
                            window.set_can_stop(true);
                        });
                    }
                    Err(error) => update_window(&weak_window, move |window| {
                        window.set_can_start(true);
                        window.set_can_stop(false);
                        window.set_runtime_state("Failed".into());
                        window.set_status_detail(error.into());
                    }),
                }
            }
            Some(ControllerCommand::Stop) => {
                if let Some(process) = &mut runtime {
                    let shutdown_error = request_runtime_shutdown(process).err();
                    if shutdown_error.is_some() {
                        let _ = process.child.kill();
                    }
                    update_window(&weak_window, move |window| {
                        window.set_can_stop(false);
                        window.set_runtime_state("Stopping".into());
                        window.set_status_detail(shutdown_error.map_or_else(
                            || "Stopping desktop services".into(),
                            |error| {
                                format!(
                                    "Graceful shutdown failed; terminating Desktop Runtime: {error}"
                                )
                                .into()
                            },
                        ));
                    });
                }
            }
            Some(ControllerCommand::Exit) => {
                if let Some(process) = &mut runtime {
                    if request_runtime_shutdown(process).is_err() {
                        let _ = process.child.kill();
                    }
                    let _ = process.child.wait();
                }
                return;
            }
            Some(ControllerCommand::Start) | None => {}
        }

        match runtime.as_mut().map(|process| process.child.try_wait()) {
            Some(Ok(Some(status))) => {
                runtime = None;
                update_window(&weak_window, move |window| {
                    window.set_can_start(true);
                    window.set_can_stop(false);
                    window.set_dashboard_available(false);
                    window.set_runtime_state(if status.success() {
                        "Stopped".into()
                    } else {
                        "Failed".into()
                    });
                    window.set_status_detail(if status.success() {
                        "Desktop services are stopped.".into()
                    } else {
                        format!("Desktop Runtime exited with {status}.").into()
                    });
                });
            }
            Some(Err(error)) => {
                if let Some(mut process) = runtime.take() {
                    let _ = process.child.kill();
                    let _ = process.child.wait();
                }
                update_window(&weak_window, move |window| {
                    window.set_can_start(true);
                    window.set_can_stop(false);
                    window.set_dashboard_available(false);
                    window.set_runtime_state("Failed".into());
                    window.set_status_detail(
                        format!("Cannot inspect Desktop Runtime process: {error}").into(),
                    );
                });
            }
            Some(Ok(None)) | None => {}
        }
    }
}

fn product_log_path() -> io::Result<PathBuf> {
    let manager = env::current_exe()?;
    let product_root = manager
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| io::Error::other("Desktop Manager is outside the product layout."))?;
    Ok(product_root.join("data").join("logs").join("runtime.log"))
}

fn open_log(log_path: &Path) -> io::Result<()> {
    let mut command = if cfg!(target_os = "windows") {
        Command::new("explorer")
    } else if cfg!(target_os = "macos") {
        Command::new("open")
    } else {
        Command::new("xdg-open")
    };
    command.arg(log_path).spawn().map(|_| ())
}

fn install_callbacks(
    window: &ManagerWindow,
    sender: &Sender<ControllerCommand>,
    log_path: PathBuf,
) {
    let weak_window = window.as_weak();
    let start_sender = sender.clone();
    window.on_start_requested(move || {
        let _ = start_sender.send(ControllerCommand::Start);
    });
    let stop_sender = sender.clone();
    window.on_stop_requested(move || {
        let _ = stop_sender.send(ControllerCommand::Stop);
    });
    window.on_open_log_requested(move || {
        if let Err(error) = open_log(&log_path) {
            update_window(&weak_window, move |window| {
                window.set_status_detail(format!("Cannot open runtime log: {error}").into());
            });
        }
    });
}

fn main() -> Result<(), Box<dyn Error>> {
    let window = ManagerWindow::new()?;
    let log_path = product_log_path()?;
    let (sender, receiver) = mpsc::channel();
    install_callbacks(&window, &sender, log_path.clone());
    let weak_window = window.as_weak();
    let controller = thread::spawn(move || controller_loop(receiver, weak_window, log_path));
    let result = window.run();
    let _ = sender.send(ControllerCommand::Exit);
    let _ = controller.join();
    result?;
    Ok(())
}
