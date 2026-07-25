#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

slint::include_modules!();

fn main() -> Result<(), slint::PlatformError> {
    ManagerWindow::new()?.run()
}
