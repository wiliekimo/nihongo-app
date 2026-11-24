# CLAUDE.md

## 這個專案

使用者自己用的日文（＋英文）溝通練習網站，手機優先，部署在 GitHub Pages（`main` 分支根目錄）：https://wiliekimo.github.io/nihongo-app/

- 一律用**繁體中文（台灣用語）**跟使用者溝通。
- 使用者的目標：**在旅遊、遊戲開發、遊戲行銷時能用日文／英文對外溝通**。從 N5 開始，主要用手機利用零碎時間練習。
- 你的角色除了工程師，也是**語言老師**：使用者說「檢視測驗成果」「看我的紀錄」之類的話時，使用 `teacher-review` skill。

## 架構

- 純靜態網站，原生 ES modules，**沒有建置步驟、沒有相依套件**。保持這樣。
- 進度存在 localStorage，透過 Google Apps Script（`apps-script/Code.gs`）同步到使用者 Google 雲端硬碟裡的試算表「日文學習紀錄」（分頁：`作答紀錄`、`單字進度`）。
- 你可以用 Google Drive 連接器讀取該試算表（用標題搜尋）。**不要**把試算表 ID、Apps Script 網址、密碼或使用者個資寫進 repo——這是公開 repo。
- `data/teacher.json`：老師設定（給使用者的話、情境／題型加權、每日新字數），App 啟動時讀取。檢視後要調整出題就改這裡。

## 修改後必做

1. 改了 `data/*.json` → 執行 `node scripts/validate.mjs`，必須全部通過。
2. 改了任何會被快取的檔案（html/css/js/data）→ 把 `sw.js` 的 `VERSION` 加一。
3. 新增 js 或 data 檔案 → 也加進 `sw.js` 的 `SHELL` 清單；新增題庫要加進 `data/decks.json`。
4. 本機測試：`python3 -m http.server 8000`，用 Playwright 以手機尺寸（例如 iPhone 13）實際點一輪練習。
5. 推到 `main` 後 GitHub Pages 會自動更新（約 1 分鐘）。

## 題庫格式（data/n5.json）

```json
{
  "id": "n5-kau", "word": "買う", "reading": "かう", "pos": "動詞", "zh": "買", "en": "to buy",
  "examples": [
    { "theme": "travel", "register": "polite", "scene": "購物",
      "ja": "{駅|えき}でお{土産|みやげ}を[[{買|か}い]]ました。",
      "zh": "我在車站買了伴手禮。", "en": "I bought souvenirs at the station.", "enFocus": "souvenirs" }
  ]
}
```

- `theme`：`travel` / `gamedev` / `marketing`；`register`：`polite`（です・ます）/ `casual`（口語）/ `business`（商務敬語）。
- `ja`：**每個漢字都要標振假名** `{漢字|かな}`；目標單字（含活用語尾）用 `[[ ]]` 標一次。
- `enFocus`：英文句中值得學的字詞，必須原樣出現在 `en` 裡。
- `pos`：`動詞`、`名詞`、`い形容詞`、`な形容詞`、`副詞`、`表現`、`其他`。

## 寫例句的原則

- 要是**真的會說出口的句子**，對應具體場景（`scene`），不要課本式的造句。
- 目標字是 N5，句子文法盡量簡單；必要的較難詞彙可以出現（有振假名）。
- 對合作方用商務語氣，對玩家社群可用口語，旅遊用禮貌體。
- 中文用台灣用語（伴手禮、程式、影片、留言）。
- AI 寫的日文要自我檢查自然度；不確定的說法寧可換一句。
