# The Ideas for AI Dungeon

Ideas gives the player options when they want help deciding what to do next. It uses the adventure's model to suggest dialogue, playable actions, and story developments grounded in the current scene. Plans uses the broader context to suggest directions for the next several scenes.

## Choose a build

| Folder | Included scripts |
| --- | --- |
| [`ideas/`](ideas/) | Ideas only. No dependencies. |
| [`ideas-wc/`](ideas-wc/) | Ideas + World Calendar |
| [`ideas-wc-ac/`](ideas-wc-ac/) | Ideas + World Calendar + Auto-Cards |
| [`ideas-wc-ac-is/`](ideas-wc-ac-is/) | Ideas + World Calendar + Auto-Cards + Inner Self |

Choose one folder and paste its four files into the corresponding tabs in the AI Dungeon scenario script editor.

| File | Editor tab |
| --- | --- |
| `library.js` | Library |
| `input.js` | Input |
| `context.js` | Context |
| `output.js` | Output |

Open the scenario's **Details → Scripting → Edit Scripts**, enable scripts, and save all four tabs. Turn off **Optimized Context** in the adventure's model memory settings, if the model offers it. If the scenario already uses World Calendar, keep your existing `WorldCalendarSettings` when you paste in the new Library. Each combined folder already includes all the scripts in its name. See the [AI Dungeon scripting guide](https://help.aidungeon.com/scripting) and [World Calendar setup](https://github.com/wertyqazx/ai-dungeon-world-calendar).

## Commands

Enter commands in **Story** mode. Each command uses one model generation.

| Command | Result |
| --- | --- |
| `:ideas` | Five mixed options for the next beat by default |
| `:ideas say` | Dialogue the player can say |
| `:ideas do` | Actions the player can take |
| `:ideas story` | Optional developments the player can introduce |
| `:ideas 8` | Ask for eight mixed options. Allowed range is 3–8. |
| `:ideas do 4 -- get past the guard peacefully` | Combine a category, count, and focus |
| `:plans` | Three directions for the next several scenes, each with a first step and likely trade-off |
| `:plans -- Mira's debt` | Focus the plans on one plot thread |
| `:ideas help` | Show command syntax |

A focus can be plain text. Use `--` to distinguish it from a category or count. The slash aliases `/ideas` and `/plans` work too. Change `IdeasSettings` in Library to set the default count and language. The model follows the story language by default, and the menu labels support English and Russian.

The suggestions appear as an out-of-character menu. Enter a new action in your own words or copy a suggestion into the matching input mode. Continue resumes the story. Retry can regenerate the current menu when AI Dungeon supplies the corresponding input to the script.

## Context and compatibility

- Ideas emphasizes recent actions. Plans uses the model's available context, including Plot Essentials, Story Summary, and retrieved memories when AI Dungeon includes them. On long adventures, update Story Summary with older plot threads you want Plans to consider.
- Menus appear in the adventure transcript. Ideas strips them from subsequent model context and from the history used by the bundled scripts. AI Dungeon's own transcript, action count, and automatic summarization still operate independently.
- The combined builds bypass World Calendar, Auto-Cards, and Inner Self for Ideas commands. A pending World Calendar confirmation remains available through `:yes` or `:no`. If a calendar card already exists, Ideas reads its current snapshot for date, location, weather, and active events.
- The model may return fewer options than requested if the response is too short or some lines fail format checks. Increase the AI response length for larger menus or longer plans.

## Development

Requires Node.js 18+ and Git to rebuild the combined files. The files in all four folders are ready to paste.

```sh
git clone https://github.com/wertyqazx/ai-dungeon-world-calendar.git ../ai-dungeon-world-calendar
npm run build -- ../ai-dungeon-world-calendar
npm test
```

Edit `ideas/library.js` for shared behavior. The build tool combines it with World Calendar v1.2.2 at commit [`ee9582c`](https://github.com/wertyqazx/ai-dungeon-world-calendar/tree/ee9582cff72b7e445c704786b1ef23eb42c637cc), with Auto-Cards v1.1.3 and Inner Self v1.0.2 as shipped in that repository. The tests simulate separate Input, Context, and Output sandboxes. See [third-party notices](THIRD_PARTY_NOTICES.md) for attribution.
