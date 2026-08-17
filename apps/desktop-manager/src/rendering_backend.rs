#[cfg(target_os = "windows")]
pub(crate) fn select() -> Result<(), slint::PlatformError> {
    // Use a compositor-backed swap chain so window updates do not depend on GDI retaining
    // previously presented client pixels.
    slint::BackendSelector::new()
        .backend_name("winit".into())
        .renderer_name("skia".into())
        .require_d3d()
        .select()
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn select() -> Result<(), slint::PlatformError> {
    slint::BackendSelector::new()
        .backend_name("winit".into())
        .renderer_name("software".into())
        .select()
}
