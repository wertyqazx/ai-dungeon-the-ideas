// Paste into the AI Dungeon "Output" script tab.
const modifier = (text) => {
  return Ideas("output", text, (storyText) => {
    globalThis.text = storyText;
    // Paste this file into the AI Dungeon "Output" script tab.
    const modifier = (text) => {
      return { text: WorldCalendar("output", text) };
    };
    return modifier(globalThis.text);
  });
};

modifier(text);
