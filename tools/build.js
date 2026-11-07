const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const UPSTREAM = "ee9582cff72b7e445c704786b1ef23eb42c637cc";
const sourceRepo = process.argv[2];
if (!sourceRepo) throw new Error("Usage: npm run build -- /path/to/ai-dungeon-world-calendar");
const upstream = (file) => execFileSync("git", ["-C", sourceRepo, "show", `${UPSTREAM}:${file}`], { encoding: "utf8" });
const ideas = fs.readFileSync(path.join(ROOT, "ideas/library.js"), "utf8");

const variants = [
  { name: "ideas-wc", source: "calendar-only", components: "World Calendar" },
  { name: "ideas-wc-ac", source: "calendar-autocards", components: "World Calendar + Auto-Cards" },
  { name: "ideas-wc-ac-is", source: "calendar-inner-self-autocards", components: "World Calendar + Auto-Cards + Inner Self" }
];

for (const variant of variants) {
  const dest = path.join(ROOT, variant.name);
  fs.mkdirSync(dest, { recursive: true });

  const notice = [
    `// AI Dungeon Ideas + ${variant.components}`,
    `// Bundled from https://github.com/wertyqazx/ai-dungeon-world-calendar/tree/${UPSTREAM}`,
    "// Distributed under the MIT licenses shipped with this project.",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(dest, "library.js"), notice + upstream(`${variant.source}/library.js`).trimEnd() + "\n\n" + ideas);

  for (const phase of ["input", "context", "output"]) {
    const script = upstream(`${variant.source}/${phase}.js`).trim();
    if (!script.endsWith("modifier(text);")) throw new Error(`Unexpected ${variant.source}/${phase}.js`);
    const body = script.slice(0, -"modifier(text);".length).trim();
    const wrapper = [
      `// Paste into the AI Dungeon "${phase[0].toUpperCase() + phase.slice(1)}" script tab.`,
      "const modifier = (text) => {",
      `  return Ideas("${phase}", text, (storyText) => {`,
      "    globalThis.text = storyText;",
      ...body.split("\n").map((line) => line ? "    " + line : ""),
      "    return modifier(globalThis.text);",
      "  });",
      "};",
      "",
      "modifier(text);",
      ""
    ].join("\n");
    fs.writeFileSync(path.join(dest, `${phase}.js`), wrapper);
  }
}

fs.writeFileSync(path.join(ROOT, "LICENSE"), upstream("LICENSE"));
fs.writeFileSync(path.join(ROOT, "licenses/auto-cards.txt"), upstream("calendar-autocards/vendor/auto-cards/LICENSE"));
fs.writeFileSync(path.join(ROOT, "licenses/inner-self.txt"), upstream("calendar-inner-self-autocards/vendor/inner-self/LICENSE"));
