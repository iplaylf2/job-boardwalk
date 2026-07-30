#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod product_layout;
mod service_plan;
mod service_supervisor;

use std::env;
use std::error::Error;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::Duration;

use product_layout::{ProductLayout, resolve_product_layout};
use service_plan::DASHBOARD_URL;
use service_supervisor::{RunningServices, ServiceExit, start_services};

slint::include_modules!();

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);

enum ControllerCommand {
    Start,
    Stop,
    Exit,
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

fn apply_running_state(
    weak_window: &slint::Weak<ManagerWindow>,
    browser_running: bool,
    browser_detail: String,
) {
    update_window(weak_window, move |window| {
        window.set_can_stop(true);
        window.set_workspace_state("Running".into());
        window.set_status_detail("Workspace Service and Dashboard are running.".into());
        window.set_browser_state(if browser_running {
            "Running".into()
        } else {
            "Unavailable".into()
        });
        window.set_browser_detail(browser_detail.into());
    });
}

fn apply_stopped_state(
    weak_window: &slint::Weak<ManagerWindow>,
    state: &'static str,
    detail: String,
) {
    update_window(weak_window, move |window| {
        window.set_can_start(true);
        window.set_can_stop(false);
        window.set_workspace_state(state.into());
        window.set_status_detail(detail.into());
        window.set_browser_state("Stopped".into());
        window.set_browser_detail(
            "Chrome or Edge will be checked the next time services start.".into(),
        );
    });
}

fn handle_service_exit(
    running: &mut Option<RunningServices>,
    weak_window: &slint::Weak<ManagerWindow>,
) {
    let Some(services) = running else {
        return;
    };
    match services.poll_exit() {
        Ok(Some(ServiceExit::Optional { name, status })) => {
            update_window(weak_window, move |window| {
                window.set_browser_state("Unavailable".into());
                window.set_browser_detail(
                    format!(
                        "{name} exited unexpectedly with {status}. See the service log for details."
                    )
                    .into(),
                );
            });
        }
        Ok(Some(ServiceExit::Mandatory { name, status })) => {
            services.stop();
            *running = None;
            apply_stopped_state(
                weak_window,
                "Failed",
                format!(
                    "{name} exited unexpectedly with {status}. See the service log for details."
                ),
            );
        }
        Err(error) => {
            services.stop();
            *running = None;
            apply_stopped_state(weak_window, "Failed", error);
        }
        Ok(None) => {}
    }
}

fn controller_loop(
    receiver: Receiver<ControllerCommand>,
    weak_window: slint::Weak<ManagerWindow>,
    layout: ProductLayout,
) {
    let mut running: Option<RunningServices> = None;
    loop {
        let command = match receiver.recv_timeout(PROCESS_POLL_INTERVAL) {
            Ok(command) => Some(command),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => Some(ControllerCommand::Exit),
        };
        match command {
            Some(ControllerCommand::Start) if running.is_none() => {
                update_window(&weak_window, |window| {
                    window.set_can_start(false);
                    window.set_workspace_state("Starting".into());
                    window.set_status_detail("Starting local services.".into());
                    window.set_browser_state("Starting".into());
                    window.set_browser_detail("Checking Chrome or Edge.".into());
                });
                match start_services(&layout) {
                    Ok(startup) => {
                        apply_running_state(
                            &weak_window,
                            startup.browser_running,
                            startup.browser_detail,
                        );
                        running = Some(startup.services);
                    }
                    Err(error) => apply_stopped_state(&weak_window, "Failed", error),
                }
            }
            Some(ControllerCommand::Stop) => {
                if let Some(mut services) = running.take() {
                    update_window(&weak_window, |window| {
                        window.set_can_stop(false);
                        window.set_workspace_state("Stopping".into());
                        window.set_status_detail("Stopping local services.".into());
                        window.set_browser_state("Stopping".into());
                        window.set_browser_detail("Stopping Browser Session.".into());
                    });
                    services.stop();
                    apply_stopped_state(
                        &weak_window,
                        "Stopped",
                        "Local services are stopped.".to_owned(),
                    );
                }
            }
            Some(ControllerCommand::Exit) => {
                if let Some(mut services) = running.take() {
                    services.stop();
                }
                return;
            }
            Some(ControllerCommand::Start) | None => {}
        }
        handle_service_exit(&mut running, &weak_window);
    }
}

fn install_callbacks(window: &ManagerWindow, sender: &Sender<ControllerCommand>) {
    let start_sender = sender.clone();
    window.on_start_requested(move || {
        let _ = start_sender.send(ControllerCommand::Start);
    });
    let stop_sender = sender.clone();
    window.on_stop_requested(move || {
        let _ = stop_sender.send(ControllerCommand::Stop);
    });
}

fn main() -> Result<(), Box<dyn Error>> {
    let manager_executable = env::current_exe()?;
    let layout = resolve_product_layout(&manager_executable)?;
    let window = ManagerWindow::new()?;
    window.set_dashboard_url(DASHBOARD_URL.into());
    window.set_log_path(layout.log_path.display().to_string().into());
    let (sender, receiver) = mpsc::channel();
    install_callbacks(&window, &sender);
    let weak_window = window.as_weak();
    let controller = thread::spawn(move || controller_loop(receiver, weak_window, layout));
    let result = window.run();
    let _ = sender.send(ControllerCommand::Exit);
    let _ = controller.join();
    result?;
    Ok(())
}
