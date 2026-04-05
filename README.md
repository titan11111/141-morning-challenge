# MORNING CHALLENGE（141）

## ファイル一覧と関連（フラット構成）

アプリ本体（HTML/CSS/JS・API 実装）は **`141-morning-challenge/` の直下**に並べています。  
**Vercel** はサーバーレスを **`api/` ディレクトリ**として認識する仕様のため、その直下に **1 行だけ**の入口ファイルを置いています（実装の重複はありません）。

| ファイル | 役割 |
|----------|------|
| **index.html** | 画面のマークアップのみ。`style.css` と `main.js` を読み込みます。 |
| **style.css** | 見た目（レイアウト・色・レスポンシブ・モーダル等）。 |
| **main.js** | アプリのロジック（localStorage・チェックイン・タブ・モーダル・共有API呼び出し・効果音等）。 |
| **morning-challenge-api.js** | **共有スコア API の実装本体**（Node・GET/POST）。KV 環境変数が必要です。 |
| **api/morning-challenge.js** | **Vercel 用の入口のみ**（`../morning-challenge-api.js` を `require`）。編集は通常ルートの `morning-challenge-api.js` だけでよいです。 |
| **vercel.json** | `framework: null` と `npm install`（静的＋`api/` の既定ルーティング）。 |
| **package.json** / **package-lock.json** | `@vercel/kv` 依存（API 実行時のみ使用）。 |
| **manifest.webmanifest** | PWA マニフェスト。 |
| **sw.js** | オフライン用 Service Worker（`index.html` / `style.css` / `main.js` 等をキャッシュ）。 |
| **icon.svg** | アプリアイコン。 |

### データの流れ

1. **ブラウザ** → `main.js` が `fetch('/api/morning-challenge', …)` を呼ぶ（`apiBase` 未設定時は同一オリジン）。
2. **Vercel** → `api/morning-challenge.js` が読み込まれ、**`morning-challenge-api.js`** のハンドラが KV に読み書きします。
3. **GitHub Pages のみ**の場合は API は動かず、クライアントは「共有なし」としてローカル記録のみになります（設定画面の説明どおり）。

### 開発メモ

- ルートに **`node_modules`** があれば `npm install` 済みです（API 用パッケージ）。

## 遊び方

- 操作は `index.html` を開いて行います（GitHub Pages では `…/141-morning-challenge/index.html`）。

## 状態

- [x] 本番利用可（静的 + 任意で Vercel API）
