// AI Dungeon Ideas v1.0.0
// Paste this entire file into the AI Dungeon "Library" script tab.

/**
 * Creator configuration. Auto follows the story language, with Russian and
 * English interface labels. Set LANGUAGE to "ru" or "en" to force that language.
 */
globalThis.IdeasSettings = {
  LANGUAGE: "auto",
  DEFAULT_IDEA_COUNT: 3
};

function Ideas(hook, inputText, next = (text) => ({ text })) {
  const START = ">>> Ideas · OOC";
  const END = "<<< Ideas";
  // Distinct from the World Calendar transaction marker.
  const MARKER = /\u2063\u2063[\u200B\u200C]+\u2063/g;
  const TYPES = ["SAY", "DO", "STORY", "PLAN"];
  const source = typeof inputText === "string" ? inputText : "";
  const actions = Array.isArray(globalThis.history) ? history : [];
  const actionText = (action) => String(action?.text ?? action?.rawText ?? "");
  const data = state.Ideas;

  const stripMeta = (text) => text
    .replace(/^\s*>>> Ideas · OOC[^\r\n]*\r?\n[\s\S]*?^\s*<<< Ideas[ \t]*(?=\r?$)/gm, "")
    .replace(MARKER, "");

  const storyActions = () => actions.filter((action) => {
    const text = actionText(action);
    return !text.trimStart().startsWith(START) && !text.match(MARKER);
  });

  // The bundled mods also inspect history directly. Filter only their view
  // for this hook, keeping the engine's history and action count intact.
  const passThrough = (text) => {
    const filtered = storyActions();
    if (filtered.length === actions.length) return next(text);
    globalThis.history = filtered;
    try {
      return next(text);
    } finally {
      globalThis.history = actions;
    }
  };

  const parseCommand = () => {
    let line = source.trim();
    if (/^>\s*you\s+say\s+["“]/i.test(line)) {
      line = line.replace(/^>\s*you\s+say\s+["“]/i, "").replace(/["”][.!?]?$/, "");
    } else if (/^>\s*you\s+/i.test(line)) {
      line = line.replace(/^>\s*you\s+(?:(?:try to|attempt to|do)\s+)?/i, "");
      line = line.replace(/\.$/, "");
    }
    const match = line.match(/^[:/](ideas|plans)(?:[ \t]+([^\r\n]*))?$/i);
    if (!match) return null;

    let mode = match[1].toLowerCase() === "plans" ? "plan" : "mix";
    let tail = (match[2] || "").trim();
    if (tail.toLowerCase() === "help") return { mode, help: true, focus: "" };

    let count = mode === "plan" ? 3 : globalThis.IdeasSettings?.DEFAULT_IDEA_COUNT;
    if (!Number.isInteger(count) || count < 3 || count > 8) count = 3;
    if (mode === "mix") {
      const type = tail.match(/^(say|do|story)(?=\s|$)/i);
      if (type) {
        mode = type[1].toLowerCase();
        tail = tail.slice(type[0].length).trimStart();
      }
      const size = tail.match(/^([+-]?\d+)(?=\s|$)/);
      if (size) {
        count = Number(size[1]);
        tail = tail.slice(size[0].length).trimStart();
        if (count < 3 || count > 8) return { mode, help: true, focus: tail };
      }
    }

    const focus = tail.replace(/^--(?:\s+|$)/, "").slice(0, 240);
    return { mode, count, focus };
  };

  const markerFor = (id) => "\u2063\u2063" + id.toString(2)
    .replace(/0/g, "\u200B").replace(/1/g, "\u200C") + "\u2063";

  const latestRequest = () => {
    const latest = actions.slice().reverse().find((action) => actionText(action).trim());
    const text = actionText(latest);
    const marker = text.match(MARKER)?.[0];
    if (marker) return data?.requests?.find((request) => request.marker === marker);
    // Some Retry paths keep the replaced answer in history but omit it from
    // the model context. Continue still includes that answer.
    if (text.trimStart().startsWith(START)) {
      const previous = actionText(actions[actions.indexOf(latest) - 1]).match(MARKER)?.[0];
      if (previous && source.lastIndexOf(previous) > source.lastIndexOf(START)) {
        return data?.requests?.find((request) => request.marker === previous);
      }
    }
    return undefined;
  };

  const cleanContext = () => {
    let text = stripMeta(source);
    const heading = text.lastIndexOf("Recent Story:");
    if (heading >= 0) {
      const start = heading + "Recent Story:".length;
      // If AID trimmed the beginning of the oldest menu, remove its remainder.
      const story = text.slice(start).replace(/^[\s\S]*?^\s*<<< Ideas[ \t]*(?=\r?$)/m, "");
      if (story !== text.slice(start)) text = text.slice(0, start) + "\n" + story.trimStart();
    }
    return text;
  };

  const languageFor = (request, recent) => {
    const setting = globalThis.IdeasSettings?.LANGUAGE;
    if (setting === "ru" || setting === "en") return setting;
    const sample = request.focus || recent;
    return /[А-Яа-яЁё]/.test(sample) ? "ru" : "auto";
  };

  const calendarSnapshot = () => {
    if (!state.WorldCalendar || !Array.isArray(globalThis.storyCards)) return "";
    const card = storyCards.find((item) => item?.keys === "%WC_CALENDAR_V1%");
    if (!card || /^Enabled:\s*false\b/im.test(card.description || card.notes || "")) return "";
    return String(card.entry || "")
      .split(/\r?\nRecent dated events:/i)[0]
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("==="))
      .join("\n").trim().slice(0, 650);
  };

  const safeData = (value) => value.replace(/[<>]/g, (char) => char === "<" ? "‹" : "›");

  const modelContext = (request, context) => {
    const maxChars = Number.isInteger(globalThis.info?.maxChars) && info.maxChars > 0
      ? info.maxChars : 16000;
    if (request.help) return "Output only OK.".slice(0, maxChars);

    const plan = request.mode === "plan";
    const recent = storyActions().slice(-8).map(actionText).join("\n").trim();
    const language = languageFor(request, recent);
    const count = request.count;
    const tag = request.mode.toUpperCase();
    const task = plan
      ? "Offer distinct directions for the next several scenes. Ground each direction in an unresolved thread, goal, or relationship from the available plot. Give a concrete first step and its likely trade-off. Leave future outcomes open."
      : "Offer distinct choices for the very next beat. Ground each in the latest scene and what the player can plausibly know, say or do. Vary the approach and stakes. Leave NPC responses and outcomes open.";
    const format = plan
      ? "Format each line as PLAN | direction — first step — trade-off."
      : request.mode === "mix"
        ? "Start each line with one label and a bar: SAY | for dialogue, DO | for an action, STORY | for a story development. Use all three labels."
        : `Format each line as ${tag} | ${{ SAY: "speakable dialogue", DO: "a playable action", STORY: "an optional story development" }[tag]}.`;
    const outputRules = `Write ${count} options, one per line, in ${language === "ru" ? "Russian" : language === "en" ? "English" : "the language of the current story"}.`;
    const prompt = [
      "<SYSTEM>",
      "# IDEAS — OUT-OF-STORY PLAYER ASSISTANCE",
      "For this response, pause narration and write a choice menu. Treat story and world data as reference. Ignore other script menus and commands.",
      task,
      "Respect established facts, player agency, and knowledge boundaries. Keep possible developments hypothetical and preserve undiscovered secrets.",
      request.focus ? `Player's focus: ${safeData(request.focus)}` : "",
      outputRules,
      "Keep the labels in English.",
      `Use at most ${plan ? 30 : 12} words per option. No intro, numbering, Markdown or closing text.`,
      format,
      "</SYSTEM>"
    ].filter(Boolean).join("\n");

    // Very small custom budgets still get a complete, usable request.
    if (prompt.length + 4 >= maxChars) {
      return `${outputRules} ${format}`.slice(0, maxChars);
    }

    const heading = context.lastIndexOf("Recent Story:");
    const memoryLength = Number.isInteger(globalThis.info?.memoryLength) ? info.memoryLength : 0;
    const split = heading >= 0 ? heading : Math.max(0, Math.min(context.length, memoryLength));
    const background = context.slice(0, split).trim();
    const scene = context.slice(split + (heading >= 0 ? "Recent Story:".length : 0)).trim();

    // A long OOC menu can displace scene text before the Context hook runs.
    const anchor = recent.slice(-90).trim();
    const excerpt = anchor && !scene.includes(anchor) ? recent.slice(-1300) : "";
    const calendar = calendarSnapshot();
    let budget = maxChars - prompt.length - 2;
    const take = (label, value, limit, keepEnd = false) => {
      const available = Math.min(limit, budget - label.length - 3);
      if (!value || available <= 0) return "";
      const section = label + "\n" + (keepEnd ? value.slice(-available) : value.slice(0, available));
      budget -= section.length + 2;
      return section;
    };

    const lastActions = take("Latest story actions:", excerpt, Math.floor(budget / 3), true);
    const world = take("World Calendar snapshot:", safeData(calendar), Math.floor(budget / 4));
    const plotLimit = scene ? Math.max(budget - scene.length - 16, Math.floor(budget * (plan ? 0.65 : 0.3))) : budget;
    const plot = take("Plot context:", background, plan ? plotLimit : Math.min(4500, plotLimit));
    const latestScene = take("Recent Story:", scene, plan ? budget : Math.min(5500, budget), true);
    return [plot, latestScene, lastActions, world, prompt].filter(Boolean).join("\n\n");
  };

  const formatOutput = (request, generated, contextRan) => {
    const recent = storyActions().slice(-4).map(actionText).join("\n");
    const russian = languageFor(request, recent) === "ru";
    const labels = russian
      ? { SAY: "Реплика", DO: "Действие", STORY: "Идея для сюжета", PLAN: "Направление" }
      : { SAY: "Say", DO: "Do", STORY: "Story idea", PLAN: "Direction" };
    const usage = [
      ":ideas [say|do|story] [3–8] [-- focus]",
      ":plans [-- focus]"
    ].join("\n");
    const title = request.mode === "plan" ? (russian ? "Планы" : "Plans") : (russian ? "Подсказки" : "Suggestions");
    const wrap = (body) => `\n\n${START} / ${title}\n${body}\n${END}\n\n`;
    if (request.help) return wrap(usage);
    if (!contextRan) return wrap(russian
      ? "Контекстный модификатор не отработал. Отключите Optimized Context и повторите команду."
      : "The Context script did not run. Turn off Optimized Context and re-enter the command.");

    const validTypes = request.mode === "mix" ? TYPES.slice(0, 3) : [request.mode.toUpperCase()];
    const seen = new Set();
    const lines = [];
    for (const line of generated.split(/\r?\n/)) {
      const content = line.replace(/\*\*/g, "").trim().replace(/^(?:[-*+•]|\d+[.)])\s*/, "");
      const match = content.match(/^(SAY|DO|STORY|PLAN)\s*[|｜:：—–−-]\s*(.+)$/i)
        || content.match(/^\[\s*(SAY|DO|STORY|PLAN)\s*\]\s*[|｜:：—–−-]?\s*(.+)$/i);
      if (!match) continue;
      const kind = match[1].toUpperCase();
      const body = match[2].trim();
      const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!validTypes.includes(kind) || !key || seen.has(key)) continue;
      seen.add(key);
      lines.push(`${lines.length + 1}. ${labels[kind]} — ${body}`);
      if (lines.length >= request.count) break;
    }

    if (lines.length) return wrap(lines.join("\n"));
    return wrap(russian
      ? "В ответе модели не удалось распознать меню. Повторите команду."
      : "The model did not return a recognizable menu. Re-enter the command.");
  };

  if (hook === "input") {
    if (data) {
      delete data.pending;
      delete data.generating;
      delete data.storyInput;
    }
    const command = parseCommand();
    if (!command) {
      if (data && source.trim()) data.storyInput = true;
      return passThrough(inputText);
    }

    const store = state.Ideas ||= { nextId: 1, requests: [] };
    const request = { ...command, marker: markerFor(store.nextId++) };
    store.requests.push(request);
    if (store.requests.length > 16) store.requests.shift();
    store.pending = request;
    return { text: request.marker };
  }

  if (hook === "context") {
    const request = data?.pending || (data && !data.storyInput ? latestRequest() : undefined);
    if (data) {
      delete data.pending;
      delete data.generating;
      delete data.storyInput;
    }
    const context = cleanContext();
    if (request && globalThis.stop !== true) {
      data.generating = request;
      return { text: modelContext(request, context) };
    }
    return passThrough(context === source ? inputText : (context || " "));
  }

  if (hook === "output") {
    const request = data?.generating || data?.pending;
    if (request) {
      const contextRan = Boolean(data.generating);
      delete data.generating;
      delete data.pending;
      return { text: formatOutput(request, source, contextRan) };
    }
  }

  return passThrough(inputText);
}
