//! 把 App 以 SSR 輸出，寫進 index.html 的 <!--prerender--> 與 <!--/prerender--> 之間。
//! 給不跑 JS 的爬蟲與連結預覽讀；瀏覽器載入 wasm 後會清掉重畫。
//! 用法：cargo run --features ssr --bin prerender（build.sh 會先跑這一步）
use leptos::prelude::*;

fn main() {
    let html = Owner::new().with(|| view! { <hohshen_site::App/> }.to_html());
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/index.html");
    let src = std::fs::read_to_string(path).expect("讀 index.html");
    let (open, close) = ("<!--prerender-->", "<!--/prerender-->");
    assert!(src.matches(open).count() == 1 && src.matches(close).count() == 1, "index.html 的預渲染標記必須各出現一次");
    let a = src.find(open).expect("index.html 缺 <!--prerender-->") + open.len();
    let b = src.find(close).expect("index.html 缺 <!--/prerender-->");
    let out = format!("{}{}{}", &src[..a], html, &src[b..]);
    if out != src {
        std::fs::write(path, out).expect("寫 index.html");
        println!("prerender: index.html 已更新（{} bytes）", html.len());
    } else {
        println!("prerender: 內容沒變");
    }
}
