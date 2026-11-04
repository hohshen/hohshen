//! 後端里長伯 Hohshen 個人站（Leptos）。
//!
//! - 頁面結構、導覽、手機目錄、高度讀數、標題揭示、標語逐句亮起、躍遷開場：本 crate。
//! - 3D 場景與捲動動畫（Three.js、GSAP、Lenis）：`src/js/scene.js`，頁面掛載後由 `boot()` 動態載入。
//!
//! 同一組元件也以 SSR 輸出成 index.html 的預渲染內容（`src/rust/bin/prerender.rs`）；
//! 瀏覽器端的程式都放在 Effect 或 `boot()` 裡，SSR 不會執行到。

pub mod content;
mod dom;
mod warp;

use content::*;
use leptos::prelude::*;

#[component]
pub fn App() -> impl IntoView {
    let menu_open = RwSignal::new(false);
    let current = RwSignal::new(String::new());
    let hud = RwSignal::new(("0 km".to_string(), "發射台".to_string()));

    Effect::new(move |_| dom::scroll_lock(menu_open.get()));
    Effect::new(move |prev: Option<()>| {
        if prev.is_none() {
            dom::watch_nav(current);
            dom::watch_hud(hud);
            dom::reveal_headings();
            dom::light_manifest();
        }
    });

    view! {
        <div class="cursor" id="cursor" aria-hidden="true"><div class="ring"></div><div class="dot"></div></div>
        <Nav menu_open current/>
        <div class="wash" id="wash" aria-hidden="true"></div>
        <div class="flash" id="flash" aria-hidden="true"></div>
        <div class="kline" id="kline" aria-hidden="true"><i></i><b>"100 km"</b><span>"KÁRMÁN LINE　離開大氣層"</span></div>
        <div class="hud" aria-hidden="true"><b id="hudKm">{move || hud.get().0}</b><span id="hudName">{move || hud.get().1}</span></div>
        <main id="main">
            <Hero/>
            <Manifest/>
            <RecordSection/>
            <How/>
            <Decisions/>
            <Writing/>
            <Talks/>
            <About/>
            <Dock/>
        </main>
        <Footer/>
    }
}

fn arrow() -> impl IntoView {
    view! {
        <svg class="arrow" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 9h12M10 4l5 5-5 5"/></svg>
    }
}

/// 章節標題左上的高度標記，例如「0 km 發射台」
#[component]
fn Nav(menu_open: RwSignal<bool>, current: RwSignal<String>) -> impl IntoView {
    view! {
        <nav class="nav" aria-label="主導覽">
            <a class="brand" href="#top">"Hohshen"</a>
            <ul>
                {NAV.into_iter().map(|(id, name)| view! {
                    <li><a href=format!("#{id}") aria-current=move || if current.get() == id { "true" } else { "false" }>{name}</a></li>
                }).collect_view()}
            </ul>
            <a class="cta link" href=MAIL_INVITE>"邀請合作"</a>
            <button class="menu-btn" type="button" aria-controls="menu"
                aria-expanded=move || menu_open.get().to_string()
                on:click=move |_| menu_open.set(true)>"目錄"</button>
        </nav>
        <div id="menu" class:open=move || menu_open.get() aria-hidden=move || (!menu_open.get()).to_string()>
            <button class="close" type="button" on:click=move |_| menu_open.set(false)>"關閉"</button>
            {NAV.into_iter().enumerate().map(|(i, (id, name))| view! {
                <a href=format!("#{id}") style=format!("transition-delay:{}s", 0.05 * (i + 1) as f32) on:click=move |_| menu_open.set(false)>{name}</a>
            }).collect_view()}
            <a href=MAIL_INVITE style="transition-delay:.25s;color:var(--atmo)" on:click=move |_| menu_open.set(false)>"邀請合作"</a>
        </div>
    }
}

#[component]
fn Hero() -> impl IntoView {
    view! {
        <section class="hero" id="top">
            <p class="kick">
                <span class="mask"><span style="--d:.1s">"後端里長伯 Hohshen"</span></span>
                <span class="mask"><span style="--d:.18s">"企業架構師"</span></span>
                <span class="mask"><span style="--d:.26s">"COSCUP 連續三年講者"</span></span>
            </p>
            <h1 class="display zh h-hero">
                <span class="mask"><span style="--d:.3s">"把架構取捨，"</span></span>
                <span class="mask"><span style="--d:.42s">"寫成別人也驗得出來的制度。"</span></span>
            </h1>
            <div class="row">
                <p class="lead mask"><span style="--d:.7s">"我是後端里長伯 Hohshen，製造業的企業架構師。白天把核心系統從總部接到工廠、把 AI 從概念驗證送進全公司日常營運的軌道；晚上把這些取捨寫成文章與演講。這一頁上的每個數字，旁邊都有出處。"</span></p>
                <div class="acts mask"><span style="--d:.9s">
                    <a class="btn magnet" href=MAIL_INVITE>"邀請我演講或合作"{arrow()}</a>
                    <a class="link" href="#writing">"看四條寫作線"</a>
                </span></div>
            </div>
            <div class="hint">"往下捲，離開地面"</div>
        </section>
    }
}

#[component]
fn Manifest() -> impl IntoView {
    view! {
        <section class="manifest" id="manifest">
            <p data-words="">{manifest_parts().into_iter().map(|w| view! { <span class="w">{w}</span> }).collect_view()}</p>
        </section>
    }
}

#[component]
fn RecordSection() -> impl IntoView {
    view! {
        <section class="record" id="record" data-km="0" data-name="發射台">
            <div class="sec-head">
                <div><h2 class="display zh h-sec"><span class="mask"><span>"實戰紀錄，附出處"</span></span></h2></div>
                <p class="lead">"我寫的每一篇、講的每一場，素材都從這裡起飛。數字只抄不算；出處兩態：媒體報導附公開連結、內部資料面談可說明。"</p>
            </div>
            <div class="rec">
                {RECORDS.into_iter().map(|r| view! {
                    <div class="r">
                        <div class="n num">{r.n}{r.unit.map(|u| view! { <small>{u}</small> })}</div>
                        <div class="l">{r.label}</div>
                        <div class="s">{match r.source {
                            Source::Note(t) => t.into_any(),
                            Source::Link { href, text } => view! { <a class="link" href=href target="_blank" rel="noopener">{text}</a> }.into_any(),
                        }}</div>
                    </div>
                }).collect_view()}
            </div>
        </section>
    }
}

#[component]
fn How() -> impl IntoView {
    view! {
        <section class="how" id="how" data-km="50" data-name="平流層頂">
            <div class="sec-head">
                <div><h2 class="display zh h-sec"><span class="mask"><span>"每一篇怎麼來的"</span></span></h2></div>
                <p class="lead">"沒上線過的不講。三步，缺一步就不發。"</p>
            </div>
            <div class="steps">
                {STEPS.into_iter().enumerate().map(|(i, (h, p))| view! {
                    <div class="step"><div class="k">{format!("Step {}", i + 1)}</div><h3 class="h-sub">{h}</h3><p>{p}</p></div>
                }).collect_view()}
            </div>
        </section>
    }
}

#[component]
fn Decisions() -> impl IntoView {
    let total = DOSSIERS.len();
    view! {
        <section class="decisions" id="decisions" data-km="100" data-name="卡門線">
            <div class="sec-head">
                <div><h2 class="display zh h-sec"><span class="mask"><span>"取捨紀錄"</span></span></h2></div>
                <p class="lead">"卡門線是大氣層與太空的分界。AI 專案能不能離開概念驗證，差別不在技術，在這幾個取捨有沒有寫成制度。這也是我每篇文章的骨架。"</p>
            </div>
            <div class="track" id="track">
                {DOSSIERS.into_iter().enumerate().map(|(i, d)| view! {
                    <article class="dossier">
                        <div class="no">{format!("{} / {}", i + 1, total)}</div>
                        <h3 class="display zh">{d.title}</h3>
                        <dl>
                            <div><dt>"為什麼"</dt><dd>{d.why}</dd></div>
                            <div><dt>"為什麼不選另一邊"</dt><dd>{d.why_not}</dd></div>
                            <div><dt>"撤銷條件"</dt><dd>{d.revoke}</dd></div>
                        </dl>
                    </article>
                }).collect_view()}
                <div class="end"></div>
            </div>
        </section>
    }
}

#[component]
fn Writing() -> impl IntoView {
    view! {
        <section class="writing" id="writing" data-km="400" data-name="低地軌道">
            <div class="sec-head">
                <div><h2 class="display zh h-sec"><span class="mask"><span>"四條寫作線"</span></span></h2></div>
                <p class="lead">"入軌之後就是持續運行。每條線各回答一個問題，你拿到的是方法與帳本，不是結論。篇數與狀態如實標示。"</p>
            </div>
            <ul class="lines">
                {LINES.into_iter().map(|l| {
                    let body = move |live: bool| view! {
                        <h3 class="display zh">{l.title}</h3>
                        <p>{l.desc}<span class="take">{l.take}</span></p>
                        <span class="st" class:live=live>{l.status}</span>
                    };
                    match l.href {
                        Some(href) => view! { <li><a href=href target="_blank" rel="noopener">{body(true)}</a></li> }.into_any(),
                        None => view! { <li><div class="row">{body(false)}</div></li> }.into_any(),
                    }
                }).collect_view()}
            </ul>
        </section>
    }
}

#[component]
fn Talks() -> impl IntoView {
    view! {
        <section class="talks" id="talks" data-km="36000" data-name="同步軌道">
            <div class="sec-head">
                <div><h2 class="display zh h-sec"><span class="mask"><span>"演講"</span></span></h2></div>
                <p class="lead">"同步軌道上的衛星負責廣播。公司裡驗證過的做法，透過演講往外送；2024 至 2026 共 12 場，COSCUP 連續三年，JSDC 與 MOPCON 付費講師。"</p>
            </div>
            <div class="plates">
                {PLATES.into_iter().map(|p| view! {
                    <figure class=p.class data-speed=p.speed>
                        <img src=p.src alt=p.alt width=p.w height=p.h/>
                        <figcaption><span>{p.caption}</span><b>{p.year}</b></figcaption>
                    </figure>
                }).collect_view()}
            </div>
            <div class="tbl">
                {TALKS.into_iter().map(|(y, t, v, href, lk)| view! {
                    <div class="tr">
                        <div class="y num">{y}</div><div class="t">{t}</div><div class="v">{v}</div>
                        <a class="link lk" href=href target="_blank" rel="noopener">{lk}</a>
                    </div>
                }).collect_view()}
            </div>
        </section>
    }
}

#[component]
fn About() -> impl IntoView {
    view! {
        <section class="about" id="about" data-km="ground" data-name="通訊">
            <div class="bio">
                <img src="img/portrait.jpg" alt="後端里長伯的大頭照" width="516" height="766"/>
                <div>
                    <h2 class="display zh" style="font-size:clamp(1.8rem,3vw,2.8rem);margin-bottom:18px">"關於我"</h2>
                    <p>"何勝，網路上叫後端里長伯。製造業的企業架構師，負責企業系統與 AI 導入的架構決策與交付制度。"</p>
                    <p class="small">"之前做過資安產品的特權存取管理平台，更早在系統整合公司帶 5 至 8 人團隊，設計過支撐近 10 萬盞設備的智慧路燈平台。三個產業共通的是高併發資料與跨部門交付。主力是 TypeScript、PostgreSQL、Kubernetes 與 LLM 周邊。國立臺北大學資訊工程學系。"</p>
                </div>
            </div>
            <div class="faq">
                {FAQ.into_iter().map(|(q, a)| view! {
                    <details><summary>{q}</summary><p class="a">{a}</p></details>
                }).collect_view()}
            </div>
        </section>
    }
}

#[component]
fn Dock() -> impl IntoView {
    view! {
        <section class="dock" id="dock">
            <h2 class="display zh" style="font-size:clamp(2.2rem,6vw,6rem)"><span class="mask"><span>"有一場演講、一個題目，想一起把它寫成制度？"</span></span></h2>
            <div class="row">
                <p>"寄信時寫一句場合與題目方向就好。我會在兩個工作日內回覆。"</p>
                <a class="btn magnet" href=MAIL_INVITE>"邀請我演講或合作"{arrow()}</a>
            </div>
        </section>
    }
}

#[component]
fn Footer() -> impl IntoView {
    view! {
        <footer>
            <div class="l">
                <div>"後端里長伯 Hohshen（何勝）"</div>
                <div class="rev"><span>"本站為靜態頁面，不使用 cookie，不蒐集任何資料。"</span></div>
            </div>
            <div class="r">
                {FOOTER_LINKS.into_iter().map(|(href, name, blank)| view! {
                    <a class="link" href=href target=blank.then_some("_blank") rel=blank.then_some("noopener")>{name}</a>
                }).collect_view()}
            </div>
        </footer>
    }
}

/// 瀏覽器端開機：頁面掛好之後呼叫。同時開始躍遷動畫與載入 3D 場景，兩者都好了才收尾開場。
pub fn boot() {
    dom::boot();
}
