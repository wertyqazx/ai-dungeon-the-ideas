// Paste into the AI Dungeon "Output" script tab.
const modifier = (text) => {
  return Ideas("output", text, (storyText) => {
    globalThis.text = storyText;
    // Auto-Cards processes output before the World Calendar overlay.
    const modifier = (text) => {
      text = AutoCards("output", text);
      text = WorldCalendar("output", text);
      return { text };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
