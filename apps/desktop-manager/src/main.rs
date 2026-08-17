#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod browser_discovery;
mod caddy_lifecycle;
mod desktop_settings;
mod product_layout;
mod rendering_backend;
mod service_plan;
mod service_supervisor;

use std::cell::RefCell;
use std::env;
use std::error::Error;
use std::rc::Rc;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::thread;
use std::time::Duration;

use desktop_settings::DesktopSettings;
use product_layout::{ProductLayout, resolve_product_layout};
use service_supervisor::{RunningServices, ServiceEvent, StartupOutcome, start_services};

slint::include_modules!();

const PROCESS_POLL_INTERVAL: Duration = Duration::from_millis(100);

enum ControllerCommand {
    Start(DesktopSettings),
    Stop,
    Exit,
}

fn startup_cancellation_requested(
    receiver: &Receiver<ControllerCommand>,
    exit_requested: &mut bool,
) -> bool {
    loop {
        match receiver.try_recv() {
            Ok(ControllerCommand::Stop) => return true,
            Ok(ControllerCommand::Exit) | Err(TryRecvError::Disconnected) => {
                *exit_requested = true;
                return true;
            }
            Ok(ControllerCommand::Start(_)) => {}
            Err(TryRecvError::Empty) => return false,
        }
    }
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
        window.set_can_configure(false);
        window.set_workspace_state("Running".into());
        window.set_status_detail(if browser_running {
            "Core services and browser access are available.".into()
        } else {
            "Core services are running, but browser access is unavailable.".into()
        });
        window.set_browser_state(if browser_running {
            "Running".into()
        } else {
            "Unavailable".into()
        });
        window.set_browser_detail(browser_detail.into());
    });
}

fn apply_browser_availability(
    weak_window: &slint::Weak<ManagerWindow>,
    available: bool,
    detail: String,
) {
    update_window(weak_window, move |window| {
        window.set_status_detail(if available {
            "Core services and browser access are available.".into()
        } else {
            "Core services are running, but browser access is unavailable.".into()
        });
        window.set_browser_state(if available {
            "Running".into()
        } else {
            "Unavailable".into()
        });
        window.set_browser_detail(detail.into());
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
        window.set_can_configure(true);
        window.set_workspace_state(state.into());
        window.set_status_detail(detail.into());
        window.set_browser_state("Stopped".into());
        window.set_browser_detail(
            "A browser installation will be detected the next time services start.".into(),
        );
    });
}

fn apply_stopping_state(weak_window: &slint::Weak<ManagerWindow>) {
    update_window(weak_window, |window| {
        window.set_can_stop(false);
        window.set_can_configure(false);
        window.set_workspace_state("Stopping".into());
        window.set_status_detail("Stopping local services.".into());
        window.set_browser_state("Stopping".into());
        window.set_browser_detail("Stopping browser.".into());
    });
}

fn handle_service_event(
    running: &mut Option<RunningServices>,
    weak_window: &slint::Weak<ManagerWindow>,
) {
    let Some(services) = running else {
        return;
    };
    match services.poll_event() {
        Ok(Some(ServiceEvent::BrowserAvailabilityChanged { available, detail })) => {
            apply_browser_availability(weak_window, available, detail);
        }
        Ok(Some(ServiceEvent::OptionalExit { name, status })) => {
            apply_browser_availability(
                weak_window,
                false,
                format!("{name} stopped unexpectedly ({status}). See the service log."),
            );
        }
        Ok(Some(ServiceEvent::MandatoryExit { name, status })) => {
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
            Some(ControllerCommand::Start(settings)) if running.is_none() => {
                update_window(&weak_window, |window| {
                    window.set_can_start(false);
                    window.set_can_stop(true);
                    window.set_can_configure(false);
                    window.set_workspace_state("Starting".into());
                    window.set_status_detail("Starting local services.".into());
                    window.set_browser_state("Starting".into());
                    window.set_browser_detail("Checking for a browser installation.".into());
                });
                let mut exit_requested = false;
                match start_services(&layout, &settings, || {
                    let cancellation_requested =
                        startup_cancellation_requested(&receiver, &mut exit_requested);
                    if cancellation_requested && !exit_requested {
                        apply_stopping_state(&weak_window);
                    }
                    cancellation_requested
                }) {
                    Ok(StartupOutcome::Started(startup)) => {
                        apply_running_state(
                            &weak_window,
                            startup.browser_running,
                            startup.browser_detail,
                        );
                        running = Some(startup.services);
                    }
                    Ok(StartupOutcome::Cancelled) if exit_requested => return,
                    Ok(StartupOutcome::Cancelled) => apply_stopped_state(
                        &weak_window,
                        "Stopped",
                        "Service startup was cancelled.".to_owned(),
                    ),
                    Err(error) => apply_stopped_state(&weak_window, "Failed", error),
                }
            }
            Some(ControllerCommand::Stop) => {
                if let Some(mut services) = running.take() {
                    apply_stopping_state(&weak_window);
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
            Some(ControllerCommand::Start(_)) | None => {}
        }
        handle_service_event(&mut running, &weak_window);
    }
}

fn apply_settings_to_window(window: &ManagerWindow, settings: &DesktopSettings) {
    window.set_workspace_port(settings.workspace_port.to_string().into());
    window.set_dashboard_port(settings.dashboard_port.to_string().into());
    window.set_browser_port(settings.browser_port.to_string().into());
    window.set_browser_executable_path(
        settings
            .browser_executable
            .as_ref()
            .map(|path| path.display().to_string())
            .unwrap_or_default()
            .into(),
    );
    window.set_dashboard_url(settings.dashboard_url().into());
}

fn settings_from_window(
    window: &ManagerWindow,
) -> Result<DesktopSettings, desktop_settings::DesktopSettingsError> {
    DesktopSettings::from_fields(
        window.get_workspace_port().as_str(),
        window.get_dashboard_port().as_str(),
        window.get_browser_port().as_str(),
        window.get_browser_executable_path().as_str(),
    )
}

fn install_callbacks(
    window: &ManagerWindow,
    sender: &Sender<ControllerCommand>,
    layout: &ProductLayout,
    settings: Rc<RefCell<DesktopSettings>>,
) {
    let start_sender = sender.clone();
    let start_settings = Rc::clone(&settings);
    window.on_start_requested(move || {
        let _ = start_sender.send(ControllerCommand::Start(start_settings.borrow().clone()));
    });
    let stop_sender = sender.clone();
    window.on_stop_requested(move || {
        let _ = stop_sender.send(ControllerCommand::Stop);
    });

    let settings_window = window.as_weak();
    window.on_settings_requested(move || {
        if let Some(window) = settings_window.upgrade() {
            window.set_settings_detail("".into());
            window.set_settings_has_error(false);
            window.set_settings_visible(true);
        }
    });

    let cancel_window = window.as_weak();
    let cancel_settings = Rc::clone(&settings);
    window.on_settings_cancel_requested(move || {
        if let Some(window) = cancel_window.upgrade() {
            apply_settings_to_window(&window, &cancel_settings.borrow());
            window.set_settings_has_error(false);
            window.set_settings_visible(false);
        }
    });

    let save_window = window.as_weak();
    let save_settings = settings;
    let settings_path = layout.settings_path.clone();
    window.on_settings_save_requested(move || {
        let Some(window) = save_window.upgrade() else {
            return;
        };
        match settings_from_window(&window).and_then(|candidate| {
            candidate.save(&settings_path)?;
            Ok(candidate)
        }) {
            Ok(candidate) => {
                apply_settings_to_window(&window, &candidate);
                *save_settings.borrow_mut() = candidate;
                window.set_can_start(true);
                window.set_settings_has_error(false);
                window.set_settings_visible(false);
                window
                    .set_status_detail("Settings saved. Start Job Boardwalk to apply them.".into());
            }
            Err(error) => {
                window.set_settings_has_error(true);
                window.set_settings_detail(error.to_string().into());
            }
        }
    });
}

fn main() -> Result<(), Box<dyn Error>> {
    let manager_executable = env::current_exe()?;
    let layout = resolve_product_layout(&manager_executable)?;
    rendering_backend::select()?;
    let window = ManagerWindow::new()?;
    let (settings, settings_error) = match DesktopSettings::load(&layout.settings_path) {
        Ok(settings) => (settings, None),
        Err(error) => (DesktopSettings::default(), Some(error)),
    };
    apply_settings_to_window(&window, &settings);
    window.set_log_path(layout.log_path.display().to_string().into());
    if let Some(error) = settings_error {
        window.set_can_start(false);
        window.set_workspace_state("Failed".into());
        window.set_status_detail(format!("{error} Open Settings and save valid values.").into());
    }
    let (sender, receiver) = mpsc::channel();
    install_callbacks(&window, &sender, &layout, Rc::new(RefCell::new(settings)));
    let weak_window = window.as_weak();
    let controller = thread::spawn(move || controller_loop(receiver, weak_window, layout));
    let result = window.run();
    let _ = sender.send(ControllerCommand::Exit);
    let _ = controller.join();
    result?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ControllerCommand, startup_cancellation_requested};
    use std::sync::mpsc;

    #[test]
    fn exit_command_cancels_startup_and_exits_the_controller() {
        let (sender, receiver) = mpsc::channel();
        sender
            .send(ControllerCommand::Exit)
            .expect("controller channel should remain connected");
        let mut exit_requested = false;

        assert!(startup_cancellation_requested(
            &receiver,
            &mut exit_requested
        ));
        assert!(exit_requested);
    }

    #[test]
    fn stop_command_cancels_startup_without_exiting_the_controller() {
        let (sender, receiver) = mpsc::channel();
        sender
            .send(ControllerCommand::Stop)
            .expect("controller channel should remain connected");
        let mut exit_requested = false;

        assert!(startup_cancellation_requested(
            &receiver,
            &mut exit_requested
        ));
        assert!(!exit_requested);
    }
}
