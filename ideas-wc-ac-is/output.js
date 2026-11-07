// Paste into the AI Dungeon "Output" script tab.
const modifier = (text) => {
  return Ideas("output", text, (storyText) => {
    globalThis.text = storyText;
    // Inner Self and Auto-Cards run exactly as in their official Output wrapper.
    InnerSelf("output");

    // World Calendar performs its output formatting afterward.
    const modifier = (text) => ({ text: WorldCalendar("output", text) });
    return modifier(globalThis.text);
  });
};

modifier(text);
