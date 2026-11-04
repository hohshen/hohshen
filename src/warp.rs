//! 開場：深空躍遷回發射台（2D canvas）。
//!
//! 0–0.35 秒點狀星漂移 → 0.35–1.1 秒加速拉成光束 → 場景就緒後中心閃光 → 淡出。
//! 場景最多等到 2.3 秒；閃光 0.22 秒＋淡出 0.45 秒，整段 3 秒內結束。
//! index.html 的 CSS 另有保險：主執行緒被卡住時，合成器仍會在 3 秒內把 canvas 淡掉。
//! 點擊、滾輪、觸控、按鍵都會立刻略過；reduced motion 不播。

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use leptos::prelude::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement};

const WAIT_MAX: f64 = 2.3;
const FLASH: f64 = 0.22;
const FADE_MS: i32 = 460;

struct Star {
    x: f64,
    y: f64,
    z: f64,
    pz: f64,
    color: &'static str,
    w: f64,
}

impl Star {
    fn new(far: bool) -> Self {
        let r = js_sys::Math::random;
        let a = r() * std::f64::consts::TAU;
        let rad = 0.06 + r().powf(0.7) * 1.6;
        let z = if far { 2.2 + r() * 0.6 } else { 0.15 + r() * 2.6 };
        let color = if r() < 0.28 {
            "127,196,255"
        } else if r() < 0.12 {
            "255,214,170"
        } else {
            "220,232,245"
        };
        Star { x: a.cos() * rad, y: a.sin() * rad, z, pz: z, color, w: 0.5 + r() * 1.1 }
    }
}

#[derive(Clone, Copy)]
struct View {
    w: f64,
    h: f64,
    cx: f64,
    cy: f64,
    f: f64,
}

fn size(cv: &HtmlCanvasElement, ctx: &CanvasRenderingContext2d) -> View {
    let win = window();
    let w = win.inner_width().ok().and_then(|v| v.as_f64()).unwrap_or(1280.0);
    let h = win.inner_height().ok().and_then(|v| v.as_f64()).unwrap_or(800.0);
    let dpr = win.device_pixel_ratio().min(2.0);
    cv.set_width((w * dpr) as u32);
    cv.set_height((h * dpr) as u32);
    let _ = ctx.set_transform(dpr, 0.0, 0.0, dpr, 0.0, 0.0);
    View { w, h, cx: w / 2.0, cy: h * 0.46, f: w.max(h) * 0.5 }
}

fn speed(t: f64) -> f64 {
    if t < 0.35 {
        return 0.12;
    }
    let k = ((t - 0.35) / 0.75).min(1.0);
    0.12 + k * k * k * 4.2
}

/// `scene_ready`：3D 場景是否載好（好了才閃光）；`on_end`：開始淡出時呼叫一次
pub fn run(scene_ready: Rc<Cell<bool>>, reduce: bool, on_end: impl Fn() + 'static) {
    let Some(cv) = document().get_element_by_id("warp").and_then(|e| e.dyn_into::<HtmlCanvasElement>().ok()) else {
        on_end();
        return;
    };
    if reduce {
        cv.remove();
        on_end();
        return;
    }
    let Some(ctx) = cv.get_context("2d").ok().flatten().and_then(|c| c.dyn_into::<CanvasRenderingContext2d>().ok()) else {
        cv.remove();
        on_end();
        return;
    };

    let view = Rc::new(RefCell::new(size(&cv, &ctx)));
    let n = if view.borrow().w < 720.0 { 380 } else { 760 };
    let stars: Rc<RefCell<Vec<Star>>> = Rc::new(RefCell::new((0..n).map(|_| Star::new(false)).collect()));
    let faded = Rc::new(Cell::new(false));
    let removed = Rc::new(Cell::new(false));

    // 淡出：只做一次；淡出結束後移除 canvas、停掉動畫迴圈
    let fade: Rc<dyn Fn()> = {
        let (cv, faded, removed) = (cv.clone(), faded.clone(), removed.clone());
        Rc::new(move || {
            if faded.get() {
                return;
            }
            faded.set(true);
            on_end();
            let _ = cv.class_list().add_1("done");
            let (cv, removed) = (cv.clone(), removed.clone());
            let cb = Closure::once_into_js(move || {
                removed.set(true);
                cv.remove();
            });
            let _ = window().set_timeout_with_callback_and_timeout_and_arguments_0(cb.unchecked_ref(), FADE_MS);
        })
    };

    // 任何操作都略過
    for ev in ["pointerdown", "wheel", "touchstart", "keydown"] {
        let fade = fade.clone();
        let cb = Closure::<dyn Fn()>::new(move || fade());
        let opts = web_sys::AddEventListenerOptions::new();
        opts.set_once(true);
        opts.set_passive(true);
        let _ = window().add_event_listener_with_callback_and_add_event_listener_options(ev, cb.as_ref().unchecked_ref(), &opts);
        cb.forget();
    }
    {
        let (cv, ctx, view) = (cv.clone(), ctx.clone(), view.clone());
        let cb = Closure::<dyn Fn()>::new(move || *view.borrow_mut() = size(&cv, &ctx));
        let _ = window().add_event_listener_with_callback("resize", cb.as_ref().unchecked_ref());
        cb.forget();
    }

    ctx.set_fill_style_str("#06080F");
    {
        let v = view.borrow();
        ctx.fill_rect(0.0, 0.0, v.w, v.h);
    }

    let perf = window().performance().expect("performance");
    let t0 = perf.now();
    let last = Cell::new(t0);
    let flash_t = Cell::new(-1.0_f64);

    let frame: Rc<RefCell<Option<Closure<dyn FnMut(f64)>>>> = Rc::new(RefCell::new(None));
    let frame2 = frame.clone();
    *frame2.borrow_mut() = Some(Closure::new(move |now: f64| {
        if removed.get() {
            return; // canvas 已移除：不再排下一幀
        }
        let t = (now - t0) / 1000.0;
        let dt = ((now - last.get()) / 1000.0).min(0.05);
        last.set(now);
        let v = speed(t);
        let warp = ((t - 0.35) / 0.75).clamp(0.0, 1.0);
        let View { w, h, cx, cy, f } = *view.borrow();

        let _ = ctx.set_global_composite_operation("source-over");
        ctx.set_fill_style_str(&format!("rgba(6,8,15,{})", 0.55 - warp * 0.3));
        ctx.fill_rect(0.0, 0.0, w, h);
        // 中心的星雲光暈，躍遷時變亮
        if let Ok(g) = ctx.create_radial_gradient(cx, cy, 0.0, cx, cy, f * (0.5 + warp * 0.6)) {
            let _ = g.add_color_stop(0.0, &format!("rgba(127,196,255,{})", 0.05 + warp * 0.16));
            let _ = g.add_color_stop(0.4, &format!("rgba(60,70,160,{})", 0.03 + warp * 0.06));
            let _ = g.add_color_stop(1.0, "rgba(6,8,15,0)");
            ctx.set_fill_style_canvas_gradient(&g);
            ctx.fill_rect(0.0, 0.0, w, h);
        }

        let _ = ctx.set_global_composite_operation("lighter");
        ctx.set_line_cap("round");
        for st in stars.borrow_mut().iter_mut() {
            st.pz = st.z;
            st.z -= v * dt;
            if st.z <= 0.02 {
                *st = Star::new(true);
                continue;
            }
            let sx = cx + st.x / st.z * f;
            let sy = cy + st.y / st.z * f;
            if sx < -60.0 || sx > w + 60.0 || sy < -60.0 || sy > h + 60.0 {
                *st = Star::new(true);
                continue;
            }
            let px = cx + st.x / st.pz * f;
            let py = cy + st.y / st.pz * f;
            let a = ((2.8 - st.z) * 0.6).min(1.0) * (0.55 + warp * 0.45);
            ctx.set_stroke_style_str(&format!("rgba({},{a})", st.color));
            ctx.set_line_width(st.w * (1.0 + (1.0 / st.z) * 0.35));
            ctx.begin_path();
            ctx.move_to(px, py);
            ctx.line_to(if sx == px { sx + 0.01 } else { sx }, sy);
            ctx.stroke();
        }

        // 躍遷完成：等場景就緒後閃光
        if t > 1.1 && flash_t.get() < 0.0 && (scene_ready.get() || t > WAIT_MAX) {
            flash_t.set(t);
        }
        if flash_t.get() >= 0.0 {
            let k = (t - flash_t.get()) / FLASH;
            let r = f * (0.15 + k.min(1.4) * 2.2);
            let fa = if k <= 1.0 { k } else { (1.0 - (k - 1.0) * 1.6).max(0.0) };
            if let Ok(g) = ctx.create_radial_gradient(cx, cy, 0.0, cx, cy, r) {
                let _ = g.add_color_stop(0.0, &format!("rgba(255,255,255,{})", fa * 0.5));
                let _ = g.add_color_stop(0.3, &format!("rgba(180,222,255,{})", fa * 0.32));
                let _ = g.add_color_stop(1.0, "rgba(127,196,255,0)");
                ctx.set_fill_style_canvas_gradient(&g);
                ctx.fill_rect(0.0, 0.0, w, h);
            }
            if k >= 1.0 {
                fade();
            }
        }

        if let Some(cb) = frame.borrow().as_ref() {
            let _ = window().request_animation_frame(cb.as_ref().unchecked_ref());
        }
    }));
    if let Some(cb) = frame2.borrow().as_ref() {
        let _ = window().request_animation_frame(cb.as_ref().unchecked_ref());
    };
}
