//! 結構測試與內容規則。把 App 以 SSR 渲染成 HTML，再檢查：
//! 1. Rust↔JS 契約：js/scene.js 用到的 id／class 都在頁面上
//! 2. Rust↔CSS 契約：style/site.css 用到的 #id 都在頁面上
//! 3. 開新分頁的外部連結都帶 rel="noopener"
//! 4. <img> 都有 alt、width、height
//! 5. 頁內錨點 href="#x" 都對得到 id
//! 6. 禁用詞：公開清單 tests/forbidden-public.txt ＋ 不公開清單（環境變數 FORBIDDEN_TERMS 或本機 docs/forbidden.txt）
//! 7. JSON-LD（Person）：格式正確，網址與 og:url 一致，圖片存在，頁尾的社群連結都列在 sameAs
//!
//! 每條失敗訊息都寫明怎麼修。執行：cargo test --features ssr --test site_rules

use std::collections::BTreeSet;
use std::path::Path;

use leptos::prelude::*;
use regex::Regex;

const ROOT: &str = env!("CARGO_MANIFEST_DIR");

fn read(rel: &str) -> String {
    std::fs::read_to_string(Path::new(ROOT).join(rel)).unwrap_or_else(|e| panic!("讀不到 {rel}：{e}"))
}

fn page() -> String {
    Owner::new().with(|| view! { <hohshen_site::App/> }.to_html())
}

/// 頁面上所有 id；另加 index.html 範本本身的固定元素（#app 外的兩個 canvas 與 #app）
fn ids(html: &str) -> BTreeSet<String> {
    let mut out: BTreeSet<String> = Regex::new(r#"\sid="([^"]+)""#).unwrap().captures_iter(html).map(|c| c[1].to_string()).collect();
    for fixed in ["warp", "webgl", "app", "dev-hint"] {
        out.insert(fixed.to_string());
    }
    out
}

fn classes(html: &str) -> BTreeSet<String> {
    Regex::new(r#"\sclass="([^"]*)""#)
        .unwrap()
        .captures_iter(html)
        .flat_map(|c| c[1].split_whitespace().map(str::to_string).collect::<Vec<_>>())
        .collect()
}

fn report(problems: Vec<String>, title: &str) {
    assert!(problems.is_empty(), "\n{title}（{} 處）：\n  - {}\n", problems.len(), problems.join("\n  - "));
}

#[test]
fn scene_js_selectors_exist() {
    let html = page();
    let (ids, classes) = (ids(&html), classes(&html));
    let js = read("js/scene.js");
    // 抽出 scene.js 傳給 DOM API 與 ScrollTrigger 的選擇器字串
    let re = Regex::new(r#"(?:getElementById\(|querySelector(?:All)?\(|trigger:\s*|endTrigger:\s*|fromTo\(|\.to\()\s*'([^']+)'"#).unwrap();
    let mut problems = Vec::new();
    for cap in re.captures_iter(&js) {
        let raw = &cap[1];
        let is_id_call = cap[0].starts_with("getElementById");
        for sel in raw.split(',') {
            let sel = sel.trim();
            if is_id_call {
                if !ids.contains(sel) {
                    problems.push(format!("scene.js 用 getElementById('{sel}')，但頁面沒有 id=\"{sel}\"：請在 src/lib.rs 補上這個 id，或同步修改 js/scene.js"));
                }
                continue;
            }
            for tok in Regex::new(r"([#.])([A-Za-z][\w-]*)").unwrap().captures_iter(sel) {
                let name = &tok[2];
                let ok = if &tok[1] == "#" { ids.contains(name) } else { classes.contains(name) };
                if !ok {
                    problems.push(format!("scene.js 的選擇器 '{sel}' 用到 {}{name}，但 Rust 頁面沒有：請在 src/lib.rs 補上，或同步修改 js/scene.js", &tok[1]));
                }
            }
        }
    }
    report(problems, "Rust↔JS 契約不符");
}

#[test]
fn css_ids_exist() {
    let ids = ids(&page());
    let css = read("style/site.css");
    // 只看選擇器：去掉 {...} 宣告區塊，避免把色碼 #06080F 當成 id
    let selectors = Regex::new(r"\{[^{}]*\}").unwrap().replace_all(&css, "\n");
    let mut problems = Vec::new();
    for cap in Regex::new(r"#([A-Za-z][\w-]*)").unwrap().captures_iter(&selectors) {
        if !ids.contains(&cap[1]) {
            problems.push(format!("style/site.css 有 #{} 的樣式，但頁面沒有這個 id：刪掉這段樣式，或在 src/lib.rs 補上 id", &cap[1]));
        }
    }
    problems.dedup();
    report(problems, "Rust↔CSS 契約不符");
}

#[test]
fn external_links_have_noopener() {
    let html = page();
    let mut problems = Vec::new();
    for a in Regex::new(r"<a\s[^>]*>").unwrap().find_iter(&html) {
        let tag = a.as_str();
        if tag.contains(r#"target="_blank""#) && !tag.contains("noopener") {
            problems.push(format!("{tag} 開新分頁但沒有 rel=\"noopener\"：在 src/lib.rs 這個連結加上 rel=\"noopener\""));
        }
    }
    report(problems, "外部連結缺 noopener");
}

#[test]
fn images_have_alt_and_size() {
    let html = page();
    let mut problems = Vec::new();
    for img in Regex::new(r"<img\s[^>]*>").unwrap().find_iter(&html) {
        let tag = img.as_str();
        let alt_ok = Regex::new(r#"\salt="[^"]+""#).unwrap().is_match(tag);
        if !alt_ok || !tag.contains(" width=") || !tag.contains(" height=") {
            problems.push(format!("{tag}：圖片必須有非空的 alt 與 width、height（避免版面跳動、讓螢幕閱讀器讀得到）。到 src/content.rs 的 PLATES 或 src/lib.rs 補上"));
        }
    }
    report(problems, "圖片屬性不完整");
}

#[test]
fn anchors_point_to_existing_ids() {
    let html = page();
    let ids = ids(&html);
    let mut problems = Vec::new();
    for cap in Regex::new(r##"href="#([^"]+)""##).unwrap().captures_iter(&html) {
        if !ids.contains(&cap[1]) {
            problems.push(format!("連結 href=\"#{}\" 找不到對應的 id：改成存在的章節 id（見 src/content.rs 的 NAV），或補上該章節", &cap[1]));
        }
    }
    problems.dedup();
    report(problems, "頁內錨點失效");
}

#[test]
fn no_forbidden_terms() {
    // 檢查對象：渲染後的頁面＋index.html 範本（含 head 的 meta 與 og 文字）
    let text = format!("{}\n{}", page(), read("index.html"));
    let mut terms: Vec<(String, &str)> = read("tests/forbidden-public.txt")
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(|l| (l.to_string(), "公開清單 tests/forbidden-public.txt"))
        .collect();
    let private = std::env::var("FORBIDDEN_TERMS")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| (s, "不公開清單（FORBIDDEN_TERMS）"))
        .or_else(|| std::fs::read_to_string(Path::new(ROOT).join("docs/forbidden.txt")).ok().map(|s| (s, "不公開清單（docs/forbidden.txt）")));
    match &private {
        Some((list, src)) => terms.extend(list.lines().map(str::trim).filter(|l| !l.is_empty()).map(|l| (l.to_string(), *src))),
        None => eprintln!("提示：沒有設定不公開禁用詞（GitHub secret FORBIDDEN_TERMS 或本機 docs/forbidden.txt），只檢查公開清單"),
    }
    let mut problems = Vec::new();
    for (term, src) in &terms {
        if text.contains(term.as_str()) {
            // 不公開的詞不印出原文，只印第幾個字元起，避免 CI log 洩漏
            let shown = if src.starts_with("公開") { format!("「{term}」") } else { format!("一個不公開詞（{} 個字）", term.chars().count()) };
            problems.push(format!("頁面出現{shown}，來源：{src}。請到 src/content.rs 或 index.html 移除"));
        }
    }
    report(problems, "出現禁用詞");
}

#[test]
fn json_ld_person_is_valid_and_consistent() {
    let index = read("index.html");
    let blocks: Vec<&str> = Regex::new(r#"(?s)<script type="application/ld\+json">(.*?)</script>"#)
        .unwrap()
        .captures_iter(&index)
        .map(|c| c.get(1).unwrap().as_str())
        .collect();
    assert_eq!(blocks.len(), 1, "index.html 的 head 應該剛好有一段 JSON-LD（Person），目前 {} 段", blocks.len());
    let ld: serde_json::Value = serde_json::from_str(blocks[0]).unwrap_or_else(|e| panic!("index.html 的 JSON-LD 不是合法 JSON：{e}。請修正逗號或引號"));
    let s = |k: &str| ld.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let mut problems = Vec::new();
    if s("@context") != "https://schema.org" {
        problems.push("@context 必須是 \"https://schema.org\"".to_string());
    }
    if s("@type") != "Person" {
        problems.push("@type 必須是 \"Person\"".to_string());
    }
    for k in ["name", "alternateName", "jobTitle", "url", "image"] {
        if s(k).is_empty() {
            problems.push(format!("缺少 {k}：在 index.html 的 JSON-LD 補上"));
        }
    }
    let og_url = Regex::new(r#"<meta property="og:url" content="([^"]+)""#).unwrap().captures(&index).map(|c| c[1].to_string()).unwrap_or_default();
    if s("url") != og_url {
        problems.push(format!("JSON-LD 的 url（{}）與 og:url（{og_url}）不一致：兩處改成同一個網址", s("url")));
    }
    if let Some(img) = s("image").strip_prefix(og_url.as_str()) {
        if !Path::new(ROOT).join(img).exists() {
            problems.push(format!("JSON-LD 的 image 指向 {img}，但 repo 裡沒有這個檔案：改成 img/ 下存在的圖片"));
        }
    } else {
        problems.push(format!("JSON-LD 的 image（{}）要放在站內（以 {og_url} 開頭）", s("image")));
    }
    let same_as: BTreeSet<String> = ld.get("sameAs").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
    for (href, name, blank) in hohshen_site::content::FOOTER_LINKS {
        if blank && !same_as.contains(href) {
            problems.push(format!("頁尾的 {name}（{href}）沒有列在 JSON-LD 的 sameAs：搜尋引擎靠它把各平台帳號連到同一個人，請補上"));
        }
    }
    report(problems, "JSON-LD 不完整或與頁面不一致");
}
