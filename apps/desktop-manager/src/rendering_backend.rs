#[cfg(target_os = "windows")]
pub(crate) fn select() -> Result<(), slint::PlatformError> {
    // Windows can discard previously presented client pixels without invalidating softbuffer's
    // cached age. Use a compositor-backed swap chain instead of GDI partial-damage presentation.
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
