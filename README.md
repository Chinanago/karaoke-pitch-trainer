# Karaoke Pitch Trainer

ブラウザ内でマイク入力のピッチを推定し、カラオケ採点に近い形で「音程正確率」と「発声率」を表示する MVP です。

## Features

- Vite + TypeScript の素の DOM アプリ
- Web Audio API + AudioWorklet によるブラウザ内ピッチ検出
- Canvas 2D の横スクロール音程バー
- パブリックドメイン曲「ふるさと」冒頭のお手本データ
- GitHub Pages への Actions 自動デプロイ

音声はサーバーへ送信されません。すべてブラウザ内で処理されます。

## Development

```bash
npm install
npm run dev
```

ローカルでは `http://localhost:5173/` を開きます。マイク許可は localhost でも利用できます。

## Build

```bash
npm run build
```

GitHub Pages 用の base path は `vite.config.ts` で `karaoke-pitch-trainer` に合わせています。
