//! 瀏覽器入口：清掉 index.html 的預渲染內容，掛上 Leptos 頁面，再開機（躍遷開場＋載入 3D 場景）。
use leptos::prelude::*;
use wasm_bindgen::JsCast;

fn main() {
    console_error_panic_hook::set_once();
    let root: web_sys::HtmlElement = document().get_element_by_id("app").expect("#app").unchecked_into();
    root.set_inner_html("");
    leptos::mount::mount_to(root, hohshen_site::App).forget();
    hohshen_site::boot();
}
