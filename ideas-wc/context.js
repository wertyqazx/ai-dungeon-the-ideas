// Paste into the AI Dungeon "Context" script tab.
const modifier = (text) => {
  return Ideas("context", text, (storyText) => {
    globalThis.text = storyText;
    // Paste this file into the AI Dungeon "Context" script tab.
    const modifier = (text) => {
      return { text: WorldCalendar("context", text) };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
