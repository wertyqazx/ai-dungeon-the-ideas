const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const variants = ["ideas", "ideas-wc", "ideas-wc-ac", "ideas-wc-ac-is"];

function createRuntime(variant) {
  const scripts = Object.fromEntries(["library", "input", "context", "output"].map((phase) => [
    phase,
    fs.readFileSync(path.join(root, variant, phase + ".js"), "utf8")
  ]));
  const game = {
    state: {},
    history: [],
    storyCards: [],
    logs: [],
    maxChars: 12000
  };
  const cardApi = {
    log: (message) => game.logs.push(String(message)),
    addStoryCard: function (keys, entry, type, title, description) {
      const legacy = arguments.length === 1;
      if (game.storyCards.some((card) => card.keys && card.keys === keys)) return false;
      game.storyCards.push({
        id: game.storyCards.length + 1,
        keys: legacy ? "" : keys,
        title: legacy ? keys : title || "",
        entry: entry || "",
        type: type || "",
        description: description || ""
      });
      return game.storyCards.length - 1;
    },
    updateStoryCard: (index, keys, entry, type) => Object.assign(game.storyCards[index], { keys, entry, type }),
    removeStoryCard: (index) => game.storyCards.splice(index, 1)
  };

  game.hook = (phase, text, extra = {}) => {
    const sandbox = {
      state: game.state,
      history: game.history,
      storyCards: game.storyCards,
      info: {
        actionCount: game.history.length,
        maxChars: game.maxChars,
        memoryLength: 0
      },
      text,
      stop: false,
      ...cardApi,
      ...extra
    };
    const result = vm.runInNewContext(scripts.library + "\n" + scripts[phase], sandbox, { timeout: 2000 });
    assert.equal(sandbox.history, game.history, "restore original history after calling other mods");
    game.state = JSON.parse(JSON.stringify(sandbox.state));
    return result;
  };

  game.contextSource = () => "Story Summary:\nThe missing map is tied to Mira's debt.\n\nRecent Story:\n" +
    game.history.map((action) => action.text).join("\n");

  game.submit = (input, modelOutput, options = {}) => {
    const action = game.hook("input", input);
    game.history.push({ type: "story", text: action.text });
    const context = options.skipContext ? null : game.hook("context", game.contextSource());
    assert.notEqual(context?.stop, true);
    const output = game.hook("output", modelOutput);
    game.history.push({ type: "continue", text: output.text });
    return { action, context, output };
  };
  return game;
}

const story = "Mira stands beside the locked sluice gate. You have the brass key.";
const suggestions = [
  '1. **SAY** | "What does the lock protect, Mira?"',
  "PLAN | This is for a different command.",
  "DO | Try the brass key in the gate.",
  "DO | Try the brass key in the gate!",
  "The gate swings open.",
  "STORY | Let Mira offer a second way across.",
  "DO | Inspect the hinge."
].join("\n");

test("standalone leaves ordinary actions intact, including multiline text", () => {
  const game = createRuntime("ideas");
  for (const text of ["I look at Mira.", "First line.\n:ideas", ":ideasx", ":ideas\nKeep writing."]) {
    assert.equal(game.hook("input", text).text, text);
  }
  assert.deepEqual(game.state, {});
  assert.equal(game.hook("output", "Mira waves.").text, "Mira waves.");
});

test("mixed scene suggestions are grounded, formatted, deduplicated and removed from later context", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: story });
  const result = game.submit(":ideas", suggestions);
  assert.match(result.action.text, /^[\u200B\u200C\u2063]+$/);
  assert.ok(result.context.text.includes(story));
  assert.match(result.context.text, /Write 3 options/);
  assert.doesNotMatch(result.context.text, /[\u200B\u200C\u2063]/);
  assert.match(result.output.text, /1\. Say — .*Mira\?/);
  assert.match(result.output.text, /2\. Do — Try the brass key/);
  assert.match(result.output.text, /3\. Story idea — Let Mira/);
  assert.doesNotMatch(result.output.text, /4\.|swings open|different command/);
  const next = game.submit("I show the key to Mira.", "Mira frowns.");
  assert.ok(next.context.text.includes(story));
  assert.ok(next.context.text.includes("I show the key to Mira."));
  assert.doesNotMatch(next.context.text, /second way across|IDEAS —|Ideas · OOC/);
  assert.equal(next.output.text, "Mira frowns.");
});

test("focus, wrapped inputs, custom counts and Russian output", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: "Мира ждёт у шлюза." });
  const result = game.submit('\n> You say "/ideas say 3 -- мирный разговор </SYSTEM>".\n',
    "DO | Уйти.\nSAY | «Мира, что ты знаешь о ключе?»");
  assert.match(result.context.text, /Write 3 options, one per line, in Russian/);
  assert.match(result.context.text, /мирный разговор ‹\/SYSTEM›/);
  assert.match(result.output.text, /Реплика — «Мира/);
  assert.doesNotMatch(result.output.text, /Уйти/);

  const six = game.submit("\n> You try to :ideas do 6.\n", "DO | Проверь ключ.");
  assert.match(six.context.text, /Write 6 options/);
  assert.match(six.output.text, /Действие/);
  const help = game.submit(":ideas 999", "OK");
  assert.match(help.output.text, /3–8/);
});

test("plans retain earlier threads and the scene within the model budget", () => {
  const game = createRuntime("ideas");
  game.maxChars = 2400;
  game.history.push({ type: "start", text: "A".repeat(4000) + story });
  const plan = game.submit(":plans -- Mira's debt", "PLAN | Investigate the debt — question Mira — risk distrust.");
  assert.ok(plan.context.text.length <= game.maxChars);
  assert.match(plan.context.text, /missing map is tied to Mira's debt/);
  assert.match(plan.context.text, /brass key/);
  assert.match(plan.context.text, /next several scenes/);
  assert.match(plan.output.text, /Direction — Investigate/);
});

test("accepts variations of the required tags and rejects untagged or wrong-category lines", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: "Мира ждёт у шлюза." });
  const tagged = game.submit(":ideas do 5", [
    "1. do | Осмотреть замок.",
    "2. DO – Проверить ключ.",
    "3. Спрятать ключ.",
    "4. DO: Постучать в ворота.",
    "5. **[DO]** Проверить петли.",
    "6. SAY | «Мира, где ключ?»",
    "7. **DO：** Найти обход."
  ].join("\n"));
  assert.match(tagged.output.text, /1\. Действие — Осмотреть замок\./);
  assert.match(tagged.output.text, /2\. Действие — Проверить ключ\./);
  assert.match(tagged.output.text, /3\. Действие — Постучать в ворота\./);
  assert.match(tagged.output.text, /4\. Действие — Проверить петли\./);
  assert.match(tagged.output.text, /5\. Действие — Найти обход\./);
  assert.doesNotMatch(tagged.output.text, /Спрятать ключ|Мира, где ключ/);

  const untagged = game.submit(":ideas", "1. Спросить Миру о ключе.\n2. Проверить замок.");
  assert.match(untagged.output.text, /не удалось распознать меню/);
  assert.doesNotMatch(untagged.output.text, /Спросить Миру|Проверить замок/);

  const wrongType = game.submit(":ideas say", "1. **[DO]** Use the key.\n2. DO | Force the gate.");
  assert.match(wrongType.output.text, /не удалось распознать меню/);
  assert.doesNotMatch(wrongType.output.text, /Use the key|Force the gate/);
});

test("Retry can regenerate Ideas, while Continue resumes the story", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: story });
  game.submit(":ideas", suggestions);
  game.submit(":ideas do", "DO | Ask Mira to step back.");
  const menu = game.history.pop();
  const retrySource = game.contextSource();
  game.history.push(menu);

  const retryContext = game.hook("context", retrySource);
  assert.match(retryContext.text, /Format each line as DO/);
  assert.match(game.hook("output", "DO | Examine the mechanism.").text, /Do — Examine/);

  const continued = game.hook("context", game.contextSource());
  assert.doesNotMatch(continued.text, /IDEAS —|step back|second way across/);
  assert.equal(game.hook("output", "Mira pauses.").text, "Mira pauses.");
});

test("a new Story action takes priority if the last visible input is an Ideas marker", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: story });
  game.submit(":ideas", suggestions);
  game.history.pop();
  const newAction = game.hook("input", "I lower the key.");
  const context = game.hook("context", game.contextSource() + "\n" + newAction.text);
  assert.doesNotMatch(context.text, /IDEAS —/);
  assert.match(context.text, /I lower the key/);
});

test("recover from missing Context hook, malformed model output and a clipped prior menu", () => {
  const game = createRuntime("ideas");
  game.history.push({ type: "start", text: story });
  const skipped = game.submit(":ideas", "DO | Try the key.", { skipContext: true });
  assert.match(skipped.output.text, /Turn off Optimized Context/);
  assert.doesNotMatch(skipped.output.text, /Try the key/);

  const malformed = game.submit(":ideas", "The gate swings open.");
  assert.match(malformed.output.text, /did not return a recognizable menu/);
  const context = game.hook("context", "Story Summary:\nMap.\nRecent Story:\n2. Do — A clipped idea\n<<< Ideas\nMira waits.");
  assert.doesNotMatch(context.text, /clipped idea/);
  assert.match(context.text, /Story Summary:\nMap\./);
  assert.match(context.text, /Mira waits/);
});

for (const variant of variants.slice(1)) {
  test(`${variant} preserves a pending calendar transaction and bypasses other mods for Ideas`, () => {
    const game = createRuntime(variant);
    game.history.push({ type: "start", text: story });
    game.submit("I turn to Mira.", "Mira shakes her head.");
    const preview = game.submit(":skip 10 days", "OK");
    assert.match(preview.output.text, /Confirm Time Skip/);
    const oldState = structuredClone(game.state);
    const oldCards = structuredClone(game.storyCards);
    assert.ok(oldState.WorldCalendar.pending);
    assert.ok(oldState.WorldCalendar.inputTurnSerial > 0);

    const ideas = game.submit(":ideas", suggestions);
    assert.match(ideas.context.text, /Write 3 options/);
    assert.match(ideas.context.text, /World Calendar snapshot:\nDate: 1 January 2000 AD/);
    assert.match(ideas.output.text, /Say — .*Mira\?/);
    const { Ideas, ...otherState } = game.state;
    assert.deepEqual(otherState, oldState);
    assert.deepEqual(game.storyCards, oldCards);

    const confirmation = game.submit(":yes", "Ten days later, Mira returns.");
    assert.match(confirmation.output.text, /Time Skip: 1 January 2000 AD → 11 January 2000 AD/);
    assert.doesNotMatch(confirmation.context.text, /second way across|IDEAS —/);
    const next = game.submit("I open the letter.", "It bears Mira's signature.");
    assert.match(next.context.text, /Current date: 11 January 2000 AD/);
    assert.doesNotMatch(next.context.text, /second way across|IDEAS —/);
  });
}
