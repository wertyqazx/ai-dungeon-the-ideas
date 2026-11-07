// Paste into the AI Dungeon "Context" script tab.
const modifier = (text) => {
  return Ideas("context", text, (storyText) => {
    globalThis.text = storyText;
    // Auto-Cards processes context before the World Calendar overlay.
    const modifier = (text) => {
      [text, stop] = AutoCards("context", text, stop);
      text = WorldCalendar("context", text);
      return { text, stop };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
