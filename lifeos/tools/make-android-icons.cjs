// Renders the LifeOS icon into Android's mipmap folders (legacy, round and adaptive foreground). Run: node tools/make-android-icons.cjs
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path");
const res = path.join(__dirname, "../android/app/src/main/res"); const BG = "#55634f";
const art = `<path d="M116 330a140 140 0 0 1 280 0" fill="none" stroke="#f5f3ee" stroke-width="30" stroke-linecap="round"/><circle cx="256" cy="198" r="34" fill="#d8b88c"/><path d="M96 372h320" stroke="#f5f3ee" stroke-width="30" stroke-linecap="round"/>`;
const legacy = (r) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${r}" fill="${BG}"/>${art}</svg>`;
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(256 256) scale(.62) translate(-256 -256)">${art}</g></svg>`;
const dens = { mdpi: [48, 108], hdpi: [72, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (svg, size, file) => { await p.setViewportSize({ width: size, height: size }); await p.setContent(`<body style="margin:0;background:transparent">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`); await p.screenshot({ path: file, omitBackground: true }); };
  for (const [d, [l, f]] of Object.entries(dens)) {
    const dir = path.join(res, `mipmap-${d}`);
    await shot(legacy(96), l, path.join(dir, "ic_launcher.png")); await shot(legacy(256), l, path.join(dir, "ic_launcher_round.png")); await shot(foreground, f, path.join(dir, "ic_launcher_foreground.png"));
  }
  fs.writeFileSync(path.join(res, "values/ic_launcher_background.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG.toUpperCase()}</color>\n</resources>\n`);
  // splash: ivory background with the mark (portrait + landscape, all densities share one file)
  const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#f5f3ee"/><g transform="translate(256 256) scale(.5) translate(-256 -256)"><rect x="56" y="56" width="400" height="400" rx="90" fill="${BG}"/>${art}</g></svg>`;
  const sdirs = fs.readdirSync(res).filter((d) => /^drawable(-(land|port)-\w+)?$/.test(d));
  for (const d of sdirs) { const f = path.join(res, d, "splash.png"); if (fs.existsSync(f)) await shot(splash, 480, f); }
  await b.close();
})();
