// Renders the app icon into Android's mipmap folders (legacy, round and adaptive foreground). Run: node tools/make-android-icons.cjs
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const res = path.join(__dirname, "../android/app/src/main/res");
const mark = `<path d="M150 330l70 70 150-190" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><circle cx="256" cy="256" r="170" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="22"/>`;
const legacy = (r) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${r}" fill="#3a56d4"/>${mark}</svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 256) scale(.62) translate(-256 -256)">${mark}</g></svg>`;
const dens = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (svg, size, file) => { await p.setViewportSize({ width: size, height: size }); await p.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`); await p.screenshot({ path: file, omitBackground: true }); };
  for (const [d, [l, f]] of Object.entries(dens)) {
    const dir = path.join(res, `mipmap-${d}`);
    await shot(legacy(96), l, path.join(dir, "ic_launcher.png")); await shot(legacy(256), l, path.join(dir, "ic_launcher_round.png")); await shot(foreground, f, path.join(dir, "ic_launcher_foreground.png"));
  }
  fs.writeFileSync(path.join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#3A56D4</color>\n</resources>\n`);
  await b.close();
})();
