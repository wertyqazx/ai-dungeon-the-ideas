// Paste into the AI Dungeon "Input" script tab.
const modifier = (text) => {
  return Ideas("input", text, (storyText) => {
    globalThis.text = storyText;
    // Auto-Cards processes input before the World Calendar overlay.
    const modifier = (text) => {
      text = AutoCards("input", text);
      text = WorldCalendar("input", text);
      return { text };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
