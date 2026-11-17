// One-off: renders public/icon.svg to the PNG sizes Android needs. Run: node tools/make-icons.cjs
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const svg = fs.readFileSync(path.join(__dirname, "../public/icon.svg"), "utf8");
const full = svg.replace('rx="112"', 'rx="0"'); // maskable: edge-to-edge, the OS applies its own shape
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (markup, size, name, scale = 1) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<body style="margin:0;background:#1f4fd8"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${markup.replace("<svg", `<svg width="${size * scale}" height="${size * scale}"`)}</div></body>`);
    await p.screenshot({ path: path.join(__dirname, "../public", name), omitBackground: true });
  };
  await shot(svg, 192, "icon-192.png"); await shot(svg, 512, "icon-512.png"); await shot(full, 512, "icon-maskable-512.png", 0.8);
  await b.close();
})();
