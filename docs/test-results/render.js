// Renders the .txt test outputs in this folder as terminal-style PNGs for the slides (#41).
//
//   node docs/test-results/render.js
//
// Needs Chrome or Edge (headless). Set CHROME to its path if it isn't found. No npm packages.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SHOTS = [
  { txt: "api-db-tests.txt", cmd: "TEST_MONGODB_URI=mongodb://localhost:27017 npm run test:db" },
  // 388 lines don't fit a slide: the end of the run and the summary, with the rest counted.
  { txt: "api-unit-integration-tests.txt", cmd: "node --test --test-reporter=spec", tail: 30 },
];

const FONT_PX = 16;
const LINE_PX = 23;
const CHAR_PX = FONT_PX * 0.6; // monospace advance, a little generous so nothing clips
const PAD = { x: 28, top: 20, bottom: 24 };
const TITLE_BAR_PX = 38;

function findChrome() {
  const candidates = {
    win32: [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ],
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"],
  }[process.platform] ?? [];
  const found = [process.env.CHROME, ...candidates].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error("Chrome or Edge not found: set CHROME to its path");
  return found;
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// One <div> per line, colored like Node's spec reporter.
function lineHTML(line) {
  const m = line.match(/^(\s*)(✔|✖|▶|ℹ|﹣)?(.*)$/);
  const [, indent, mark = "", rest] = m;
  const cls = { "✔": "pass", "✖": "fail", "▶": "suite", "ℹ": "info", "﹣": "skip" }[mark] ?? "";
  return `<div class="${cls}">${escape(indent)}${mark && `<b>${mark}</b>`}${escape(rest)}</div>`;
}

function page({ cmd, lines, hidden }) {
  const body = [
    `<div class="prompt"><b>$</b> ${escape(cmd)}</div>`,
    ...(hidden ? [`<div class="more">… ${hidden} more lines above (all ${hidden + lines.length} in the .txt)</div>`] : []),
    ...lines.map(lineHTML),
  ].join(""); // no newlines between the divs: .out is white-space: pre
  return `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: #0d1117; }
  .win { background: #0d1117; color: #c9d1d9; font: ${FONT_PX}px/${LINE_PX}px "Cascadia Mono", Consolas, Menlo, "DejaVu Sans Mono", monospace; }
  .bar { height: ${TITLE_BAR_PX}px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 8px; padding: 0 16px;
         font: 13px system-ui, sans-serif; color: #8b949e; box-sizing: border-box; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .bar span { margin-left: 10px; }
  .out { padding: ${PAD.top}px ${PAD.x}px ${PAD.bottom}px; white-space: pre; overflow: hidden; }
  b { font-weight: normal; }
  .prompt b { color: #3fb950; } .prompt { color: #e6edf3; margin-bottom: 6px; }
  .more { color: #6e7681; font-style: italic; }
  .pass b { color: #3fb950; } .fail b, .fail { color: #f85149; }
  .suite { color: #e6edf3; font-weight: 600; } .info { color: #58a6ff; } .skip { color: #6e7681; }
</style><div class="win"><div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span>backend</span></div>
<div class="out">${body}</div></div>`;
}

const chrome = findChrome();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-results-"));
for (const shot of SHOTS) {
  const all = fs.readFileSync(path.join(__dirname, shot.txt), "utf8").replace(/\r/g, "").trimEnd().split("\n");
  const lines = shot.tail ? all.slice(-shot.tail) : all;
  const hidden = all.length - lines.length;
  const rows = 1 + (hidden ? 1 : 0) + lines.length;
  const longest = Math.max(shot.cmd.length + 2, ...lines.map((l) => l.length), 50);
  const width = Math.ceil(longest * CHAR_PX + 2 * PAD.x);
  const height = TITLE_BAR_PX + PAD.top + 6 + rows * LINE_PX + PAD.bottom;

  const html = path.join(tmp, shot.txt.replace(/\.txt$/, ".html"));
  const png = path.join(__dirname, shot.txt.replace(/\.txt$/, ".png"));
  fs.writeFileSync(html, page({ cmd: shot.cmd, lines, hidden }));
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
    `--window-size=${width},${height}`, `--screenshot=${png}`, `file:///${html.replace(/\\/g, "/")}`,
  ], { stdio: "ignore" });
  console.log(`${path.basename(png)}  ${width}x${height} (x2)`);
}
fs.rmSync(tmp, { recursive: true, force: true });
