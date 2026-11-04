//! 站上所有文字與連結。改內容只改這個檔。

pub const MAIL_INVITE: &str = "mailto:hohshen@gmail.com?subject=邀請演講或合作";

/// 導覽與手機目錄：(錨點 id, 名稱)
pub const NAV: [(&str, &str); 4] = [("writing", "寫作"), ("talks", "演講"), ("decisions", "取捨"), ("about", "關於")];

pub const MANIFEST: &str = "我擅長的不是追工具，是做取捨。自建或採購，哪些判斷交給機器，哪些留給人。這些取捨最後都要寫成別人也驗得出來的東西，不然只是我的品味。";

pub enum Source {
    Note(&'static str),
    Link { href: &'static str, text: &'static str },
}

pub struct Record {
    pub n: &'static str,
    pub unit: Option<&'static str>,
    pub label: &'static str,
    pub source: Source,
}

pub const RECORDS: [Record; 6] = [
    Record { n: "99", unit: Some("%"), label: "同仁每月都在用的 AI 數位員工", source: Source::Note("人均每月委派約 6 件任務；依營運、法務、技術分三個角色。內部資料，面談可說明") },
    Record { n: "19", unit: Some("個模組"), label: "企業入口平台，總部簽核到工廠生產循環", source: Source::Note("多數核心系統由我設計並完成；起步 3 人 5 個月交付 5 套，原估 1 年。內部資料") },
    Record { n: "10", unit: Some("萬盞"), label: "智慧路燈平台支撐的設備數", source: Source::Link { href: "https://news.ltn.com.tw/news/life/breakingnews/3686912", text: "專案整體年省約 1.53 億電費，自由時報報導" } },
    Record { n: "121", unit: Some("%"), label: "QA 數位員工讓測試情境成長的幅度", source: Source::Note("跨 6 個系統 12 階段；受控文件模組檢查全數通過，較期限提前四週。內部資料") },
    Record { n: "1/10", unit: None, label: "常規審查成本降到的比例", source: Source::Note("統計 22 次設計流程的 AI 花費後，改為自動檢查先過濾，判不了的才開多模型審查。內部資料") },
    Record { n: "5", unit: Some("種協定"), label: "特權存取管理平台，單一介面管理多雲資產", source: Source::Link { href: "https://techorange.com/2023/03/17/cloudmile-pentium-network-mavis/", text: "SSH、RDP、SFTP、PostgreSQL、Web Sandbox，TechOrange 報導" } },
];

/// 每一篇怎麼來的：(標題, 內文)
pub const STEPS: [(&str, &str); 3] = [
    ("公司裡先跑一輪", "題目一定先在真的系統上做過：核心系統、AI 數位員工、QA 自動化。"),
    ("寫成取捨紀錄", "每個決定填四欄：為什麼、為什麼不、撤銷條件、出處。填不出撤銷條件的，代表還沒想清楚。"),
    ("上台或發文，附出處", "只用驗得出來的數字。有公開連結就連，沒有就標內部資料，面談可追問。"),
];

pub struct Dossier {
    pub title: &'static str,
    pub why: &'static str,
    pub why_not: &'static str,
    pub revoke: &'static str,
}

pub const DOSSIERS: [Dossier; 3] = [
    Dossier { title: "AI 核心採購，流程與驗收自建", why: "AI 迭代速度過快，自建核心追不上大廠。", why_not: "自建核心會把人力耗在追版本，而公司的差異在任務流程與驗收規則。", revoke: "採購產品無法承載公司的驗收規則，或成本結構反轉。" },
    Dossier { title: "自動檢查先過濾，多模型審查殿後", why: "22 次流程統計，近半花費在讓多個 AI 互相審查。", why_not: "全靠多模型審查品質好但貴；全靠規則會漏掉需要語意判斷的題目。", revoke: "自動檢查的漏判率高到下游修復成本超過省下的審查費。" },
    Dossier { title: "測試情境是唯一規格來源", why: "E2E 測試從情境自動產生，失敗先分系統缺陷或測試錯誤。", why_not: "手寫測試會與規格漂移，兩份正本永遠對不上。", revoke: "情境描述無法表達的驗證需求佔比上升。" },
];

pub struct Line {
    pub title: &'static str,
    pub desc: &'static str,
    pub take: &'static str,
    pub status: &'static str,
    /// 已公開的才有連結
    pub href: Option<&'static str>,
}

pub const LINES: [Line; 5] = [
    Line { title: "架構是成本", desc: "每個架構決定都算維運、認知與換掉它的代價。先算帳再選，不先選再找理由。", take: "你會帶走：一張架構的帳", status: "6 篇，撰寫中", href: None },
    Line { title: "規格的品味", desc: "「做到什麼算完成」怎麼寫到 PM、工程師與 AI 看同一份。附我在公司裡用的交付閘門。", take: "你會帶走：一份驗得出來的規格", status: "4 篇，撰寫中", href: None },
    Line { title: "建立 AI 開發團隊", desc: "自建或採購、哪些判斷交給機器、哪些留給人。全公司 99% 同仁每月在用的體系怎麼長出來的。", take: "你會帶走：一套 AI 落地的取捨", status: "系列，撰寫中", href: None },
    Line { title: "搜尋演進史", desc: "倒排索引到向量、GraphRAG、SAG。每一代解決了什麼、又把什麼留給下一代，用 PostgreSQL 實作。", take: "你會帶走：一條搜尋技術的演進線", status: "10 篇，撰寫中", href: None },
    Line { title: "CRUD 仔的一生", desc: "30 篇。ACID、鎖、MVCC、WAL、查詢優化、索引結構、資料分割與讀寫分離。", take: "已公開：iThome 鐵人賽 2023", status: "閱讀 30 篇", href: Some("https://ithelp.ithome.com.tw/users/20163269/ironman/6881") },
];

pub struct Plate {
    pub class: &'static str,
    pub speed: &'static str,
    pub src: &'static str,
    pub alt: &'static str,
    pub w: u32,
    pub h: u32,
    pub caption: &'static str,
    pub year: &'static str,
}

pub const PLATES: [Plate; 3] = [
    Plate { class: "p1", speed: "0.06", src: "img/film-mopcon.jpg", alt: "後端里長伯在 MOPCON 2025 舞台上拿麥克風演講，背景投影片是後端里長伯的 Instagram 與 Medium", w: 1800, h: 1199, caption: "MOPCON，付費講師", year: "2025" },
    Plate { class: "p2", speed: "-0.08", src: "img/talk-coscup26.jpg", alt: "後端里長伯在 COSCUP 2026 與 UbuCon Asia 的主視覺牆前", w: 1200, h: 800, caption: "COSCUP，連續第三年", year: "2026" },
    Plate { class: "p3", speed: "0.04", src: "img/talk-coscup24.jpg", alt: "後端里長伯在 COSCUP 2024 講台上，背景投影片是探索 PG Vector", w: 1200, h: 802, caption: "COSCUP，PG Vector 與 RAG", year: "2024" },
];

/// 演講表：(年, 題目, 場次, 連結, 連結文字)
pub const TALKS: [(&str, &str, &str, &str, &str); 4] = [
    ("2026", "以 PostgreSQL 驅動 SAG 動態超邊推論引擎", "COSCUP", "https://coscup.org/2026/session/NHBKPE", "議程"),
    ("2025", "打造會記憶的 AI Codebase 理解引擎", "COSCUP、TAIDE、MOPCON、JSDC 巡迴四場", "https://coscup.org/2025/sessions/CAD9S3", "議程"),
    ("2025", "MCP 與 A2A 協定", "Postgres Taiwan 小講堂", "https://www.youtube.com/watch?v=NeUdvqI0gnY", "錄影"),
    ("2024", "PG Vector 與多模態檢索", "COSCUP、GDG Taipei、DevFest 高雄與台中、JSDC 巡迴五場", "https://www.youtube.com/watch?v=jT-A18wTBHM", "錄影"),
];

/// 常見問題：(問, 答)
pub const FAQ: [(&str, &str); 5] = [
    ("找你演講，可以講什麼？", "PostgreSQL 與 AI 檢索（pgvector、GraphRAG、SAG）、AI 開發團隊怎麼建、規格與架構的取捨。每一場的素材都是公司裡先跑過一輪的。"),
    ("用什麼語言講？", "中文。投影片中英混排。"),
    ("文章什麼時候公開？", "鐵人賽 30 篇已公開。四條線的稿件已定稿，公開後連結會補在寫作區。"),
    ("「內部資料」的數字怎麼驗？", "聊的時候我會說明量法與分母：模組怎麼數、覆蓋率怎麼算、測試情境成長的起訖點。可以追問到任何一個數字的來源。"),
    ("怎麼聯絡？", "寄信到 hohshen@gmail.com，標題寫邀請演講或合作，內文一句話說明場合與題目方向即可。"),
];

/// 頁尾連結：(網址, 名稱, 是否開新分頁)
pub const FOOTER_LINKS: [(&str, &str, bool); 5] = [
    ("mailto:hohshen@gmail.com", "hohshen@gmail.com", false),
    ("https://www.linkedin.com/in/hohshen", "LinkedIn", true),
    ("https://www.instagram.com/hohshen.backend/", "Instagram", true),
    ("https://medium.com/@hohshencode", "Medium", true),
    ("https://github.com/hohshen", "GitHub", true),
];

/// 標語在「，。；」之後切開，逐句亮起
pub fn manifest_parts() -> Vec<&'static str> {
    let mut out = Vec::new();
    let mut start = 0;
    for (i, ch) in MANIFEST.char_indices() {
        if matches!(ch, '，' | '。' | '；') {
            let end = i + ch.len_utf8();
            out.push(&MANIFEST[start..end]);
            start = end;
        }
    }
    if start < MANIFEST.len() {
        out.push(&MANIFEST[start..]);
    }
    out
}
