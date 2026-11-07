// Paste into the AI Dungeon "Input" script tab.
const modifier = (text) => {
  return Ideas("input", text, (storyText) => {
    globalThis.text = storyText;
    // Paste this file into the AI Dungeon "Input" script tab.
    const modifier = (text) => {
      return { text: WorldCalendar("input", text) };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
