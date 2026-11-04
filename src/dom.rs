//! 瀏覽器端的行為：觀察捲動與可見範圍、開場收尾、跟 3D 場景（js/scene.js）溝通。
//! 只會在 Effect 或 `boot()` 裡被呼叫，SSR 預渲染時不會執行。

use std::cell::Cell;
use std::rc::Rc;

use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{Element, IntersectionObserver, IntersectionObserverEntry, IntersectionObserverInit};

#[wasm_bindgen(module = "/js/bridge.js")]
extern "C" {
    #[wasm_bindgen(js_name = loadScene)]
    fn load_scene() -> js_sys::Promise;
    #[wasm_bindgen(js_name = sceneIntro)]
    fn scene_intro();
    #[wasm_bindgen(js_name = sceneScrollLock)]
    fn scene_scroll_lock(on: bool);
}

pub fn reduced_motion() -> bool {
    window()
        .match_media("(prefers-reduced-motion: reduce)")
        .ok()
        .flatten()
        .is_some_and(|m| m.matches())
}

pub fn scroll_lock(on: bool) {
    scene_scroll_lock(on);
}

fn query_all(sel: &str) -> Vec<Element> {
    let list = document().query_selector_all(sel).expect("selector");
    (0..list.length()).filter_map(|i| list.item(i)?.dyn_into::<Element>().ok()).collect()
}

/// 建一個 IntersectionObserver；回呼拿到「進入可見範圍的元素」與 observer 本身
fn observer(margin: &str, on_enter: impl Fn(Element, &IntersectionObserver) + 'static) -> IntersectionObserver {
    let cb = Closure::<dyn Fn(js_sys::Array, IntersectionObserver)>::new(move |entries: js_sys::Array, obs: IntersectionObserver| {
        for e in entries.iter() {
            let e: IntersectionObserverEntry = e.unchecked_into();
            if e.is_intersecting() {
                on_enter(e.target(), &obs);
            }
        }
    });
    let init = IntersectionObserverInit::new();
    init.set_root_margin(margin);
    let obs = IntersectionObserver::new_with_options(cb.as_ref().unchecked_ref(), &init).expect("IntersectionObserver");
    cb.forget();
    obs
}

fn set_timeout(ms: i32, f: impl FnOnce() + 'static) {
    let cb = Closure::once_into_js(f);
    let _ = window().set_timeout_with_callback_and_timeout_and_arguments_0(cb.unchecked_ref(), ms);
}

fn on_window(ev: &str, f: impl Fn() + 'static) {
    let cb = Closure::<dyn Fn()>::new(f);
    let opts = web_sys::AddEventListenerOptions::new();
    opts.set_passive(true);
    let _ = window().add_event_listener_with_callback_and_add_event_listener_options(ev, cb.as_ref().unchecked_ref(), &opts);
    cb.forget();
}

/// 導覽列標示目前所在的章
pub fn watch_nav(current: RwSignal<String>) {
    let obs = observer("-40% 0px -50% 0px", move |el, _| current.set(el.id()));
    for (id, _) in crate::content::NAV {
        if let Some(el) = document().get_element_by_id(id) {
            obs.observe(&el);
        }
    }
}

/// 標題遮罩揭示：只對標題，一次
pub fn reveal_headings() {
    let obs = observer("0px 0px -12% 0px", |el, obs| {
        let _ = el.class_list().add_1("in");
        obs.unobserve(&el);
    });
    for el in query_all(".sec-head, .dock") {
        obs.observe(&el);
    }
}

/// 標語逐句亮起
pub fn light_manifest() {
    let words = query_all("[data-words] .w");
    if reduced_motion() {
        for w in &words {
            let _ = w.class_list().add_1("on");
        }
        return;
    }
    let order = words.clone();
    let obs = observer("0px 0px -35% 0px", move |el, obs| {
        let i = order.iter().position(|w| *w == el).unwrap_or(0) as i32;
        let target = el.clone();
        set_timeout(i * 90, move || {
            let _ = target.class_list().add_1("on");
        });
        obs.unobserve(&el);
    });
    for w in &words {
        obs.observe(w);
    }
}

fn fmt_km(v: f64) -> String {
    let n = v.round() as i64;
    if n >= 1000 {
        let s = n.to_string();
        let mut out = String::new();
        for (i, ch) in s.chars().enumerate() {
            if i > 0 && (s.len() - i) % 3 == 0 {
                out.push(',');
            }
            out.push(ch);
        }
        format!("{out} km")
    } else {
        format!("{n} km")
    }
}

/// 左下角高度讀數：依畫面中線所在的章顯示高度，章與章之間顯示「轉移軌道」並內插
pub fn watch_hud(hud: RwSignal<(String, String)>) {
    let secs: Vec<(Element, String, String)> = query_all("section[data-km]")
        .into_iter()
        .map(|el| {
            let km = el.get_attribute("data-km").unwrap_or_default();
            let name = el.get_attribute("data-name").unwrap_or_default();
            (el, km, name)
        })
        .collect();
    let pending = Rc::new(Cell::new(false));
    let update = Rc::new(move || {
        let w = window();
        let sy = w.scroll_y().unwrap_or(0.0);
        let ih = w.inner_height().ok().and_then(|v| v.as_f64()).unwrap_or(0.0);
        let mid = sy + ih * 0.5;
        let mut cur: Option<usize> = None;
        for (i, (el, _, _)) in secs.iter().enumerate() {
            if el.get_bounding_client_rect().top() + sy <= mid {
                cur = Some(i);
            }
        }
        let (mut km, mut name) = ("0 km".to_string(), "發射台".to_string());
        if let Some(ci) = cur {
            let (el, ckm, cname) = &secs[ci];
            name = cname.clone();
            if ckm == "ground" {
                km = "地面站".to_string();
            } else {
                let mut v: f64 = ckm.parse().unwrap_or(0.0);
                if let Some((_, nkm, _)) = secs.get(ci + 1) {
                    if nkm != "ground" {
                        let top = el.get_bounding_client_rect().top() + sy;
                        let h = el.unchecked_ref::<web_sys::HtmlElement>().offset_height() as f64;
                        let st = top + h * 0.7;
                        let p = ((mid - st) / (h * 0.3)).clamp(0.0, 1.0);
                        if p > 0.0 {
                            v += (nkm.parse::<f64>().unwrap_or(v) - v) * p;
                            name = "轉移軌道".to_string();
                        }
                    }
                }
                km = fmt_km(v);
            }
        }
        hud.set((km, name));
    });
    update();
    on_window("scroll", move || {
        if pending.get() {
            return;
        }
        pending.set(true);
        let (u, p) = (update.clone(), pending.clone());
        let cb = Closure::once_into_js(move |_: f64| {
            u();
            p.set(false);
        });
        let _ = window().request_animation_frame(cb.unchecked_ref());
    });
}

/// 開場：躍遷動畫結束（或被略過）且 3D 場景載好，才收尾：鏡頭定位、顯示導覽與標題
pub fn boot() {
    let warp_done = Rc::new(Cell::new(false));
    let scene_ready = Rc::new(Cell::new(false));
    let fired = Rc::new(Cell::new(false));
    let reduce = reduced_motion();

    let try_fire = {
        let (warp_done, scene_ready, fired) = (warp_done.clone(), scene_ready.clone(), fired.clone());
        Rc::new(move || {
            if fired.get() || !warp_done.get() || !scene_ready.get() {
                return;
            }
            fired.set(true);
            scene_intro();
            set_timeout(if reduce { 0 } else { 200 }, || {
                if let Some(b) = document().body() {
                    let _ = b.class_list().add_1("intro-done");
                }
            });
        })
    };

    {
        let (warp_done, try_fire) = (warp_done.clone(), try_fire.clone());
        crate::warp::run(scene_ready.clone(), reduce, move || {
            warp_done.set(true);
            try_fire();
        });
    }

    wasm_bindgen_futures::spawn_local(async move {
        if let Err(e) = wasm_bindgen_futures::JsFuture::from(load_scene()).await {
            web_sys::console::error_2(&"[site] 3D 場景載入失敗".into(), &e);
        }
        scene_ready.set(true);
        try_fire();
    });
}
