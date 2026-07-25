fn main() {
    slint_build::compile("ui/manager-window.slint")
        .expect("desktop manager Slint interface should compile");
}
