// Renders build/icon.png (512) for the desktop app from public/icon.svg. Run: node tools/make-icons.cjs
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
(async () => { const svg = fs.readFileSync(path.join(__dirname, "../public/icon.svg"), "utf8").replace("<svg", '<svg width="512" height="512"'); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`); fs.mkdirSync(path.join(__dirname, "../build"), { recursive: true }); await p.screenshot({ path: path.join(__dirname, "../build/icon.png"), omitBackground: true }); await b.close(); })();
