// Paste into the AI Dungeon "Context" script tab.
const modifier = (text) => {
  return Ideas("context", text, (storyText) => {
    globalThis.text = storyText;
    // Inner Self and Auto-Cards run exactly as in their official Context wrapper.
    InnerSelf("context");

    // World Calendar appends its authoritative state afterward.
    const modifier = (text) => ({ text: WorldCalendar("context", text), stop });
    return modifier(globalThis.text);
  });
};

modifier(text);
