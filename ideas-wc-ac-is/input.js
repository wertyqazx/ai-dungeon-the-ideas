// Paste into the AI Dungeon "Input" script tab.
const modifier = (text) => {
  return Ideas("input", text, (storyText) => {
    globalThis.text = storyText;
    // Inner Self and Auto-Cards run exactly as in their official Input wrapper.
    InnerSelf("input");

    // World Calendar runs as a separate overlay modifier.
    const modifier = (text) => ({ text: WorldCalendar("input", text) });
    return modifier(globalThis.text);
  });
};

modifier(text);
