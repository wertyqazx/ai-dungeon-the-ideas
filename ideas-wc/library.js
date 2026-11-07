// AI Dungeon Ideas + World Calendar
// Bundled from https://github.com/wertyqazx/ai-dungeon-world-calendar/tree/ee9582cff72b7e445c704786b1ef23eb42c637cc
// Distributed under the MIT licenses shipped with this project.
// AI Dungeon World Calendar v1.2.2
// Paste this entire file into the AI Dungeon "Library" script tab.

/**
 * Creator configuration. Edit this block before publishing your scenario.
 */
globalThis.WorldCalendarSettings = {
  START_DATE: { year: 2000, month: 1, day: 1 },
  ERA: "AD",
  CALENDAR_CARD_TITLE: "World Calendar",
  MAX_SKIP_YEARS: 1000,
  AUTO_SKIP_LIMIT_DAYS: 7,
  MAX_RECENT_EVENTS: 5,

  // Seasons follow the ordinary northern-hemisphere calendar. Local conditions
  // and temperatures are generated deterministically from date and climate.
  WEATHER_ENABLED: true,
  CLIMATE_BY_REGION: {
    "Example Kingdom": "temperate",
    "Coastal Republic": "warm_maritime",
    "Frontier League": "warm_frontier"
  },
  CLIMATE_BY_LOCATION: {
    "Eastwatch": "mountain"
  },

  // Travel is optional. The calendar and events work when this is false.
  ENABLE_TRAVEL: false,
  START_LOCATION: {
    id: "hearthport",
    name: "Hearthport",
    state: "Example Kingdom",
    continent: "Western Lands"
  },

  // Used for Character Creator and opening-text location detection.
  LOCATION_GROUPS: [
    {
      state: "Example Kingdom",
      continent: "Western Lands",
      aliases: [],
      locations: ["Hearthport", "Rivergate"]
    },
    {
      state: "Coastal Republic",
      continent: "Southern Shores",
      aliases: [],
      locations: ["Sunharbor"]
    },
    {
      state: "Frontier League",
      continent: "Eastern Expanse",
      aliases: [],
      locations: ["Eastwatch"]
    }
  ],

  // Concrete destinations available to :travel when ENABLE_TRAVEL is true.
  TRAVEL_NODES: [
    { id: "hearthport", name: "Hearthport", state: "Example Kingdom", continent: "Western Lands", access: 0, aliases: [] },
    { id: "rivergate", name: "Rivergate", state: "Example Kingdom", continent: "Western Lands", access: 2, aliases: [] },
    { id: "sunharbor", name: "Sunharbor", state: "Coastal Republic", continent: "Southern Shores", access: 1, aliases: [] },
    { id: "eastwatch", name: "Eastwatch", state: "Frontier League", continent: "Eastern Expanse", access: 3, aliases: [] }
  ],

  // Optional hubs allow travel to begin from a custom place in a known region.
  STATE_TRAVEL_HUBS: {
    "Example Kingdom": "hearthport",
    "Coastal Republic": "sunharbor",
    "Frontier League": "eastwatch"
  },
  CONTINENT_TRAVEL_HUBS: {
    "Western Lands": "hearthport",
    "Southern Shores": "sunharbor",
    "Eastern Expanse": "eastwatch"
  },
  CONTINENT_ALIASES: [
    { name: "Western Lands", aliases: ["Western Lands"] },
    { name: "Southern Shores", aliases: ["Southern Shores"] },
    { name: "Eastern Expanse", aliases: ["Eastern Expanse"] }
  ],

  // Direct symmetric links used to build shortest staged routes.
  // mode is displayed to the player. transition and restrictedState are optional.
  TRAVEL_EDGES: [
    { leftId: "hearthport", rightId: "rivergate", days: 14, mode: "land" },
    { leftId: "hearthport", rightId: "sunharbor", days: 20, mode: "sea", transition: true },
    { leftId: "rivergate", rightId: "eastwatch", days: 32, mode: "land" },
    { leftId: "sunharbor", rightId: "eastwatch", days: 18, mode: "sea", transition: true }
  ],

  // Legacy complete TRAVEL_DAYS tables remain supported when TRAVEL_EDGES is empty.
  TRAVEL_DAYS: {},

  // Annual and one-time events. Add your own entries using docs/EVENTS.md.
  RECURRING_FESTIVALS: [],
  SCHEDULED_EVENTS: []
};

function WorldCalendar(hook, inputText) {
  "use strict";

  const ZERO_WIDTH_SPACE = "\u200B";
  const CALENDAR_MARKER = "%WC_CALENDAR_V1%";
  const CALENDAR_KEY = CALENDAR_MARKER;
  const CUSTOM_EVENTS_MARKER = "%WC_CUSTOM_EVENTS_V1%";
  const CUSTOM_EVENTS_KEY = CUSTOM_EVENTS_MARKER;
  const SETTINGS = globalThis.WorldCalendarSettings || {};
  const UNDO_WINDOW_ACTIONS = 3;
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const WEATHER_PROFILES = {
    temperate: {
      temperatures: { Winter: [-6, 6], Spring: [5, 18], Summer: [17, 29], Autumn: [6, 18] },
      conditions: {
        Winter: ["Clear and cold", "Overcast and cold", "Light snow", "Cold rain", "Frosty morning fog"],
        Spring: ["Mild and partly cloudy", "Steady spring rain", "Brief showers", "Cool morning fog", "Windy with broken clouds"],
        Summer: ["Clear and warm", "Partly cloudy", "Warm rain", "A passing thunderstorm", "Humid and still"],
        Autumn: ["Cool and overcast", "Steady rain", "Low morning fog", "Clear and crisp", "Strong cool wind"]
      }
    },
    warm_temperate: {
      temperatures: { Winter: [4, 14], Spring: [11, 23], Summer: [23, 35], Autumn: [13, 25] },
      conditions: {
        Winter: ["Cool and clear", "Overcast with light rain", "Damp morning fog", "Windy and cool", "A brief cold shower"],
        Spring: ["Warm and clear", "Mild rain", "Partly cloudy", "Fresh river mist", "A brief thunder shower"],
        Summer: ["Hot and clear", "Humid and bright", "A heavy afternoon shower", "A distant thunderstorm", "Hot with light wind"],
        Autumn: ["Warm and overcast", "Steady rain", "Clear and mild", "Humid morning mist", "Windy with scattered showers"]
      }
    },
    cold_maritime: {
      temperatures: { Winter: [-10, 3], Spring: [1, 11], Summer: [10, 20], Autumn: [2, 12] },
      conditions: {
        Winter: ["Cold coastal wind", "Wet snow", "Freezing rain", "Low sea fog", "Clear and bitterly cold"],
        Spring: ["Cold sea mist", "Drizzle and strong wind", "Patchy rain", "Cool and clear", "Low coastal clouds"],
        Summer: ["Cool and sunny", "Cloudy with sea wind", "Light coastal rain", "Dense morning fog", "A brief squall"],
        Autumn: ["Strong cold wind", "Heavy coastal rain", "Thick sea fog", "Overcast and raw", "An early wet snowfall"]
      }
    },
    mountain: {
      temperatures: { Winter: [-18, -2], Spring: [-5, 10], Summer: [5, 18], Autumn: [-4, 10] },
      conditions: {
        Winter: ["Heavy snow", "Clear with severe frost", "Blowing snow", "Dense freezing fog", "A hard mountain wind"],
        Spring: ["Cold and bright", "Melting snow with mist", "Sleet", "Mountain rain", "Sudden snowfall"],
        Summer: ["Clear and cool", "Fast-moving mountain clouds", "Cold rain", "A sharp thunderstorm", "High valley mist"],
        Autumn: ["Cold and windy", "Early snow", "Low mountain fog", "Freezing rain", "Clear with night frost"]
      }
    },
    warm_maritime: {
      temperatures: { Winter: [7, 16], Spring: [13, 23], Summer: [22, 33], Autumn: [15, 25] },
      conditions: {
        Winter: ["Mild with sea wind", "Steady coastal rain", "Low harbor fog", "Cloudy and damp", "Clear and cool"],
        Spring: ["Mild and sunny", "Fresh sea breeze", "Brief coastal showers", "Morning mist", "Partly cloudy"],
        Summer: ["Hot and sunny", "Humid with a sea breeze", "A brief warm shower", "Clear and windy", "A coastal thunderstorm"],
        Autumn: ["Warm and cloudy", "Persistent coastal rain", "Strong sea wind", "Humid harbor fog", "Clear and mild"]
      }
    },
    desert: {
      temperatures: { Winter: [5, 20], Spring: [15, 30], Summer: [28, 45], Autumn: [18, 33] },
      conditions: {
        Winter: ["Clear and dry", "Cool with a light desert wind", "Cold before sunrise", "Dusty and overcast", "Rare light rain"],
        Spring: ["Dry and sunny", "A hot dusty wind", "Clear with rising heat", "Blowing dust", "A rare brief shower"],
        Summer: ["Extremely hot and cloudless", "Dry with shimmering heat", "A strong hot wind", "Blowing sand", "Still and oppressive heat"],
        Autumn: ["Hot and clear", "Dry with a cooling wind", "Dust haze", "Warm and cloudless", "A rare desert shower"]
      }
    },
    desert_coast: {
      temperatures: { Winter: [10, 22], Spring: [18, 29], Summer: [27, 39], Autumn: [20, 32] },
      conditions: {
        Winter: ["Clear with a cool sea breeze", "Coastal haze", "Dry and mild", "Low morning fog", "A rare light shower"],
        Spring: ["Sunny with sea wind", "Warm coastal haze", "Dry and bright", "Humid morning mist", "Windblown dust"],
        Summer: ["Very hot with a sea breeze", "Humid and bright", "Hot coastal haze", "Strong dry wind", "Still and oppressive heat"],
        Autumn: ["Warm and clear", "Humid coastal haze", "Dry with a steady breeze", "Cloudy but warm", "A rare coastal shower"]
      }
    },
    humid_forest: {
      temperatures: { Winter: [3, 12], Spring: [10, 22], Summer: [18, 30], Autumn: [9, 21] },
      conditions: {
        Winter: ["Cold forest mist", "Steady rain", "Damp and overcast", "Clear beneath a cold canopy", "Light sleet"],
        Spring: ["Warm rain", "Dense morning mist", "Bright after a shower", "Humid and overcast", "A brief thunderstorm"],
        Summer: ["Hot and humid", "Heavy forest rain", "A violent thunderstorm", "Warm mist beneath the canopy", "Bright with scattered showers"],
        Autumn: ["Cool forest rain", "Thick ground fog", "Damp and still", "Wind in the canopy", "Clear and mild"]
      }
    },
    tropical_maritime: {
      temperatures: { Winter: [19, 28], Spring: [22, 31], Summer: [26, 36], Autumn: [23, 32] },
      conditions: {
        Winter: ["Warm with a steady sea breeze", "Clear and humid", "A brief tropical shower", "Coastal haze", "Cloudy and warm"],
        Spring: ["Hot and bright", "Humid with scattered showers", "Strong sea wind", "A warm thunderstorm", "Morning coastal mist"],
        Summer: ["Hot and intensely humid", "Heavy tropical rain", "A powerful coastal thunderstorm", "Strong squalls", "Bright between sudden showers"],
        Autumn: ["Warm and humid", "Persistent coastal rain", "A passing squall", "Cloudy with sea wind", "Clear after heavy rain"]
      }
    },
    warm_frontier: {
      temperatures: { Winter: [8, 20], Spring: [15, 28], Summer: [24, 37], Autumn: [14, 28] },
      conditions: {
        Winter: ["Cool and dry", "Overcast with light rain", "Clear with a strong wind", "Morning ground fog", "A brief cold shower"],
        Spring: ["Warm and clear", "Windy with scattered clouds", "A sudden shower", "Dry and dusty", "A passing thunderstorm"],
        Summer: ["Hot and clear", "Humid and still", "A severe afternoon thunderstorm", "Hot with strong wind", "Heavy rain"],
        Autumn: ["Warm and dry", "Cloudy with rain", "Strong frontier wind", "Clear and mild", "Morning mist"]
      }
    },
    tropical_forest: {
      temperatures: { Winter: [18, 27], Spring: [21, 30], Summer: [25, 34], Autumn: [22, 31] },
      conditions: {
        Winter: ["Warm beneath a misty canopy", "Light forest rain", "Humid and cloudy", "Clear with ground fog", "A brief shower"],
        Spring: ["Warm and humid", "Frequent forest showers", "Dense mist", "A strong thunderstorm", "Bright through broken clouds"],
        Summer: ["Hot and saturated with humidity", "Torrential rain", "A violent forest thunderstorm", "Heavy mist after rain", "Bright between downpours"],
        Autumn: ["Warm with steady rain", "Humid and overcast", "Low forest fog", "A passing thunderstorm", "Clear and still"]
      }
    }
  };
  const LOCATION_GROUPS = Array.isArray(SETTINGS.LOCATION_GROUPS) ? SETTINGS.LOCATION_GROUPS : [];
  const TRAVEL_NODES = Array.isArray(SETTINGS.TRAVEL_NODES) ? SETTINGS.TRAVEL_NODES : [];
  const STATE_TRAVEL_HUBS = SETTINGS.STATE_TRAVEL_HUBS && typeof SETTINGS.STATE_TRAVEL_HUBS === "object"
    ? SETTINGS.STATE_TRAVEL_HUBS
    : {};
  const CONTINENT_TRAVEL_HUBS = SETTINGS.CONTINENT_TRAVEL_HUBS && typeof SETTINGS.CONTINENT_TRAVEL_HUBS === "object"
    ? SETTINGS.CONTINENT_TRAVEL_HUBS
    : {};
  const CONTINENT_ALIASES = Array.isArray(SETTINGS.CONTINENT_ALIASES) ? SETTINGS.CONTINENT_ALIASES : [];
  const configuredEdges = Array.isArray(SETTINGS.TRAVEL_EDGES) ? SETTINGS.TRAVEL_EDGES : [];
  const legacyTravelDays = SETTINGS.TRAVEL_DAYS && typeof SETTINGS.TRAVEL_DAYS === "object"
    ? SETTINGS.TRAVEL_DAYS
    : {};
  const TRAVEL_EDGES = configuredEdges.length
    ? configuredEdges.map((edge) => ({ ...edge }))
    : Object.entries(legacyTravelDays).map(([pair, days]) => {
        const [leftId, rightId] = pair.split("|");
        return { leftId, rightId, days, mode: "land" };
      });
  const TRAVEL_DAYS = {};
  for (const edge of TRAVEL_EDGES) {
    TRAVEL_DAYS[[edge.leftId, edge.rightId].sort().join("|")] = edge.days;
  }
  const TRAVEL_ENABLED = SETTINGS.ENABLE_TRAVEL === true;

  let text = (typeof inputText === "string") ? inputText : "";

  if (
    !globalThis.state || typeof state !== "object" || Array.isArray(state) ||
    !globalThis.info || typeof info !== "object" || Array.isArray(info) ||
    !Array.isArray(globalThis.history) ||
    !Array.isArray(globalThis.storyCards)
  ) {
    if (typeof log === "function") {
      log("AI Dungeon World Calendar: required AI Dungeon globals are unavailable.");
    }
    return text || ZERO_WIDTH_SPACE;
  }

  const isLeapYear = (year) => (
    (year % 4 === 0) && ((year % 100 !== 0) || (year % 400 === 0))
  );

  const daysInMonth = (year, month) => {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
  };

  const isValidDate = (date) => (
    date && Number.isInteger(date.year) && date.year >= 1 &&
    Number.isInteger(date.month) && date.month >= 1 && date.month <= 12 &&
    Number.isInteger(date.day) && date.day >= 1 &&
    date.day <= daysInMonth(date.year, date.month)
  );

  const daysBeforeYear = (year) => {
    const y = year - 1;
    return (365 * y) + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  };

  const dateToOrdinal = (date) => {
    if (!isValidDate(date)) throw new Error("Invalid calendar date.");
    let ordinal = daysBeforeYear(date.year);
    for (let month = 1; month < date.month; month++) {
      ordinal += daysInMonth(date.year, month);
    }
    return ordinal + date.day - 1;
  };

  const ordinalToDate = (ordinal) => {
    ordinal = Math.max(0, Math.floor(Number(ordinal) || 0));
    let low = 1;
    let high = Math.max(2, Math.floor(ordinal / 365) + 2);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (daysBeforeYear(middle) <= ordinal) low = middle;
      else high = middle - 1;
    }
    const year = low;
    let remaining = ordinal - daysBeforeYear(year);
    let month = 1;
    while (remaining >= daysInMonth(year, month)) {
      remaining -= daysInMonth(year, month);
      month++;
    }
    return { year, month, day: remaining + 1 };
  };

  const formatDate = (dateOrOrdinal) => {
    const date = (typeof dateOrOrdinal === "number")
      ? ordinalToDate(dateOrOrdinal)
      : dateOrOrdinal;
    return `${date.day} ${MONTHS[date.month - 1]} ${date.year} ${SETTINGS.ERA || "AD"}`;
  };

  const seasonForOrdinal = (ordinal) => {
    const month = ordinalToDate(ordinal).month;
    if (month === 12 || month <= 2) return "Winter";
    if (month <= 5) return "Spring";
    if (month <= 8) return "Summer";
    return "Autumn";
  };

  const startDate = isValidDate(SETTINGS.START_DATE)
    ? SETTINGS.START_DATE
    : { year: 2000, month: 1, day: 1 };
  const startOrdinal = dateToOrdinal(startDate);

  const clock = state.WorldCalendar = state.WorldCalendar || {};
  clock.version = 9;
  if (!Number.isInteger(clock.absoluteDay) || clock.absoluteDay < 0) {
    clock.absoluteDay = startOrdinal;
  }
  if (!Number.isInteger(clock.nextTransactionId) || clock.nextTransactionId < 1) {
    clock.nextTransactionId = 1;
  }
  if (!Number.isInteger(clock.inputTurnSerial) || clock.inputTurnSerial < 0) {
    clock.inputTurnSerial = 0;
  }
  if (hook === "input") clock.inputTurnSerial++;
  if (!Array.isArray(clock.firedEvents)) clock.firedEvents = [];
  if (!Array.isArray(clock.endedEvents)) clock.endedEvents = [];
  if (!Array.isArray(clock.eventLog)) clock.eventLog = [];
  if (!Array.isArray(clock.journal)) clock.journal = [];
  if (!Array.isArray(clock.customEvents)) clock.customEvents = [];
  if (!Array.isArray(clock.customEventIds)) clock.customEventIds = [];
  if (
    !clock.weatherOverride || typeof clock.weatherOverride !== "object" || Array.isArray(clock.weatherOverride) ||
    !Number.isInteger(clock.weatherOverride.absoluteDay) ||
    typeof clock.weatherOverride.locationName !== "string" ||
    typeof clock.weatherOverride.locationState !== "string" ||
    typeof clock.weatherOverride.condition !== "string" ||
    !Number.isInteger(clock.weatherOverride.temperatureC)
  ) {
    clock.weatherOverride = null;
  }
  if (!clock.pending || typeof clock.pending !== "object" || Array.isArray(clock.pending)) {
    clock.pending = null;
  }
  const defaultAutoSkipLimit = Number.isInteger(SETTINGS.AUTO_SKIP_LIMIT_DAYS)
    ? Math.max(0, SETTINGS.AUTO_SKIP_LIMIT_DAYS)
    : 7;
  if (!Number.isInteger(clock.autoSkipLimitDays) || clock.autoSkipLimitDays < 0) {
    clock.autoSkipLimitDays = defaultAutoSkipLimit;
  }
  if (!clock.active || typeof clock.active !== "object" || Array.isArray(clock.active)) {
    clock.active = null;
  }
  if (
    !clock.activeRoute || typeof clock.activeRoute !== "object" || Array.isArray(clock.activeRoute) ||
    !Array.isArray(clock.activeRoute.legs) || !Number.isInteger(clock.activeRoute.nextLegIndex) ||
    clock.activeRoute.nextLegIndex < 0 || clock.activeRoute.nextLegIndex >= clock.activeRoute.legs.length
  ) {
    clock.activeRoute = null;
  } else {
    const validRoute = clock.activeRoute.legs.every((leg) => (
      leg && typeof leg === "object" &&
      typeof leg.toNodeId === "string" && TRAVEL_NODES.some((node) => node.id === leg.toNodeId) &&
      Number.isInteger(leg.travelDays) && leg.travelDays > 0
    ));
    if (!validRoute) clock.activeRoute = null;
  }
  if (clock.active && clock.active.kind === "skip" && !Array.isArray(clock.active.transitions)) {
    clock.active.transitions = Array.isArray(clock.active.events) ? clock.active.events : [];
  }

  const safeActionCount = () => (
    Number.isInteger(info.actionCount) ? Math.max(0, info.actionCount) : history.length
  );

  const makeMarker = (id) => {
    const digits = Math.max(1, id).toString(3);
    const encoded = [...digits].map((digit) => (
      digit === "0" ? "\u200B" : digit === "1" ? "\u200C" : "\u200D"
    )).join("");
    return `\u200B\u200D${encoded}\u200C\u200B`;
  };

  const historyContains = (marker) => history.some((action) => (
    typeof (action && (action.text ?? action.rawText)) === "string" &&
    (action.text ?? action.rawText).includes(marker)
  ));

  const hasMeaningfulActionAfterMarker = (marker) => {
    let markerIndex = -1;
    for (let index = history.length - 1; index >= 0; index--) {
      const actionText = history[index] && (history[index].text ?? history[index].rawText);
      if (typeof actionText === "string" && actionText.includes(marker)) {
        markerIndex = index;
        break;
      }
    }
    if (markerIndex < 0) return true;
    return history.slice(markerIndex + 1).some((action) => {
      const actionText = String(action && (action.text ?? action.rawText) || "")
        .replace(/[\u200B-\u200D]+/g, "")
        .trim();
      return actionText !== "";
    });
  };

  const containsPhrase = (source, phrase) => {
    const haystack = String(source || "").toLowerCase();
    const needle = String(phrase || "").toLowerCase();
    if (!needle) return false;
    let index = haystack.indexOf(needle);
    while (index >= 0) {
      const left = index === 0 ? "" : haystack[index - 1];
      const rightIndex = index + needle.length;
      const right = rightIndex >= haystack.length ? "" : haystack[rightIndex];
      if (!/[a-z0-9]/i.test(left) && !/[a-z0-9]/i.test(right)) return true;
      index = haystack.indexOf(needle, index + 1);
    }
    return false;
  };

  const locationId = (name, stateName) => `${stateName}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const resolveLocation = (source, detectedFrom = "text") => {
    const rawSource = String(source || "").trim();
    const canKeepCustomName = ["manual command", "calendar card"].includes(detectedFrom) &&
      rawSource.length >= 3 && rawSource.length <= 100;
    const candidates = LOCATION_GROUPS.flatMap((group) => group.locations.map((name) => ({
      name,
      state: group.state,
      continent: group.continent
    }))).sort((a, b) => b.name.length - a.name.length);

    for (const candidate of candidates) {
      if (containsPhrase(source, candidate.name)) {
        return {
          id: locationId(candidate.name, candidate.state),
          ...candidate,
          status: "stationary",
          detectedFrom
        };
      }
    }

    for (const group of LOCATION_GROUPS) {
      const stateAliases = [group.state, ...(group.aliases || [])].sort((a, b) => b.length - a.length);
      if (stateAliases.some((alias) => containsPhrase(source, alias))) {
        const name = canKeepCustomName ? rawSource : group.state;
        return {
          id: locationId(name, group.state),
          name,
          state: group.state,
          continent: group.continent,
          status: "stationary",
          detectedFrom
        };
      }
    }

    for (const continent of CONTINENT_ALIASES) {
      if ((continent.aliases || []).some((alias) => containsPhrase(source, alias))) {
        const name = canKeepCustomName ? rawSource : `Somewhere in ${continent.name}`;
        return {
          id: locationId(name, "Unknown"),
          name,
          state: "Unknown",
          continent: continent.name,
          status: "stationary",
          detectedFrom
        };
      }
    }
    return null;
  };

  const unknownLocation = () => ({
    id: "unknown",
    name: "Unknown Location",
    state: "Unknown",
    continent: "Unknown",
    status: "stationary",
    detectedFrom: "fallback"
  });

  const freeTextLocation = (source, detectedFrom) => {
    const name = String(source || "").trim();
    if (!name) return null;
    return {
      id: locationId(name, "Unknown"),
      name,
      state: "Unknown",
      continent: "Unknown",
      status: "stationary",
      detectedFrom
    };
  };

  const isUsableLocation = (location) => (
    location && typeof location === "object" && !Array.isArray(location) &&
    typeof location.name === "string" && typeof location.state === "string" &&
    typeof location.continent === "string"
  );

  const detectInitialLocation = () => {
    for (const placeholder of (Array.isArray(state.placeholders) ? state.placeholders : [])) {
      const resolved = resolveLocation(placeholder && placeholder.answer, "placeholder");
      if (resolved) return resolved;
    }
    for (const action of history.slice(0, 5)) {
      const resolved = resolveLocation(action && (action.text ?? action.rawText), "opening");
      if (resolved) return resolved;
    }
    if (history.length <= 2 && hook === "output") {
      const resolved = resolveLocation(text, "opening output");
      if (resolved) return resolved;
    }
    return null;
  };

  const configuredStartLocation = () => {
    const start = SETTINGS.START_LOCATION;
    if (!start || typeof start !== "object" || Array.isArray(start)) return null;
    if (
      typeof start.name !== "string" || typeof start.state !== "string" ||
      typeof start.continent !== "string"
    ) return null;
    const node = TRAVEL_NODES.find((candidate) => candidate.id === start.id) ||
      TRAVEL_NODES.find((candidate) => candidate.name === start.name && candidate.state === start.state);
    return node
      ? {
          id: locationId(node.name, node.state),
          name: node.name,
          state: node.state,
          continent: node.continent,
          status: "stationary",
          travelNodeId: node.id,
          detectedFrom: "configured start"
        }
      : {
          id: typeof start.id === "string" ? start.id : locationId(start.name, start.state),
          name: start.name,
          state: start.state,
          continent: start.continent,
          status: "stationary",
          detectedFrom: "configured start"
        };
  };

  if (!isUsableLocation(clock.location)) clock.location = unknownLocation();
  if (clock.location.id === "unknown") {
    clock.location = detectInitialLocation() || configuredStartLocation() || clock.location;
  }

  const locationLabel = () => {
    const location = clock.location;
    if (location.state === "Unknown") {
      return containsPhrase(location.name, location.continent)
        ? location.name
        : `${location.name}, ${location.continent}`;
    }
    const nameIncludesState = location.name.toLowerCase().includes(location.state.toLowerCase());
    return nameIncludesState
      ? `${location.name}, ${location.continent}`
      : `${location.name}, ${location.state}, ${location.continent}`;
  };

  const stableHash = (source) => {
    let hash = 2166136261;
    for (const character of String(source || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const configuredClimate = () => {
    const locationMap = SETTINGS.CLIMATE_BY_LOCATION && typeof SETTINGS.CLIMATE_BY_LOCATION === "object"
      ? SETTINGS.CLIMATE_BY_LOCATION
      : {};
    const regionMap = SETTINGS.CLIMATE_BY_REGION && typeof SETTINGS.CLIMATE_BY_REGION === "object"
      ? SETTINGS.CLIMATE_BY_REGION
      : {};
    const locationMatch = Object.entries(locationMap).find(([name]) => (
      name.toLowerCase() === String(clock.location.name || "").toLowerCase()
    ));
    const regionMatch = Object.entries(regionMap).find(([name]) => (
      name.toLowerCase() === String(clock.location.state || "").toLowerCase()
    ));
    const profileId = String(locationMatch?.[1] || regionMatch?.[1] || "temperate");
    return WEATHER_PROFILES[profileId] ? profileId : "temperate";
  };

  const currentEnvironment = () => {
    const season = seasonForOrdinal(clock.absoluteDay);
    if (SETTINGS.WEATHER_ENABLED === false) {
      return { season, condition: null, temperatureC: null, climate: null };
    }
    const climate = configuredClimate();
    const profile = WEATHER_PROFILES[climate] || WEATHER_PROFILES.temperate;
    const conditions = profile.conditions[season] || profile.conditions.Spring;
    const temperatureRange = profile.temperatures[season] || profile.temperatures.Spring;
    const seed = [
      clock.absoluteDay,
      String(clock.location.name || "").toLowerCase(),
      String(clock.location.state || "").toLowerCase(),
      climate
    ].join("|");
    const condition = conditions[stableHash(`${seed}|condition`) % conditions.length];
    const minimum = temperatureRange[0];
    const maximum = temperatureRange[1];
    const temperatureC = minimum + (stableHash(`${seed}|temperature`) % (maximum - minimum + 1));
    const override = clock.weatherOverride;
    const overrideApplies = override &&
      override.absoluteDay === clock.absoluteDay &&
      override.locationName === String(clock.location.name || "") &&
      override.locationState === String(clock.location.state || "");
    return overrideApplies
      ? {
          season,
          condition: override.condition,
          temperatureC: override.temperatureC,
          climate,
          manual: true
        }
      : { season, condition, temperatureC, climate, manual: false };
  };

  const travelNodeLocation = (node, detectedFrom = "travel") => ({
    id: locationId(node.name, node.state),
    name: node.name,
    state: node.state,
    continent: node.continent,
    status: "stationary",
    travelNodeId: node.id,
    detectedFrom
  });

  const resolveTravelNode = (source) => {
    const candidates = TRAVEL_NODES.flatMap((node) => [node.name, ...(node.aliases || [])]
      .map((alias) => ({ alias, node })))
      .sort((a, b) => b.alias.length - a.alias.length);
    return candidates.find((candidate) => containsPhrase(source, candidate.alias))?.node || null;
  };

  const currentTravelNode = () => (
    TRAVEL_NODES.find((node) => node.id === clock.location.travelNodeId) ||
    TRAVEL_NODES.find((node) => (
      node.name === clock.location.name && node.state === clock.location.state
    )) ||
    resolveTravelNode(clock.location.name)
  );

  const estimatedTravelOrigin = () => {
    const stateHubId = STATE_TRAVEL_HUBS[clock.location.state];
    const continentHubId = CONTINENT_TRAVEL_HUBS[clock.location.continent];
    const hub = TRAVEL_NODES.find((node) => node.id === (stateHubId || continentHubId));
    if (!hub) return null;

    const regionalNodes = stateHubId
      ? TRAVEL_NODES.filter((node) => node.state === clock.location.state)
      : TRAVEL_NODES.filter((node) => node.continent === clock.location.continent);
    const accessValues = regionalNodes
      .map((node) => node.access)
      .filter((days) => Number.isInteger(days) && days >= 0);
    const accessDays = accessValues.length
      ? Math.max(1, Math.round(accessValues.reduce((sum, days) => sum + days, 0) / accessValues.length))
      : 1;
    return { hub, accessDays };
  };

  const travelPairKey = (originId, destinationId) => [originId, destinationId].sort().join("|");
  const getTravelDays = (origin, destination) => {
    if (!origin || !destination || origin.id === destination.id) return 0;
    const days = TRAVEL_DAYS[travelPairKey(origin.id, destination.id)];
    return Number.isInteger(days) && days > 0 ? days : null;
  };

  const getTravelEdge = (origin, destination) => {
    if (!origin || !destination || origin.id === destination.id) return null;
    const key = travelPairKey(origin.id, destination.id);
    return TRAVEL_EDGES.find((edge) => travelPairKey(edge.leftId, edge.rightId) === key) || null;
  };

  const travelNodeById = (id) => TRAVEL_NODES.find((node) => node.id === id) || null;

  const travelGraphEdges = TRAVEL_EDGES.filter((edge) => (
    travelNodeById(edge.leftId) && travelNodeById(edge.rightId) &&
    Number.isInteger(edge.days) && edge.days > 0
  ));

  const findTravelRoute = (origin, destination) => {
    if (!origin || !destination) return null;
    if (origin.id === destination.id) return [origin];

    const distance = new Map(TRAVEL_NODES.map((node) => [node.id, Number.POSITIVE_INFINITY]));
    const previous = new Map();
    const unvisited = new Set(TRAVEL_NODES.map((node) => node.id));
    const stayOnContinent = origin.continent === destination.continent;
    distance.set(origin.id, 0);

    while (unvisited.size) {
      let currentId = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const id of unvisited) {
        const candidateDistance = distance.get(id);
        if (candidateDistance < currentDistance) {
          currentId = id;
          currentDistance = candidateDistance;
        }
      }
      if (currentId == null || !Number.isFinite(currentDistance)) break;
      unvisited.delete(currentId);
      if (currentId === destination.id) break;

      for (const edge of travelGraphEdges) {
        if (stayOnContinent && edge.transition) continue;
        if (
          edge.restrictedState &&
          origin.state !== edge.restrictedState && destination.state !== edge.restrictedState
        ) continue;
        const neighborId = edge.leftId === currentId
          ? edge.rightId
          : edge.rightId === currentId ? edge.leftId : null;
        if (!neighborId || !unvisited.has(neighborId)) continue;
        const nextDistance = currentDistance + edge.days;
        if (nextDistance < distance.get(neighborId)) {
          distance.set(neighborId, nextDistance);
          previous.set(neighborId, currentId);
        }
      }
    }

    if (!previous.has(destination.id)) return null;
    const ids = [destination.id];
    while (ids[0] !== origin.id) {
      const parent = previous.get(ids[0]);
      if (!parent) return null;
      ids.unshift(parent);
    }
    return ids.map(travelNodeById).filter(Boolean);
  };

  const cloneRoute = (route) => route ? {
    ...route,
    stopLabels: Array.isArray(route.stopLabels) ? [...route.stopLabels] : [],
    legs: Array.isArray(route.legs) ? route.legs.map((leg) => ({ ...leg })) : []
  } : null;

  const routeProgressLabel = (route, currentIndex = route?.nextLegIndex || 0) => (
    route.stopLabels.map((label, index) => {
      if (index < currentIndex) return `✓ ${label}`;
      if (index === currentIndex) return `➤ ${label}`;
      return label;
    }).join(" → ")
  );

  const remainingRouteDays = (route, startIndex = route?.nextLegIndex || 0) => (
    route.legs.slice(startIndex).reduce((sum, leg) => sum + leg.travelDays, 0)
  );

  const routeTravelMode = (legs) => {
    const modes = [...new Set(legs.map((leg) => leg.travelMode || "land"))];
    return modes.length === 1 ? modes[0] : modes.join(" + ");
  };

  const buildTravelRoute = (origin, originEstimate, destination, routeId) => {
    const nodePath = findTravelRoute(origin, destination);
    if (!nodePath || !nodePath.length) return null;
    const legs = [];
    const stopLabels = [];

    if (originEstimate) {
      stopLabels.push(locationLabel());
      legs.push({
        fromNodeId: null,
        toNodeId: origin.id,
        originName: clock.location.name,
        originLabel: locationLabel(),
        destinationName: origin.name,
        destinationLabel: `${origin.name}, ${origin.state}`,
        travelDays: originEstimate.accessDays,
        travelMode: "land",
        originWasEstimated: true,
        accessDays: originEstimate.accessDays,
        hubLabel: `${origin.name}, ${origin.state}`,
        networkTravelDays: 0
      });
    }

    for (let index = 0; index < nodePath.length; index++) {
      const node = nodePath[index];
      if (!stopLabels.length || stopLabels[stopLabels.length - 1] !== node.name) {
        stopLabels.push(node.name);
      }
      if (index === 0) continue;
      const from = nodePath[index - 1];
      const travelEdge = getTravelEdge(from, node);
      const travelDays = travelEdge && travelEdge.days;
      if (!travelEdge || !Number.isInteger(travelDays)) return null;
      legs.push({
        fromNodeId: from.id,
        toNodeId: node.id,
        originName: from.name,
        originLabel: `${from.name}, ${from.state}`,
        destinationName: node.name,
        destinationLabel: `${node.name}, ${node.state}`,
        travelDays,
        travelMode: travelEdge.mode || "land",
        originWasEstimated: false,
        accessDays: 0,
        hubLabel: `${from.name}, ${from.state}`,
        networkTravelDays: travelDays
      });
    }

    if (!legs.length) return null;
    return {
      id: routeId,
      originLabel: stopLabels[0],
      finalDestinationId: destination.id,
      finalDestinationLabel: `${destination.name}, ${destination.state}`,
      stopLabels,
      legs,
      nextLegIndex: 0,
      totalTravelDays: legs.reduce((sum, leg) => sum + leg.travelDays, 0),
      status: "planned",
      createdDay: clock.absoluteDay
    };
  };

  const travelRequestForLeg = (route, legIndex) => {
    const leg = route && route.legs && route.legs[legIndex];
    const destination = leg && travelNodeById(leg.toNodeId);
    if (!leg || !destination) return null;
    const beforeDay = clock.absoluteDay;
    const afterDay = beforeDay + leg.travelDays;
    return {
      kind: "travel",
      beforeDay,
      beforeLocationId: clock.location.id,
      afterDay,
      afterLocation: travelNodeLocation(destination, "travel command"),
      originName: leg.originName,
      destinationName: leg.destinationName,
      originLabel: leg.originLabel,
      destinationLabel: leg.destinationLabel,
      travelDays: leg.travelDays,
      travelMode: leg.travelMode || "land",
      originWasEstimated: leg.originWasEstimated,
      accessDays: leg.accessDays,
      hubLabel: leg.hubLabel,
      networkTravelDays: leg.networkTravelDays,
      previewTransitions: previewCalendarTransitions(beforeDay, afterDay, destination.state),
      routePlan: cloneRoute(route),
      legIndex,
      stageNumber: legIndex + 1,
      stageCount: route.legs.length,
      remainingStageCount: route.legs.length - legIndex,
      routeLabel: routeProgressLabel(route, legIndex),
      finalDestinationLabel: route.finalDestinationLabel,
      totalTravelDays: route.totalTravelDays,
      remainingTravelDays: remainingRouteDays(route, legIndex),
      fullRoute: false
    };
  };

  const travelRequestForRemainingRoute = (route, startIndex) => {
    const legs = route?.legs?.slice(startIndex) || [];
    const firstLeg = legs[0];
    const lastLeg = legs[legs.length - 1];
    const destination = lastLeg && travelNodeById(lastLeg.toNodeId);
    if (!firstLeg || !destination) return null;

    let cursor = clock.absoluteDay;
    const previews = [];
    for (const leg of legs) {
      const stageDestination = travelNodeById(leg.toNodeId);
      if (!stageDestination) return null;
      const stageEnd = cursor + leg.travelDays;
      previews.push(...previewCalendarTransitions(cursor, stageEnd, stageDestination.state));
      cursor = stageEnd;
    }

    // The whole-range preview guarantees that scheduled events spanning two stages
    // retain both their start and end notices. Per-stage previews add local festivals.
    previews.push(...previewCalendarTransitions(clock.absoluteDay, cursor, "__NWT_ROUTE__"));
    const seenTransitions = new Set();
    const previewTransitions = previews
      .filter((transition) => {
        const key = `${transition.id}|${transition.kind}|${transition.ordinal}`;
        if (seenTransitions.has(key)) return false;
        seenTransitions.add(key);
        return true;
      })
      .sort((left, right) => left.ordinal - right.ordinal);

    return {
      kind: "travel",
      beforeDay: clock.absoluteDay,
      beforeLocationId: clock.location.id,
      afterDay: cursor,
      afterLocation: travelNodeLocation(destination, "travel command"),
      originName: firstLeg.originName,
      destinationName: lastLeg.destinationName,
      originLabel: firstLeg.originLabel,
      destinationLabel: lastLeg.destinationLabel,
      travelDays: remainingRouteDays(route, startIndex),
      travelMode: routeTravelMode(legs),
      originWasEstimated: firstLeg.originWasEstimated,
      accessDays: firstLeg.accessDays,
      hubLabel: firstLeg.hubLabel,
      networkTravelDays: legs.reduce((sum, leg) => sum + (leg.networkTravelDays || 0), 0),
      previewTransitions,
      routePlan: cloneRoute(route),
      legsToTravel: legs.map((leg) => ({ ...leg })),
      legIndex: startIndex,
      stageNumber: startIndex + 1,
      stageCount: route.legs.length,
      remainingStageCount: legs.length,
      routeLabel: routeProgressLabel(route, startIndex),
      finalDestinationLabel: route.finalDestinationLabel,
      totalTravelDays: route.totalTravelDays,
      remainingTravelDays: remainingRouteDays(route, startIndex),
      fullRoute: true
    };
  };

  const queueTravelConfirmation = (request, id, marker, isContinuation = false) => {
    clock.pending = request;
    clock.active = {
      id,
      marker,
      kind: "confirmation",
      confirmationKind: "travel",
      isContinuation,
      originLabel: request.originLabel,
      destinationLabel: request.destinationLabel,
      travelDays: request.travelDays,
      travelMode: request.travelMode,
      originWasEstimated: request.originWasEstimated,
      accessDays: request.accessDays,
      hubLabel: request.hubLabel,
      networkTravelDays: request.networkTravelDays,
      beforeLabel: formatDate(request.beforeDay),
      afterLabel: formatDate(request.afterDay),
      transitions: request.previewTransitions,
      stageNumber: request.stageNumber,
      stageCount: request.stageCount,
      remainingStageCount: request.remainingStageCount,
      routeLabel: request.routeLabel,
      finalDestinationLabel: request.finalDestinationLabel,
      totalTravelDays: request.totalTravelDays,
      remainingTravelDays: request.remainingTravelDays,
      fullRoute: request.fullRoute,
      completed: false
    };
  };

  const detectedTravelNode = currentTravelNode();
  if (detectedTravelNode && clock.location.travelNodeId !== detectedTravelNode.id) {
    clock.location = travelNodeLocation(detectedTravelNode, clock.location.detectedFrom || "initial detection");
  }

  const normalizeEvent = (event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    if (typeof event.id !== "string" || event.id.trim() === "") return null;
    if (!isValidDate(event.date)) return null;
    const normalized = { ...event, id: event.id.trim(), ordinal: dateToOrdinal(event.date) };
    if (isValidDate(event.endDate)) normalized.endOrdinal = dateToOrdinal(event.endDate);
    return normalized;
  };

  const allEvents = () => {
    const seen = new Set();
    const configured = Array.isArray(SETTINGS.SCHEDULED_EVENTS) ? SETTINGS.SCHEDULED_EVENTS : [];
    const custom = clock.customEvents.filter((event) => event.customKind === "once");
    return [...configured, ...custom]
      .map(normalizeEvent)
      .filter((event) => {
        if (!event || seen.has(event.id)) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => a.ordinal - b.ordinal);
  };

  const findCardIndex = (keys, marker = null) => storyCards.findIndex((card) => (
    card && typeof card === "object" && typeof card.keys === "string" &&
    (card.keys === keys || (marker && card.keys.includes(marker)))
  ));

  const upsertCard = ({ keys, entry, type, title, notes, marker = null }) => {
    let index = findCardIndex(keys, marker);
    let created = false;

    if (index < 0 && typeof addStoryCard === "function") {
      try {
        // AI Dungeon's practical API accepts title and notes as the fourth and
        // fifth arguments. Inner Self uses the same extended signature.
        const result = addStoryCard(keys, entry, type, title, notes);
        if (result && typeof result === "object") index = storyCards.indexOf(result);
        else if (Number.isInteger(result)) index = result;
        if (index < 0 || !storyCards[index] || storyCards[index].keys !== keys) {
          index = findCardIndex(keys, marker);
        }
        created = index >= 0;
      } catch (error) {
        if (typeof log === "function") {
          log(`AI Dungeon World Calendar: could not create Story Card '${title}': ${error.message}`);
        }
      }
    }

    if (index < 0 || !storyCards[index]) {
      if (typeof log === "function" && clock.lastCardErrorAction !== safeActionCount()) {
        clock.lastCardErrorAction = safeActionCount();
        log(`AI Dungeon World Calendar: Story Card '${title}' is missing and could not be created.`);
      }
      return { index: -1, created: false };
    }

    if (typeof updateStoryCard === "function") {
      try {
        updateStoryCard(index, keys, entry, type);
      } catch (error) {
        storyCards[index].keys = keys;
        storyCards[index].entry = entry;
        storyCards[index].type = type;
      }
    } else {
      storyCards[index].keys = keys;
      storyCards[index].entry = entry;
      storyCards[index].type = type;
    }

    const card = storyCards[index];
    card.title = title;
    card.description = notes;
    return { index, created };
  };

  const readCalendarEnabled = () => {
    const index = findCardIndex(CALENDAR_KEY, CALENDAR_MARKER);
    if (index < 0 || !storyCards[index]) return true;
    const description = String(storyCards[index].description || "");
    const match = description.match(/^\s*Enabled\s*:\s*(true|false)\s*$/mi);
    return !match || match[1].toLowerCase() !== "false";
  };

  const readAutoSkipLimit = () => {
    const index = findCardIndex(CALENDAR_KEY, CALENDAR_MARKER);
    if (index < 0 || !storyCards[index]) return clock.autoSkipLimitDays;
    const description = String(storyCards[index].description || "");
    const match = description.match(/^\s*Auto-Skip Limit\s*:\s*(\d+)\s*(?:days?)?\s*$/mi);
    if (!match) return clock.autoSkipLimitDays;
    const value = Number.parseInt(match[1], 10);
    const maxDays = Math.max(1, (Number.isInteger(SETTINGS.MAX_SKIP_YEARS) ? SETTINGS.MAX_SKIP_YEARS : 1000) * 366);
    if (!Number.isSafeInteger(value) || value < 0 || value > maxDays) return clock.autoSkipLimitDays;
    clock.autoSkipLimitDays = value;
    return value;
  };

  const readCompleteFullRouteImmediately = () => {
    const index = findCardIndex(CALENDAR_KEY, CALENDAR_MARKER);
    if (index < 0 || !storyCards[index]) return false;
    const description = String(storyCards[index].description || "");
    const match = description.match(/^\s*Complete Full Route Immediately\s*:\s*(true|false)\s*$/mi);
    return Boolean(match && match[1].toLowerCase() === "true");
  };

  const deactivateCalendarCards = () => {
    for (let index = 0; index < storyCards.length; index++) {
      const card = storyCards[index];
      if (!card || typeof card !== "object" || typeof card.keys !== "string") continue;
      if (!card.keys.includes(CALENDAR_MARKER) && !/%WC_EVENT_[A-Za-z0-9_-]+%/.test(card.keys)) continue;
      const inactiveKeys = card.keys
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key && key.toLowerCase() !== "you")
        .join(",");
      if (inactiveKeys === card.keys) continue;
      if (typeof updateStoryCard === "function") {
        try {
          updateStoryCard(index, inactiveKeys, card.entry, card.type);
        } catch {}
      }
      card.keys = inactiveKeys;
    }
  };

  const removeCardByKeys = (keys, marker = null) => {
    const index = findCardIndex(keys, marker);
    if (index < 0) return false;
    if (typeof removeStoryCard === "function") {
      try {
        removeStoryCard(index);
        return true;
      } catch {}
    }
    storyCards.splice(index, 1);
    return true;
  };

  const eventCardMarker = (event) => (
    `%WC_EVENT_${event.id.replace(/[^a-z0-9_-]+/gi, "_")}%`
  );

  const eventCardKeys = (event, status = "concluded") => {
    const reserved = eventCardMarker(event);
    const configured = event.card && typeof event.card.keys === "string"
      ? event.card.keys.split(",")
        .map((key) => key.trim())
        .filter((key) => key && key.toLowerCase() !== "you")
        .join(",")
      : "";
    const base = configured ? `${reserved},${configured}` : `${reserved},${event.title || event.id}`;
    const transitionTurn = Boolean(clock.active && ["skip", "travel"].includes(clock.active.kind));
    if (status === "active" && transitionTurn) return reserved;
    return status === "active" ? `${base},you ` : base;
  };

  const normalizeFestival = (festival) => {
    if (!festival || typeof festival !== "object" || Array.isArray(festival)) return null;
    if (typeof festival.id !== "string" || festival.id.trim() === "") return null;
    if (!Number.isInteger(festival.month) || festival.month < 1 || festival.month > 12) return null;
    if (!Number.isInteger(festival.day) || festival.day < 1 || festival.day > 31) return null;
    return {
      ...festival,
      id: festival.id.trim(),
      durationDays: Number.isInteger(festival.durationDays) ? Math.max(1, festival.durationDays) : 1,
      regions: Array.isArray(festival.regions) && festival.regions.length ? festival.regions : ["*"]
    };
  };

  const allFestivals = () => {
    const seen = new Set();
    const configured = Array.isArray(SETTINGS.RECURRING_FESTIVALS) ? SETTINGS.RECURRING_FESTIVALS : [];
    const custom = clock.customEvents.filter((event) => event.customKind === "yearly");
    return [...configured, ...custom]
      .map(normalizeFestival)
      .filter((festival) => {
        if (!festival || seen.has(festival.id)) return false;
        seen.add(festival.id);
        return true;
      });
  };

  const festivalAppliesHere = (festival) => (
    festival.regions.includes("*") || festival.regions.includes(clock.location.state)
  );

  const festivalOccurrence = (festival, year) => {
    const date = { year, month: festival.month, day: festival.day };
    if (!isValidDate(date)) return null;
    const startOrdinal = dateToOrdinal(date);
    return {
      year,
      startOrdinal,
      endOrdinal: startOrdinal + festival.durationDays - 1,
      endBoundary: startOrdinal + festival.durationDays
    };
  };

  const currentFestivals = () => {
    const currentYear = ordinalToDate(clock.absoluteDay).year;
    return allFestivals().filter(festivalAppliesHere).map((festival) => ({
      festival,
      occurrence: festivalOccurrence(festival, currentYear)
    })).filter(({ occurrence }) => (
      occurrence && occurrence.startOrdinal <= clock.absoluteDay && clock.absoluteDay <= occurrence.endOrdinal
    )).map(({ festival, occurrence }) => ({
      ...festival,
      ordinal: occurrence.startOrdinal,
      endOrdinal: occurrence.endOrdinal,
      region: festival.regions.includes("*") ? "Worldwide" : festival.regions.join(" and "),
      recurring: true
    }));
  };

  const currentEvents = () => {
    const fired = new Set(clock.firedEvents);
    const ended = new Set(clock.endedEvents);
    const scheduled = allEvents().filter((event) => fired.has(event.id) && !ended.has(event.id) && (
      event.ongoing === true || !Number.isInteger(event.endOrdinal) || clock.absoluteDay <= event.endOrdinal
    ));
    return [...scheduled, ...currentFestivals()];
  };

  const snapshotCard = (keys, marker = null) => {
    const index = findCardIndex(keys, marker);
    if (index < 0) return null;
    const card = storyCards[index];
    return {
      keys: card.keys,
      entry: card.entry,
      type: card.type,
      title: card.title,
      description: card.description
    };
  };

  const setEventCardStatus = (event, status, details = {}) => {
    if (!event.card || typeof event.card !== "object") return null;
    const marker = eventCardMarker(event);
    const keys = eventCardKeys(event, status);
    const before = snapshotCard(keys, marker);
    const region = details.region || (
      Array.isArray(event.regions) && !event.regions.includes("*") ? event.regions.join(" and ") : "Worldwide"
    );
    const statusLines = status === "active"
      ? [
          "Status: Active.",
          details.startOrdinal != null ? `Current occurrence began: ${formatDate(details.startOrdinal)}.` : "",
          details.endOrdinal != null ? `Scheduled conclusion: ${formatDate(details.endOrdinal)}.` : ""
        ]
      : status === "upcoming"
      ? [
          "Status: Upcoming.",
          details.startOrdinal != null ? `Scheduled beginning: ${formatDate(details.startOrdinal)}.` : ""
        ]
      : [
          "Status: Concluded.",
          details.endOrdinal != null ? `Concluded on: ${formatDate(details.endOrdinal)}.` : "",
          details.nextOrdinal != null ? `Next occurrence: ${formatDate(details.nextOrdinal)}.` : ""
        ];
    const baseEntry = String(event.card.entry || `${event.title || event.id} is a dated world event.`);
    const entry = [...statusLines.filter(Boolean), `Region: ${region}.`, "", baseEntry].join("\n");
    const result = upsertCard({
      keys,
      entry,
      type: "events",
      title: String(event.card.title || event.title || event.id),
      notes: String(event.card.notes || "Managed automatically by AI Dungeon World Calendar."),
      marker
    });
    if (result.index < 0) return null;
    return { keys, marker, created: result.created, before };
  };

  const restoreCardChange = (change) => {
    if (!change) return;
    const markerSource = String(change.marker || change.keys || change.before?.keys || "");
    const marker = change.marker || markerSource.match(/%WC_EVENT_[^%]+%/)?.[0] || null;
    if (change.created && !change.before) {
      removeCardByKeys(change.keys, marker);
      return;
    }
    if (change.before) {
      upsertCard({
        keys: change.before.keys,
        entry: change.before.entry,
        type: change.before.type,
        title: change.before.title,
        notes: change.before.description,
        marker
      });
    }
  };

  const eventDisplayName = (eventOrLog) => {
    const title = String(eventOrLog.title || eventOrLog.id || "Unnamed event");
    const region = eventOrLog.region;
    return region && region !== "Worldwide" ? `${title} (${region})` : title;
  };

  const eventLogLabel = (event) => {
    const name = eventDisplayName(event);
    if (event.kind === "started") return `${name} began.`;
    if (event.kind === "ended") return `${name} ended.`;
    if (event.kind === "occurred") return `${name} was celebrated and concluded.`;
    if (event.kind === "recurred") return `${name} occurred ${event.count || "multiple"} times.`;
    return name;
  };

  const calendarEntry = () => {
    const active = currentEvents();
    const environment = currentEnvironment();
    const recentLimit = Number.isInteger(SETTINGS.MAX_RECENT_EVENTS)
      ? Math.max(0, SETTINGS.MAX_RECENT_EVENTS)
      : 5;
    const recent = recentLimit > 0 ? clock.eventLog.slice(-recentLimit).reverse() : [];
    const route = clock.activeRoute;
    const nextLeg = route && route.legs[route.nextLegIndex];
    return [
      "=== EDITABLE STATE ===",
      `Date: ${formatDate(clock.absoluteDay)}`,
      `Location: ${clock.location.name}`,
      "=== END EDITABLE STATE ===",
      `Region: ${clock.location.state}, ${clock.location.continent}.`,
      `Season: ${environment.season}.`,
      ...(environment.condition ? [
        `Weather: ${environment.condition}.`,
        `Temperature: ${environment.temperatureC}°C.`
      ] : []),
      ...(route && nextLeg ? [
        `Journey paused. Final destination: ${route.finalDestinationLabel}.`,
        `Next stage: ${nextLeg.destinationLabel} (${nextLeg.travelDays} days).`
      ] : []),
      "",
      "Current events:",
      active.length ? active.map((event) => `- ${eventDisplayName(event)}`).join("\n") : "- None.",
      "",
      "Recent dated events:",
      recent.length
        ? recent.map((event) => `- ${formatDate(event.ordinal)} — ${eventLogLabel(event)}`).join("\n")
        : "- None."
    ].join("\n");
  };

  const calendarNotes = (
    enabled = true,
    autoSkipLimit = readAutoSkipLimit(),
    completeFullRouteImmediately = readCompleteFullRouteImmediately()
  ) => [
    "=== WORLD CALENDAR SETTINGS ===",
    `Enabled: ${enabled ? "true" : "false"}`,
    `Auto-Skip Limit: ${autoSkipLimit} days`,
    `Complete Full Route Immediately: ${completeFullRouteImmediately ? "true" : "false"}`,
    "=== END SETTINGS ===",
    "Set Enabled to false to disable World Calendar, all WC commands, time progression, travel, event processing, and calendar context.",
    "Set Enabled to true to turn World Calendar back on. Other scripts continue to work while WC is disabled.",
    "Set Auto-Skip Limit to the largest number of days that should skip immediately without confirmation. The default is 7. :skip night always runs immediately.",
    "Set Complete Full Route Immediately to true to finish every remaining travel stage after one confirmation. The default is false, so journeys pause at intermediate stops.",
    "",
    "Enter all World Calendar commands as Story actions, not Do actions.",
    "Do may rewrite commands and cause valid commands to fail.",
    "",
    "IMPORTANT: Don't forget to use :skip night whenever your character goes to sleep.",
    "AI Dungeon World Calendar v1.2.2",
    clock.lastCardEditError ? `Last edit error: ${clock.lastCardEditError}` : "Editable state is valid.",
    "Edit the Date or Location lines at the top of the Entry.",
    "Manual edits are administrative corrections and do not create a narrated time skip or journey.",
    "Season and local weather are derived automatically from the current Date and Location.",
    "When a journey is paused, use :travel continue to resume it or :travel end to remain at the current stop.",
    "Add personal yearly or one-time events in the separate Custom Events card.",
    "",
    "Available commands:",
    ":skip <duration>",
    "",
    "Examples:",
    ":skip 10 days",
    ":skip 2 weeks",
    ":skip 3 months",
    ":skip 1 year",
    ":skip 1 year 2 months 3 days",
    ":skip night — advance to the next morning",
    ":travel Rivergate",
    ":travel continue — preview and resume the next stage of a paused journey",
    ":travel end — abandon the saved route and remain at the current stop",
    ":yes — confirm a pending long skip or journey",
    ":no — cancel a pending long skip or journey",
    ":undo — undo the latest completed skip or journey within 3 actions",
    ":weather <description> — override today's local weather",
    ":weather <description> | <°C> — override today's weather and temperature",
    ":temperature <°C> — change only today's local temperature",
    ":weather auto — restore automatic weather for this date and place",
    "",
    ":date — show the current date",
    ":where — show the current location",
    ":travel <city> — travel to a configured destination from any location with a known region or continent",
    ":help — show command help",
    "",
    "Advanced correction command:",
    ":setlocation Hearthport",
    "",
    `Starting date: ${formatDate(startOrdinal)}.`,
    "Normal story actions do not advance the calendar."
  ].join("\n");

  const updateCalendarCard = () => {
    const enabled = readCalendarEnabled();
    const result = upsertCard({
      keys: CALENDAR_KEY,
      entry: calendarEntry(),
      type: "class",
      title: String(SETTINGS.CALENDAR_CARD_TITLE || "World Calendar"),
      notes: calendarNotes(enabled),
      marker: CALENDAR_MARKER
    });
    if (result.index >= 0) {
      clock.lastRenderedDateText = formatDate(clock.absoluteDay);
      clock.lastRenderedLocationText = clock.location.name;
    }
    return result;
  };

  const parseEditableDate = (source) => {
    const value = String(source || "").trim();
    const named = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d+)(?:\s+[A-Za-z][A-Za-z0-9_-]*)?$/i);
    if (named) {
      const month = MONTHS.findIndex((name) => name.toLowerCase() === named[2].toLowerCase()) + 1;
      const date = { day: Number(named[1]), month, year: Number(named[3]) };
      return isValidDate(date) ? date : null;
    }
    const numeric = value.match(/^(\d+)-(\d{1,2})-(\d{1,2})$/);
    if (numeric) {
      const date = { year: Number(numeric[1]), month: Number(numeric[2]), day: Number(numeric[3]) };
      return isValidDate(date) ? date : null;
    }
    return null;
  };

  const customEventsTemplate = () => [
    "Custom Events",
    "=== CUSTOM EVENTS ===",
    "# yearly | 12 May | Mira's Birthday | 1 day",
    "# once | 18 June 4813 | Oakrest Celebration | 3 days",
    "=== END CUSTOM EVENTS ==="
  ].join("\n");

  const customEventsNotes = () => [
    "AI Dungeon World Calendar Custom Events v1",
    "Add one event per line inside the editable block.",
    "Formats:",
    "yearly | DAY MONTH | TITLE | N days",
    "once | DAY MONTH YEAR | TITLE | N days",
    "The duration is optional and defaults to 1 day.",
    "Lines beginning with # are examples and are ignored.",
    "",
    clock.customEventErrors?.length
      ? `Errors:\n${clock.customEventErrors.map((error) => `- ${error}`).join("\n")}`
      : "All custom event lines are valid."
  ].join("\n");

  const ensureCustomEventsCard = () => {
    const index = findCardIndex(CUSTOM_EVENTS_KEY, CUSTOM_EVENTS_MARKER);
    const existingEntry = index >= 0 && typeof storyCards[index].entry === "string"
      ? storyCards[index].entry
      : customEventsTemplate();
    return upsertCard({
      keys: CUSTOM_EVENTS_KEY,
      entry: existingEntry,
      type: "events",
      title: "Custom Events",
      notes: customEventsNotes(),
      marker: CUSTOM_EVENTS_MARKER
    });
  };

  const customEventId = (source) => {
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `custom_${(hash >>> 0).toString(16)}`;
  };

  const parseCustomMonthDay = (source) => {
    const match = String(source || "").trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/i);
    if (!match) return null;
    const month = MONTHS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) + 1;
    const date = { year: 2000, month, day: Number(match[1]) };
    return isValidDate(date) ? { month, day: date.day } : null;
  };

  const parseCustomEventLine = (source, lineNumber) => {
    const parts = source.split("|").map((part) => part.trim());
    if (parts.length < 3) {
      return { error: `Line ${lineNumber}: expected TYPE | DATE | TITLE | DURATION.` };
    }
    const kindText = parts[0].toLowerCase();
    const customKind = ["yearly", "annual"].includes(kindText)
      ? "yearly"
      : ["once", "one-time", "onetime"].includes(kindText) ? "once" : null;
    if (!customKind) {
      return { error: `Line ${lineNumber}: use 'yearly' or 'once'.` };
    }
    const title = parts[2];
    if (!title) return { error: `Line ${lineNumber}: the event title is empty.` };

    const durationText = parts[3] || "1 day";
    const durationMatch = durationText.match(/^(\d+)\s*days?$/i);
    const durationDays = durationMatch ? Number(durationMatch[1]) : 0;
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      return { error: `Line ${lineNumber}: duration must be from 1 to 365 days.` };
    }

    const prompt = parts.slice(4).join(" | ") || `The personal event '${title}' takes place.`;
    const normalizedSource = [customKind, parts[1], title, `${durationDays} days`, prompt].join("|");
    const id = customEventId(normalizedSource);
    const card = { title, keys: title, entry: prompt, type: "events" };

    if (customKind === "yearly") {
      const date = parseCustomMonthDay(parts[1]);
      if (!date) return { error: `Line ${lineNumber}: yearly dates use '12 May'.` };
      return {
        event: {
          id,
          customKind,
          title,
          month: date.month,
          day: date.day,
          durationDays,
          regions: ["*"],
          prompt,
          card
        }
      };
    }

    const date = parseEditableDate(parts[1]);
    if (!date) return { error: `Line ${lineNumber}: one-time dates use '18 June 4813'.` };
    return {
      event: {
        id,
        customKind,
        title,
        date,
        endDate: ordinalToDate(dateToOrdinal(date) + durationDays - 1),
        prompt,
        region: "Worldwide",
        card
      }
    };
  };

  const readCustomEventsCard = () => {
    const index = findCardIndex(CUSTOM_EVENTS_KEY, CUSTOM_EVENTS_MARKER);
    if (index < 0 || typeof storyCards[index].entry !== "string") {
      return { changed: false };
    }
    const entry = storyCards[index].entry;
    const block = entry.match(/=== CUSTOM EVENTS ===([\s\S]*?)=== END CUSTOM EVENTS ===/i);
    const errors = [];
    const events = [];
    const seenIds = new Set();
    const source = block ? block[1] : "";
    if (!block) errors.push("The editable CUSTOM EVENTS block is missing.");

    source.split("\n").forEach((rawLine, indexInBlock) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;
      const parsed = parseCustomEventLine(line, indexInBlock + 1);
      if (parsed.error) {
        errors.push(parsed.error);
      } else if (seenIds.has(parsed.event.id)) {
        errors.push(`Line ${indexInBlock + 1}: duplicate event.`);
      } else {
        seenIds.add(parsed.event.id);
        events.push(parsed.event);
      }
    });

    const signature = `${block ? "valid" : "invalid"}\n${source}`;
    const changed = signature !== clock.customEventsSignature;
    clock.customEventErrors = errors;
    storyCards[index].description = customEventsNotes();
    if (!changed) return { changed: false };

    const nextIds = new Set(events.map((event) => event.id));
    const removedIds = new Set(clock.customEventIds.filter((id) => !nextIds.has(id)));
    for (const id of removedIds) {
      const marker = eventCardMarker({ id });
      removeCardByKeys(marker, marker);
    }
    clock.firedEvents = clock.firedEvents.filter((id) => !removedIds.has(id));
    clock.endedEvents = clock.endedEvents.filter((id) => !removedIds.has(id));
    clock.eventLog = clock.eventLog.filter((event) => !removedIds.has(event.id));
    clock.customEvents = events;
    clock.customEventIds = events.map((event) => event.id);
    clock.customEventsSignature = signature;
    clock.journal = [];
    clock.active = null;
    clock.pending = null;
    return { changed: true };
  };

  const rebuildCustomScheduledEventsForDate = () => {
    const customEvents = allEvents().filter((event) => event.customKind === "once");
    const customIds = new Set(customEvents.map((event) => event.id));
    clock.firedEvents = clock.firedEvents.filter((id) => !customIds.has(id));
    clock.endedEvents = clock.endedEvents.filter((id) => !customIds.has(id));
    clock.eventLog = clock.eventLog.filter((event) => !customIds.has(event.id));
    for (const event of customEvents) {
      if (clock.absoluteDay < event.ordinal) continue;
      clock.firedEvents.push(event.id);
      if (Number.isInteger(event.endOrdinal) && event.endOrdinal < clock.absoluteDay) {
        clock.endedEvents.push(event.id);
        setEventCardStatus(event, "concluded", {
          endOrdinal: event.endOrdinal,
          region: "Worldwide"
        });
      } else {
        setEventCardStatus(event, "active", {
          startOrdinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region: "Worldwide"
        });
      }
    }
  };

  const readCalendarOverrides = () => {
    const index = findCardIndex(CALENDAR_KEY, CALENDAR_MARKER);
    if (index < 0 || typeof storyCards[index].entry !== "string") {
      return { dateChanged: false, locationChanged: false };
    }
    const entry = storyCards[index].entry;
    const hasEditableState = entry.includes("[EDITABLE]") || entry.includes("=== EDITABLE STATE ===");
    if (!hasEditableState) {
      return { dateChanged: false, locationChanged: false };
    }
    const dateLine = entry.match(/^Date:\s*(.+?)\s*$/mi);
    const locationLine = entry.match(/^Location:\s*(.+?)\s*$/mi);
    const dateText = dateLine ? dateLine[1].trim() : null;
    const locationText = locationLine ? locationLine[1].trim() : null;
    const renderedDateText = typeof clock.lastRenderedDateText === "string"
      ? clock.lastRenderedDateText
      : formatDate(clock.absoluteDay);
    const renderedLocationText = typeof clock.lastRenderedLocationText === "string"
      ? clock.lastRenderedLocationText
      : clock.location.name;
    const dateWasEdited = dateText == null || dateText !== renderedDateText;
    const locationWasEdited = locationText == null || (
      locationText.toLowerCase() !== renderedLocationText.toLowerCase()
    );

    if (!dateWasEdited && !locationWasEdited) {
      return { dateChanged: false, locationChanged: false };
    }

    const errors = [];
    let dateChanged = false;
    let locationChanged = false;

    if (dateWasEdited && !dateLine) {
      errors.push("The Date line is missing.");
    } else if (dateWasEdited) {
      const parsedDate = parseEditableDate(dateText);
      if (!parsedDate) {
        errors.push(`Invalid date '${dateText}'.`);
      } else {
        const parsedOrdinal = dateToOrdinal(parsedDate);
        if (parsedOrdinal !== clock.absoluteDay) {
          clock.absoluteDay = parsedOrdinal;
          dateChanged = true;
        }
      }
    }

    if (locationWasEdited && !locationLine) {
      errors.push("The Location line is missing.");
    } else if (locationWasEdited) {
      const requestedLocation = locationText;
      if (requestedLocation.toLowerCase() !== clock.location.name.toLowerCase()) {
        const resolved = resolveLocation(requestedLocation, "calendar card") ||
        (!TRAVEL_ENABLED ? freeTextLocation(requestedLocation, "calendar card") : null);
        if (!resolved) {
          errors.push(`Unknown location '${requestedLocation}'. Include a known region or continent.`);
        } else if (clock.location.id !== resolved.id) {
          clock.location = resolved;
          locationChanged = true;
        }
      }
    }

    clock.lastCardEditError = errors.join(" ");
    if (dateChanged || locationChanged) {
      clock.journal = [];
      clock.active = null;
      clock.pending = null;
      if (locationChanged) clock.activeRoute = null;
    }
    return { dateChanged, locationChanged };
  };

  const rollbackTransaction = (transaction) => {
    clock.absoluteDay = transaction.beforeDay;
    if (transaction.beforeLocation) clock.location = { ...transaction.beforeLocation };
    if (Object.prototype.hasOwnProperty.call(transaction, "beforeActiveRoute")) {
      clock.activeRoute = cloneRoute(transaction.beforeActiveRoute);
    }
    const newIds = new Set(transaction.newEventIds || []);
    const newlyEnded = new Set(transaction.endedEventIds || []);
    clock.firedEvents = clock.firedEvents.filter((id) => !newIds.has(id));
    clock.endedEvents = clock.endedEvents.filter((id) => !newlyEnded.has(id));
    if (Number.isInteger(transaction.eventLogLengthBefore)) {
      clock.eventLog.splice(transaction.eventLogLengthBefore);
    } else {
      clock.eventLog = clock.eventLog.filter((event) => !newIds.has(event.id));
    }
    for (const change of [...(transaction.cardChanges || [])].reverse()) restoreCardChange(change);
    for (const keys of (transaction.addedCardKeys || [])) removeCardByKeys(keys);
    if (clock.active && clock.active.id === transaction.id) clock.active = null;
  };

  const latestUndoableTransaction = () => {
    for (let index = clock.journal.length - 1; index >= 0; index--) {
      const transaction = clock.journal[index];
      if (!transaction || transaction.undoEligible !== true) continue;
      if (!Number.isInteger(transaction.commitTurnSerial)) return null;
      const elapsed = Math.max(0, clock.inputTurnSerial - transaction.commitTurnSerial);
      return elapsed <= UNDO_WINDOW_ACTIONS ? transaction : null;
    }
    return null;
  };

  const reconcileJournal = () => {
    const actionCount = safeActionCount();
    while (clock.journal.length) {
      const transaction = clock.journal[clock.journal.length - 1];
      if (!Number.isInteger(transaction.commitActionCount)) break;
      if (historyContains(transaction.marker)) break;
      if (actionCount >= transaction.commitActionCount) break;
      rollbackTransaction(transaction);
      clock.journal.pop();
    }
    if (
      clock.active && clock.active.completed === true &&
      (!historyContains(clock.active.marker) || hasMeaningfulActionAfterMarker(clock.active.marker))
    ) {
      clock.active = null;
    }
  };

  const settlePreviousActiveCommand = () => {
    if (!clock.active || !["skip", "travel"].includes(clock.active.kind)) {
      clock.active = null;
      return;
    }
    const transaction = clock.journal.find((item) => item.id === clock.active.id);
    if (!transaction || Number.isInteger(transaction.commitActionCount)) {
      clock.active = null;
      return;
    }
    if (historyContains(transaction.marker)) {
      transaction.commitActionCount = safeActionCount();
    } else {
      rollbackTransaction(transaction);
      clock.journal = clock.journal.filter((item) => item.id !== transaction.id);
    }
    clock.active = null;
  };

  const unwrapCommand = (source) => {
    const lines = String(source || "").split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    let candidate = lines[lines.length - 1];
    candidate = candidate.replace(/^>\s*you\b/i, "").trim();
    candidate = candidate.replace(/^(?:say|try\s+to|attempt\s+to|do)\s+/i, "").trim();
    candidate = candidate.replace(/^["'“”]+/, "").replace(/["'“”]+[.!?]?$/, "").trim();
    const match = candidate.match(/^[:/](date|calendar|time|help|skip|travel|where|location|setlocation|weather|temperature|yes|no|undo)\b([\s\S]*)$/i);
    return match ? { name: match[1].toLowerCase(), args: match[2].trim() } : null;
  };

  const parseDuration = (source) => {
    const values = { years: 0, months: 0, days: 0 };
    let matched = false;
    const normalized = String(source || "").toLowerCase().replace(/\band\b/g, " ");
    const pattern = /(\d+)\s*(years?|yrs?|yr|y|months?|mons?|mos?|mo|weeks?|wks?|wk|w|days?|d)\b/g;
    const remainder = normalized.replace(pattern, (_, amountText, unit) => {
      matched = true;
      const amount = Number.parseInt(amountText, 10);
      if (!Number.isSafeInteger(amount)) return " INVALID ";
      if (/^y/.test(unit)) values.years += amount;
      else if (/^mo/.test(unit)) values.months += amount;
      else if (/^w/.test(unit)) values.days += amount * 7;
      else values.days += amount;
      return " ";
    }).replace(/[\s,+;&]+/g, "");

    if (!matched || remainder !== "") {
      return { error: "Use a duration such as ':skip 10 days', ':skip 3 months', or ':skip 1 year'." };
    }
    if ((values.years + values.months + values.days) <= 0) {
      return { error: "The time skip must be greater than zero." };
    }
    return { values };
  };

  const addDuration = (ordinal, duration) => {
    const original = ordinalToDate(ordinal);
    const totalMonths = ((original.year - 1) * 12) + (original.month - 1) +
      (duration.years * 12) + duration.months;
    const year = Math.floor(totalMonths / 12) + 1;
    const month = (totalMonths % 12) + 1;
    const day = Math.min(original.day, daysInMonth(year, month));
    return dateToOrdinal({ year, month, day }) + duration.days;
  };

  const describeDuration = (duration) => {
    const pieces = [];
    const add = (amount, singular) => {
      if (amount) pieces.push(`${amount} ${singular}${amount === 1 ? "" : "s"}`);
    };
    add(duration.years, "year");
    add(duration.months, "month");
    add(duration.days, "day");
    return pieces.join(", ");
  };

  const processScheduledEvents = (beforeDay, afterDay) => {
    const fired = new Set(clock.firedEvents);
    const ended = new Set(clock.endedEvents);
    const transitions = [];
    const newEventIds = [];
    const endedEventIds = [];
    const cardChanges = [];

    for (const event of allEvents()) {
      if (beforeDay < event.ordinal && event.ordinal <= afterDay && !fired.has(event.id)) {
        fired.add(event.id);
        clock.firedEvents.push(event.id);
        newEventIds.push(event.id);
        const region = event.region || "Worldwide";
        const transition = {
          id: event.id,
          kind: "started",
          title: event.title || event.id,
          ordinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region,
          prompt: event.prompt || "This event begins during the time skip."
        };
        transitions.push(transition);
        clock.eventLog.push(transition);
        const change = setEventCardStatus(event, "active", {
          startOrdinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region
        });
        if (change) cardChanges.push(change);
      }

      const endBoundary = Number.isInteger(event.endOrdinal) ? event.endOrdinal + 1 : null;
      if (
        endBoundary != null && fired.has(event.id) && !ended.has(event.id) &&
        beforeDay < endBoundary && endBoundary <= afterDay
      ) {
        ended.add(event.id);
        clock.endedEvents.push(event.id);
        endedEventIds.push(event.id);
        const region = event.region || "Worldwide";
        const transition = {
          id: event.id,
          kind: "ended",
          title: event.title || event.id,
          ordinal: event.endOrdinal,
          region,
          prompt: event.endPrompt || `${event.title || event.id} concludes during the time skip.`
        };
        transitions.push(transition);
        clock.eventLog.push(transition);
        const change = setEventCardStatus(event, "concluded", {
          endOrdinal: event.endOrdinal,
          region
        });
        if (change) cardChanges.push(change);
      }
    }
    return { transitions, newEventIds, endedEventIds, cardChanges };
  };

  const nextFestivalStart = (festival, afterDay) => {
    const year = ordinalToDate(afterDay).year;
    for (let candidateYear = year; candidateYear <= year + 2; candidateYear++) {
      const occurrence = festivalOccurrence(festival, candidateYear);
      if (occurrence && afterDay < occurrence.startOrdinal) return occurrence.startOrdinal;
    }
    return null;
  };

  const processRecurringFestivals = (beforeDay, afterDay) => {
    const beforeYear = ordinalToDate(beforeDay).year;
    const afterYear = ordinalToDate(afterDay).year;
    const transitions = [];
    const cardChanges = [];

    for (const festival of allFestivals().filter(festivalAppliesHere)) {
      const occurrences = [];
      for (let year = Math.max(1, beforeYear - 1); year <= afterYear; year++) {
        const occurrence = festivalOccurrence(festival, year);
        if (!occurrence) continue;
        const started = beforeDay < occurrence.startOrdinal && occurrence.startOrdinal <= afterDay;
        const ended = beforeDay < occurrence.endBoundary && occurrence.endBoundary <= afterDay;
        if (started || ended) occurrences.push({ ...occurrence, started, ended });
      }
      if (!occurrences.length) continue;

      const region = festival.regions.includes("*") ? "Worldwide" : festival.regions.join(" and ");
      if (occurrences.length <= 6) {
        for (const occurrence of occurrences) {
          const kind = occurrence.started && occurrence.ended
            ? "occurred"
            : occurrence.started ? "started" : "ended";
          transitions.push({
            id: festival.id,
            kind,
            title: festival.title || festival.id,
            ordinal: kind === "ended" ? occurrence.endOrdinal : occurrence.startOrdinal,
            endOrdinal: occurrence.endOrdinal,
            region,
            prompt: festival.prompt || "A recurring festival is observed during the time skip."
          });
        }
      } else {
        transitions.push({
          id: festival.id,
          kind: "recurred",
          title: festival.title || festival.id,
          ordinal: occurrences[occurrences.length - 1].startOrdinal,
          endOrdinal: occurrences[occurrences.length - 1].endOrdinal,
          region,
          count: occurrences.filter((occurrence) => occurrence.started).length,
          prompt: festival.prompt || "A recurring festival is observed repeatedly during the time skip."
        });
      }

      const afterOccurrence = festivalOccurrence(festival, afterYear);
      const activeNow = afterOccurrence &&
        afterOccurrence.startOrdinal <= afterDay && afterDay <= afterOccurrence.endOrdinal
        ? { ordinal: afterOccurrence.startOrdinal, endOrdinal: afterOccurrence.endOrdinal }
        : null;
      const lastOccurrence = occurrences[occurrences.length - 1];
      const change = setEventCardStatus(festival, activeNow ? "active" : "concluded", {
        startOrdinal: activeNow ? activeNow.ordinal : lastOccurrence.startOrdinal,
        endOrdinal: activeNow ? activeNow.endOrdinal : lastOccurrence.endOrdinal,
        nextOrdinal: activeNow ? null : nextFestivalStart(festival, afterDay),
        region
      });
      if (change) cardChanges.push(change);
    }

    for (const transition of transitions) clock.eventLog.push(transition);
    return { transitions, cardChanges };
  };

  const processCalendarTransitions = (beforeDay, afterDay) => {
    const scheduled = processScheduledEvents(beforeDay, afterDay);
    const festivals = processRecurringFestivals(beforeDay, afterDay);
    const transitions = [...scheduled.transitions, ...festivals.transitions]
      .sort((a, b) => a.ordinal - b.ordinal);
    return {
      transitions,
      newEventIds: scheduled.newEventIds,
      endedEventIds: scheduled.endedEventIds,
      cardChanges: [...scheduled.cardChanges, ...festivals.cardChanges]
    };
  };

  const previewCalendarTransitions = (beforeDay, afterDay, destinationState = clock.location.state) => {
    const fired = new Set(clock.firedEvents);
    const ended = new Set(clock.endedEvents);
    const transitions = [];

    for (const event of allEvents()) {
      let becomesFired = fired.has(event.id);
      if (beforeDay < event.ordinal && event.ordinal <= afterDay && !becomesFired) {
        becomesFired = true;
        transitions.push({
          id: event.id,
          kind: "started",
          title: event.title || event.id,
          ordinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region: event.region || "Worldwide",
          prompt: event.prompt || "This event begins during the time skip."
        });
      }
      const endBoundary = Number.isInteger(event.endOrdinal) ? event.endOrdinal + 1 : null;
      if (
        endBoundary != null && becomesFired && !ended.has(event.id) &&
        beforeDay < endBoundary && endBoundary <= afterDay
      ) {
        transitions.push({
          id: event.id,
          kind: "ended",
          title: event.title || event.id,
          ordinal: event.endOrdinal,
          region: event.region || "Worldwide",
          prompt: event.endPrompt || `${event.title || event.id} concludes during the time skip.`
        });
      }
    }

    const beforeYear = ordinalToDate(beforeDay).year;
    const afterYear = ordinalToDate(afterDay).year;
    const festivals = allFestivals().filter((festival) => (
      festival.regions.includes("*") || festival.regions.includes(destinationState)
    ));
    for (const festival of festivals) {
      const occurrences = [];
      for (let year = Math.max(1, beforeYear - 1); year <= afterYear; year++) {
        const occurrence = festivalOccurrence(festival, year);
        if (!occurrence) continue;
        const started = beforeDay < occurrence.startOrdinal && occurrence.startOrdinal <= afterDay;
        const endedNow = beforeDay < occurrence.endBoundary && occurrence.endBoundary <= afterDay;
        if (started || endedNow) occurrences.push({ ...occurrence, started, ended: endedNow });
      }
      if (!occurrences.length) continue;
      const region = festival.regions.includes("*") ? "Worldwide" : festival.regions.join(" and ");
      if (occurrences.length <= 6) {
        for (const occurrence of occurrences) {
          const kind = occurrence.started && occurrence.ended
            ? "occurred"
            : occurrence.started ? "started" : "ended";
          transitions.push({
            id: festival.id,
            kind,
            title: festival.title || festival.id,
            ordinal: kind === "ended" ? occurrence.endOrdinal : occurrence.startOrdinal,
            endOrdinal: occurrence.endOrdinal,
            region,
            prompt: festival.prompt || "A recurring festival is observed during the time skip."
          });
        }
      } else {
        transitions.push({
          id: festival.id,
          kind: "recurred",
          title: festival.title || festival.id,
          ordinal: occurrences[occurrences.length - 1].startOrdinal,
          endOrdinal: occurrences[occurrences.length - 1].endOrdinal,
          region,
          count: occurrences.filter((occurrence) => occurrence.started).length,
          prompt: festival.prompt || "A recurring festival is observed repeatedly during the time skip."
        });
      }
    }

    return transitions.sort((a, b) => a.ordinal - b.ordinal);
  };

  const synchronizeConcludedEvents = () => {
    const fired = new Set(clock.firedEvents);
    const ended = new Set(clock.endedEvents);
    for (const event of allEvents()) {
      if (!fired.has(event.id)) continue;
      const hasConcluded = ended.has(event.id) || (
        Number.isInteger(event.endOrdinal) && event.endOrdinal < clock.absoluteDay
      );
      if (hasConcluded) {
        if (!ended.has(event.id)) clock.endedEvents.push(event.id);
        setEventCardStatus(event, "concluded", {
          endOrdinal: event.endOrdinal,
          region: event.region || "Worldwide"
        });
      } else {
        setEventCardStatus(event, "active", {
          startOrdinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region: event.region || "Worldwide"
        });
      }
    }
  };

  const synchronizeFestivalCards = () => {
    const currentYear = ordinalToDate(clock.absoluteDay).year;
    for (const festival of allFestivals()) {
      const marker = eventCardMarker(festival);
      const keys = eventCardKeys(festival);
      const occurrence = festivalOccurrence(festival, currentYear);
      const applies = festivalAppliesHere(festival);
      const active = applies && occurrence &&
        occurrence.startOrdinal <= clock.absoluteDay && clock.absoluteDay <= occurrence.endOrdinal;
      if (active) {
        setEventCardStatus(festival, "active", {
          startOrdinal: occurrence.startOrdinal,
          endOrdinal: occurrence.endOrdinal,
          region: festival.regions.includes("*") ? "Worldwide" : festival.regions.join(" and ")
        });
        continue;
      }
      if (findCardIndex(keys, marker) < 0) continue;
      let lastOccurrence = occurrence;
      if (!lastOccurrence || clock.absoluteDay < lastOccurrence.startOrdinal) {
        lastOccurrence = festivalOccurrence(festival, Math.max(1, currentYear - 1));
      }
      setEventCardStatus(festival, "concluded", {
        endOrdinal: lastOccurrence && lastOccurrence.endOrdinal,
        nextOrdinal: applies ? nextFestivalStart(festival, clock.absoluteDay) : null,
        region: festival.regions.includes("*") ? "Worldwide" : festival.regions.join(" and ")
      });
    }
  };

  const rebuildScheduledEventsForDate = () => {
    const fired = [];
    const ended = [];
    clock.eventLog = [];
    for (const event of allEvents()) {
      const region = event.region || "Worldwide";
      if (clock.absoluteDay < event.ordinal) {
        if (findCardIndex(eventCardKeys(event), eventCardMarker(event)) >= 0) {
          setEventCardStatus(event, "upcoming", { startOrdinal: event.ordinal, region });
        }
        continue;
      }
      fired.push(event.id);
      if (Number.isInteger(event.endOrdinal) && event.endOrdinal < clock.absoluteDay) {
        ended.push(event.id);
        setEventCardStatus(event, "concluded", { endOrdinal: event.endOrdinal, region });
      } else {
        setEventCardStatus(event, "active", {
          startOrdinal: event.ordinal,
          endOrdinal: event.endOrdinal,
          region
        });
      }
    }
    clock.firedEvents = fired;
    clock.endedEvents = ended;
  };

  const calendarStatusText = () => {
    const active = currentEvents();
    const environment = currentEnvironment();
    return [
      ">>> World Calendar",
      `Date: ${formatDate(clock.absoluteDay)}`,
      `Location: ${locationLabel()}`,
      `Season: ${environment.season}`,
      ...(environment.condition ? [
        `Weather: ${environment.condition}`,
        `Temperature: ${environment.temperatureC}°C`
      ] : []),
      `Current events: ${active.length ? active.map(eventDisplayName).join("; ") : "None"}`
    ].join("\n");
  };

  const locationStatusText = () => {
    const route = clock.activeRoute;
    const nextLeg = route && route.legs[route.nextLegIndex];
    const environment = currentEnvironment();
    return [
      ">>> Current Location",
      locationLabel(),
      `Status: ${clock.location.status || "stationary"}`,
      `Season: ${environment.season}`,
      ...(environment.condition ? [
        `Weather: ${environment.condition}`,
        `Temperature: ${environment.temperatureC}°C`
      ] : []),
      ...(route && nextLeg ? [
        `Paused journey: ${routeProgressLabel(route)}`,
        `Remaining travel time: ${remainingRouteDays(route)} days`,
        `Next stage: ${nextLeg.destinationLabel} (${nextLeg.travelDays} days)`
      ] : [])
    ].join("\n");
  };

  const helpText = () => [
    ">>> World Calendar Commands",
    "",
    "IMPORTANT: Enter World Calendar commands as Story actions, not Do actions.",
    "Do may rewrite commands and cause valid commands to fail.",
    "",
    "IMPORTANT: Don't forget to use :skip night whenever your character goes to sleep.",
    "",
    "Enable or disable World Calendar:",
    "Open the World Calendar Story Card and edit its Description setting.",
    "Enabled: true — World Calendar is active.",
    "Enabled: false — disable all WC commands, time progression, travel, events, and calendar context.",
    "Other scripts continue to work while WC is disabled.",
    "",
    "Time skip:",
    "Use one universal command: :skip <duration>",
    "",
    "Examples:",
    ":skip 10 days",
    ":skip 2 weeks",
    ":skip 3 months",
    ":skip 1 year 2 months 3 days",
    ":skip night — advance to the next morning",
    `Skips of ${readAutoSkipLimit()} days or fewer run immediately. Edit Auto-Skip Limit in the World Calendar Story Card to change this.`,
    "Longer skips show their dates and calendar events first. Use :yes to continue or :no to cancel.",
    "",
    ...(TRAVEL_ENABLED ? [
      "Travel:",
      ":travel <destination> — plan a route to a configured destination",
      "Example: :travel Rivergate",
      "Long routes are divided into stages and pause at every intermediate stop.",
      ":travel continue — preview the next stage of the saved route",
      ":travel end — end the saved route and remain at the current stop",
      "Set Complete Full Route Immediately to true in the World Calendar Story Card to complete every remaining stage after one confirmation.",
      "Its default is false, so travel remains staged.",
      "Every stage shows its duration, arrival date, mode, and calendar events before departure. Use :yes or :no.",
      "Available destinations are configured by the scenario creator.",
      "A precise starting destination is not required when the current region or continent is known.",
      "For a custom starting point, travel time includes an estimated journey to the region's nearest hub, then the configured route.",
      "Use :setlocation <place, region or continent> when the calendar does not know where the character is.",
      "Example: :setlocation Old Ruins, Western Lands",
      ""
    ] : [
      "Travel is disabled in this scenario. The scenario creator can enable it in WorldCalendarSettings.",
      "Use :setlocation <destination> to correct the current location manually.",
      ""
    ]),
    "Season and local weather are derived automatically from the current date and location.",
    "Weather remains stable for the same date and place, including after Retry.",
    "A manual weather override applies only to the current date and location.",
    ":weather <description> — replace today's automatically generated local weather",
    "Example: :weather Heavy rain | 8°C",
    ":temperature <°C> — change only today's local temperature",
    "Example: :temperature -3",
    ":weather auto — restore automatic weather for the current date and location",
    "",
    ":date — show the current date, season, and local weather",
    ":where — show the current location, season, and local weather",
    ":undo — undo the latest completed skip or journey within the next 3 actions",
    ":yes — confirm the pending skip or journey",
    ":no — cancel the pending skip or journey",
    ":help — show this help",
    "Normal actions do not advance time."
  ].join("\n");

  const transitionNotice = (transition) => {
    const name = eventDisplayName(transition);
    if (transition.kind === "started") {
      const stillActive = !Number.isInteger(transition.endOrdinal) || clock.absoluteDay <= transition.endOrdinal;
      return `${formatDate(transition.ordinal)}: ${name} began${stillActive ? " and is currently underway" : ""}.`;
    }
    if (transition.kind === "ended") {
      return `${formatDate(transition.ordinal)}: ${name} ended.`;
    }
    if (transition.kind === "occurred") {
      return `${formatDate(transition.ordinal)}: ${name} was celebrated and ended during the skipped period.`;
    }
    if (transition.kind === "recurred") {
      return `${name} was celebrated ${transition.count || "multiple"} times during the skipped period.`;
    }
    return `${formatDate(transition.ordinal)}: ${name} occurred.`;
  };

  const contextBlock = () => {
    const blocks = [];
    const environment = currentEnvironment();
    const active = currentEvents();
    const isTransitionTurn = Boolean(clock.active && ["skip", "travel"].includes(clock.active.kind));
    const worldLines = [
      "-----",
      "<SYSTEM>",
      "# WORLD TIME — AUTHORITATIVE STATE",
      `Current date: ${formatDate(clock.absoluteDay)}.`,
      `Current location: ${clock.location.name}.`,
      `Current region: ${clock.location.state}, ${clock.location.continent}.`,
      `Current season: ${environment.season}.`,
      ...(!isTransitionTurn && environment.condition ? [
        `Current weather: ${environment.condition}.`,
        `Current temperature: ${environment.temperatureC}°C.`
      ] : []),
      ...(!isTransitionTurn ? [
        `Current world events: ${active.length ? active.map(eventDisplayName).join("; ") : "None"}.`
      ] : []),
      "</SYSTEM>"
    ];

    let pausedJourneyBlock = null;
    if (clock.activeRoute) {
      const route = clock.activeRoute;
      const nextLeg = route.legs[route.nextLegIndex];
      if (nextLeg) {
        pausedJourneyBlock = [
          "-----",
          "<SYSTEM>",
          "# PAUSED JOURNEY — AUTHORITATIVE STATE",
          `The protagonist is currently in ${locationLabel()}.`,
          `Final planned destination: ${route.finalDestinationLabel}.`,
          `Next planned stop: ${nextLeg.destinationLabel}.`,
          `Next stage duration: ${nextLeg.travelDays} days.`,
          `Travel mode: ${nextLeg.travelMode || "land"}.`,
          "The journey is currently paused. Keep the protagonist at the current location and do not resume the journey automatically.",
          "</SYSTEM>"
        ].join("\n");
      }
    }

    if (clock.active && ["skip", "travel"].includes(clock.active.kind)) {
      const transitionLines = [
        "-----",
        "<SYSTEM>",
        "# CALENDAR TRANSITION — AUTHORITATIVE INSTRUCTION"
      ];
      if (clock.active.kind === "skip") {
        if (clock.active.skipStyle === "night") {
          transitionLines.push(
            `The player explicitly skipped the night from ${clock.active.beforeLabel} to ${clock.active.afterLabel}.`,
            "The story now resumes the following morning.",
            "Write a short, natural overnight transition, then continue the scene in the morning of the new date."
          );
        } else {
          transitionLines.push(
            `The player explicitly advanced time from ${clock.active.beforeLabel} to ${clock.active.afterLabel}.`,
            `Elapsed time: ${clock.active.durationLabel}.`,
            "The previous Recent Story has been intentionally cleared because that scene is no longer current.",
            "Begin a fresh scene on the new date. Do not resume unfinished dialogue, immediate actions, or the exact moment from before the skip.",
            "Briefly establish what changed during the elapsed time, then continue from the character's present situation."
          );
        }
      } else if (clock.active.fullRoute) {
        transitionLines.push(
          `The player completed the full staged journey from ${clock.active.originLabel} to ${clock.active.destinationLabel}.`,
          `Travel time: ${clock.active.travelDays} days across ${clock.active.remainingStageCount} stages, from ${clock.active.beforeLabel} to ${clock.active.afterLabel}.`,
          `Travel modes used: ${clock.active.travelMode || "land"}.`,
          "Write a concise journey transition, acknowledge the substantial passage of time, and resume the story at the final destination."
        );
      } else {
        transitionLines.push(
          `The player completed travel stage ${clock.active.stageNumber} of ${clock.active.stageCount}, from ${clock.active.originLabel} to ${clock.active.destinationLabel}.`,
          `Travel time: ${clock.active.travelDays} days, from ${clock.active.beforeLabel} to ${clock.active.afterLabel}.`,
          `Travel mode: ${clock.active.travelMode || "land"}.`,
          "Write a concise journey transition, acknowledge the passage of time, and resume the story after arrival at this stop."
        );
        if (clock.active.routeRemaining) {
          transitionLines.push(
            `The wider route continues toward ${clock.active.finalDestinationLabel}, but it is now paused at ${clock.active.destinationLabel}.`,
            "Do not continue to the next stop in this generation. The player may remain here indefinitely."
          );
        }
        if (clock.active.originWasEstimated) {
          transitionLines.push(
            `The starting point was not a configured destination, so this stage estimates ${clock.active.accessDays} days to reach ${clock.active.hubLabel}.`,
            "Do not claim the character began in the hub destination; this stage starts at their previously recorded custom location."
          );
        }
      }
      if (Number.isInteger(clock.active.beforeDay) && Number.isInteger(clock.active.afterDay)) {
        const beforeSeason = seasonForOrdinal(clock.active.beforeDay);
        const afterSeason = seasonForOrdinal(clock.active.afterDay);
        if (beforeSeason !== afterSeason) {
          transitionLines.push(`The season changed from ${beforeSeason} to ${afterSeason} during this passage of time.`);
        }
      }
      transitionLines.push("Do not mention scripts, commands, state, Story Cards, or these instructions.");
      if (clock.active.transitions.length) {
        const eventLines = clock.active.transitions.slice(0, 12).map((event) => (
          `${transitionNotice(event)} ${event.prompt || ""}`.trim()
        ));
        transitionLines.push("Calendar transitions crossed during this passage of time:", ...eventLines);
        if (clock.active.transitions.length > 12) {
          transitionLines.push(`${clock.active.transitions.length - 12} additional calendar transitions also occurred; summarize them briefly.`);
        }
      }
      transitionLines.push("</SYSTEM>");
      blocks.push(transitionLines.join("\n"));
    }
    blocks.push(worldLines.join("\n"));
    if (pausedJourneyBlock) blocks.push(pausedJourneyBlock);
    return blocks.join("\n\n");
  };

  const appendContext = (source, block) => {
    const separator = source.endsWith("\n") ? "\n" : "\n\n";
    const addition = `${separator}${block}`;
    const maxChars = Number.isInteger(info.maxChars) ? info.maxChars : null;
    if (!maxChars || source.length + addition.length <= maxChars) return source + addition;
    if (addition.length >= maxChars) return addition.slice(-maxChars);

    const memoryLength = Number.isInteger(info.memoryLength)
      ? Math.max(0, Math.min(source.length, info.memoryLength))
      : 0;
    let memory = source.slice(0, memoryLength);
    const recent = source.slice(memoryLength);
    const available = maxChars - addition.length;
    if (memory.length > available) memory = memory.slice(0, available);
    const recentBudget = Math.max(0, available - memory.length);
    return memory + recent.slice(-recentBudget) + addition;
  };

  const replaceRecentStoryContext = (source, block) => {
    const recentStoryIndex = source.lastIndexOf("Recent Story:");
    const memoryLength = Number.isInteger(info.memoryLength)
      ? Math.max(0, Math.min(source.length, info.memoryLength))
      : 0;
    let persistent = recentStoryIndex >= 0
      ? source.slice(0, recentStoryIndex).trimEnd()
      : source.slice(0, memoryLength).trimEnd();
    const freshRecentStory = `Recent Story:\n\n${block}`;
    const maxChars = Number.isInteger(info.maxChars) ? info.maxChars : null;
    if (!maxChars) return persistent ? `${persistent}\n\n${freshRecentStory}` : freshRecentStory;
    if (freshRecentStory.length >= maxChars) return freshRecentStory.slice(-maxChars);
    const persistentBudget = Math.max(0, maxChars - freshRecentStory.length - 2);
    if (persistent.length > persistentBudget) persistent = persistent.slice(0, persistentBudget).trimEnd();
    return persistent ? `${persistent}\n\n${freshRecentStory}` : freshRecentStory;
  };

  const rememberTransaction = (transaction) => {
    clock.journal.push({ ...transaction, undoEligible: true });
    if (clock.journal.length > 50) clock.journal.splice(0, clock.journal.length - 50);
  };

  const executeSkipRequest = (request, id, marker) => {
    const beforeDay = clock.absoluteDay;
    const afterDay = addDuration(beforeDay, request.values);
    const eventLogLengthBefore = clock.eventLog.length;
    const processed = processCalendarTransitions(beforeDay, afterDay);
    clock.absoluteDay = afterDay;
    rememberTransaction({
      id,
      marker,
      kind: "skip",
      beforeDay,
      afterDay,
      newEventIds: processed.newEventIds,
      endedEventIds: processed.endedEventIds,
      cardChanges: processed.cardChanges,
      eventLogLengthBefore,
      commitActionCount: null
    });
    clock.active = {
      id,
      marker,
      kind: "skip",
      skipStyle: request.isNightSkip ? "night" : "duration",
      durationLabel: request.durationLabel,
      beforeDay,
      afterDay,
      beforeLabel: formatDate(beforeDay),
      afterLabel: formatDate(afterDay),
      transitions: processed.transitions,
      completed: false
    };
    synchronizeConcludedEvents();
    synchronizeFestivalCards();
    return request.isNightSkip
      ? `\n> The night passes. The story resumes on the morning of ${formatDate(afterDay)}.${marker}`
      : `\n> ${request.durationLabel} passes. The story resumes on ${formatDate(afterDay)}.${marker}`;
  };

  const executeTravelRequest = (request, id, marker) => {
    const beforeDay = clock.absoluteDay;
    const beforeLocation = { ...clock.location };
    const beforeActiveRoute = cloneRoute(clock.activeRoute);
    const eventLogLengthBefore = clock.eventLog.length;
    let afterDay = beforeDay;
    let processed;
    let routeRemaining = false;

    if (request.fullRoute) {
      const combined = {
        transitions: [],
        newEventIds: [],
        endedEventIds: [],
        cardChanges: []
      };
      for (const leg of request.legsToTravel) {
        const destination = travelNodeById(leg.toNodeId);
        if (!destination) throw new Error(`Unknown travel node '${leg.toNodeId}'.`);
        const stageEnd = afterDay + leg.travelDays;
        clock.location = travelNodeLocation(destination, "travel command");
        const stage = processCalendarTransitions(afterDay, stageEnd);
        combined.transitions.push(...stage.transitions);
        combined.newEventIds.push(...stage.newEventIds);
        combined.endedEventIds.push(...stage.endedEventIds);
        combined.cardChanges.push(...stage.cardChanges);
        afterDay = stageEnd;
      }
      clock.absoluteDay = afterDay;
      clock.activeRoute = null;
      processed = combined;
    } else {
      afterDay = beforeDay + request.travelDays;
      clock.location = { ...request.afterLocation };
      processed = processCalendarTransitions(beforeDay, afterDay);
      clock.absoluteDay = afterDay;
      const routeAfter = cloneRoute(request.routePlan);
      routeAfter.nextLegIndex = request.legIndex + 1;
      routeAfter.status = "paused";
      routeRemaining = routeAfter.nextLegIndex < routeAfter.legs.length;
      clock.activeRoute = routeRemaining ? routeAfter : null;
    }
    rememberTransaction({
      id,
      marker,
      kind: "travel",
      beforeDay,
      afterDay,
      beforeLocation,
      afterLocation: { ...request.afterLocation },
      beforeActiveRoute,
      afterActiveRoute: cloneRoute(clock.activeRoute),
      newEventIds: processed.newEventIds,
      endedEventIds: processed.endedEventIds,
      cardChanges: processed.cardChanges,
      eventLogLengthBefore,
      commitActionCount: null
    });
    clock.active = {
      id,
      marker,
      kind: "travel",
      originLabel: request.originLabel,
      destinationLabel: request.destinationLabel,
      travelDays: request.travelDays,
      travelMode: request.travelMode,
      originWasEstimated: request.originWasEstimated,
      accessDays: request.accessDays,
      hubLabel: request.hubLabel,
      networkTravelDays: request.networkTravelDays,
      stageNumber: request.stageNumber,
      stageCount: request.stageCount,
      remainingStageCount: request.remainingStageCount,
      routeLabel: request.routeLabel,
      finalDestinationLabel: request.finalDestinationLabel,
      routeRemaining,
      fullRoute: request.fullRoute,
      beforeDay,
      afterDay,
      beforeLabel: formatDate(beforeDay),
      afterLabel: formatDate(afterDay),
      transitions: processed.transitions,
      completed: false
    };
    synchronizeConcludedEvents();
    synchronizeFestivalCards();
    if (request.fullRoute) {
      return `\n> You complete the full journey from ${request.originName} to ${request.destinationName}. The remaining route takes ${request.travelDays} days, and you arrive on ${formatDate(afterDay)}.${marker}`;
    }
    return `\n> You travel from ${request.originName} to ${request.destinationName}. This stage takes ${request.travelDays} days, and you arrive on ${formatDate(afterDay)}.${marker}`;
  };

  const previewTransitionNotice = (transition) => {
    const name = eventDisplayName(transition);
    if (transition.kind === "started") return `${formatDate(transition.ordinal)}: ${name} begins.`;
    if (transition.kind === "ended") return `${formatDate(transition.ordinal)}: ${name} ends.`;
    if (transition.kind === "occurred") return `${formatDate(transition.ordinal)}: ${name} takes place and concludes.`;
    if (transition.kind === "recurred") return `${name} occurs ${transition.count || "multiple"} times.`;
    return `${formatDate(transition.ordinal)}: ${name} occurs.`;
  };

  const setWeatherOverride = (condition, temperatureC) => {
    clock.weatherOverride = {
      absoluteDay: clock.absoluteDay,
      locationName: String(clock.location.name || ""),
      locationState: String(clock.location.state || ""),
      condition,
      temperatureC
    };
  };

  const parseTemperature = (source) => {
    const match = String(source || "").trim().match(/^(-?\d{1,3})(?:\s*°?\s*[Cc])?$/);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return value >= -100 && value <= 100 ? value : null;
  };

  if (!readCalendarEnabled()) {
    clock.active = null;
    clock.pending = null;
    deactivateCalendarCards();
    return text || ZERO_WIDTH_SPACE;
  }

  ensureCustomEventsCard();
  const manualOverride = ["input", "context"].includes(hook)
    ? readCalendarOverrides()
    : { dateChanged: false, locationChanged: false };
  const customOverride = ["input", "context"].includes(hook)
    ? readCustomEventsCard()
    : { changed: false };
  if (manualOverride.dateChanged) rebuildScheduledEventsForDate();
  else if (customOverride.changed) rebuildCustomScheduledEventsForDate();
  reconcileJournal();
  synchronizeConcludedEvents();
  synchronizeFestivalCards();

  if (hook === "input") {
    settlePreviousActiveCommand();
    const command = unwrapCommand(text);
    if (!command) {
      clock.pending = null;
      updateCalendarCard();
      return text || ZERO_WIDTH_SPACE;
    }

    const id = clock.nextTransactionId++;
    const marker = makeMarker(id);

    if (command.name === "yes") {
      const pending = clock.pending;
      clock.pending = null;
      if (!pending) {
        clock.active = { id, marker, kind: "error", message: "There is no pending skip or journey to confirm.", completed: false };
        updateCalendarCard();
        return marker;
      }
      const sameDate = pending.beforeDay === clock.absoluteDay;
      const sameLocation = !pending.beforeLocationId || pending.beforeLocationId === clock.location.id;
      if (!sameDate || !sameLocation) {
        clock.active = { id, marker, kind: "error", message: "The calendar state changed, so the pending action was cancelled. Enter the original command again.", completed: false };
        updateCalendarCard();
        return marker;
      }
      const result = pending.kind === "travel"
        ? executeTravelRequest(pending, id, marker)
        : executeSkipRequest(pending, id, marker);
      updateCalendarCard();
      return result;
    }

    if (command.name === "no") {
      const hadPending = Boolean(clock.pending);
      clock.pending = null;
      clock.active = {
        id,
        marker,
        kind: hadPending ? "cancelled" : "error",
        message: hadPending ? "The pending skip or journey was cancelled." : "There is no pending skip or journey to cancel.",
        completed: false
      };
      updateCalendarCard();
      return marker;
    }

    // Any command other than :yes or :no cancels a stale confirmation.
    clock.pending = null;

    if (command.name === "undo") {
      const transaction = latestUndoableTransaction();
      if (!transaction) {
        clock.active = { id, marker, kind: "undoUnavailable", completed: false };
        updateCalendarCard();
        return marker;
      }
      const fromDate = formatDate(clock.absoluteDay);
      const fromLocation = locationLabel();
      rollbackTransaction(transaction);
      clock.journal = clock.journal.filter((item) => item.id !== transaction.id);
      clock.active = {
        id,
        marker,
        kind: "undo",
        undoneKind: transaction.kind,
        fromDate,
        toDate: formatDate(clock.absoluteDay),
        fromLocation,
        toLocation: locationLabel(),
        completed: false
      };
      updateCalendarCard();
      return marker;
    }

    if (command.name === "date" || command.name === "calendar") {
      clock.active = {
        id,
        marker,
        kind: "date",
        completed: false
      };
      updateCalendarCard();
      return marker;
    }

    if ((command.name === "where" || command.name === "location") && command.args === "") {
      clock.active = { id, marker, kind: "where", completed: false };
      updateCalendarCard();
      return marker;
    }

    if (command.name === "setlocation" || (command.name === "location" && command.args !== "")) {
      const resolved = resolveLocation(command.args, "manual command") ||
        (!TRAVEL_ENABLED ? freeTextLocation(command.args, "manual command") : null);
      if (!resolved) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: `Unknown location '${command.args}'. Include a known destination, region, or continent.`,
          completed: false
        };
      } else {
        clock.location = resolved;
        clock.activeRoute = null;
        clock.active = { id, marker, kind: "locationSet", completed: false };
      }
      updateCalendarCard();
      return marker;
    }

    if (command.name === "weather") {
      const weatherArgs = command.args.trim();
      if (weatherArgs === "") {
        clock.active = { id, marker, kind: "weatherStatus", completed: false };
        updateCalendarCard();
        return marker;
      }
      if (/^(?:auto|automatic|reset|default)$/i.test(weatherArgs)) {
        clock.weatherOverride = null;
        clock.active = {
          id,
          marker,
          kind: "weatherUpdated",
          message: "Automatic local weather restored for the current date and location.",
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      const parts = weatherArgs.split("|");
      const condition = String(parts.shift() || "").trim().replace(/[.!]+$/, "");
      const temperatureText = parts.join("|").trim();
      const temperatureC = temperatureText === ""
        ? currentEnvironment().temperatureC
        : parseTemperature(temperatureText);
      if (!condition || condition.length > 120 || !Number.isInteger(temperatureC)) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: "Use ':weather <description>' or ':weather <description> | <temperature in °C>'. Keep the description under 120 characters.",
          completed: false
        };
      } else {
        setWeatherOverride(condition, temperatureC);
        clock.active = {
          id,
          marker,
          kind: "weatherUpdated",
          message: `Today's local weather is now ${condition} at ${temperatureC}°C.`,
          completed: false
        };
      }
      updateCalendarCard();
      return marker;
    }

    if (command.name === "temperature") {
      const temperatureC = parseTemperature(command.args);
      const environment = currentEnvironment();
      if (!Number.isInteger(temperatureC) || !environment.condition) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: "Use ':temperature <number in °C>', for example ':temperature -3'. Allowed range: -100 to 100.",
          completed: false
        };
      } else {
        setWeatherOverride(environment.condition, temperatureC);
        clock.active = {
          id,
          marker,
          kind: "weatherUpdated",
          message: `Today's local temperature is now ${temperatureC}°C; weather remains ${environment.condition}.`,
          completed: false
        };
      }
      updateCalendarCard();
      return marker;
    }

    if (command.name === "help" || (command.name === "time" && /^(?:help|commands?)$/i.test(command.args))) {
      clock.active = { id, marker, kind: "help", completed: false };
      updateCalendarCard();
      return marker;
    }

    if (command.name === "time" && command.args === "") {
      clock.active = { id, marker, kind: "date", completed: false };
      updateCalendarCard();
      return marker;
    }

    if (command.name === "travel") {
      if (!TRAVEL_ENABLED) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: "Travel is disabled in this scenario.",
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      const travelAction = command.args.trim().toLowerCase();

      if (["end", "cancel"].includes(travelAction)) {
        if (!clock.activeRoute) {
          clock.active = {
            id,
            marker,
            kind: "error",
            message: "There is no paused journey to end.",
            completed: false
          };
        } else {
          const endedDestinationLabel = clock.activeRoute.finalDestinationLabel;
          clock.activeRoute = null;
          clock.active = {
            id,
            marker,
            kind: "routeEnded",
            endedDestinationLabel,
            completed: false
          };
        }
        updateCalendarCard();
        return marker;
      }

      if (travelAction === "continue") {
        const route = cloneRoute(clock.activeRoute);
        if (!route) {
          clock.active = {
            id,
            marker,
            kind: "error",
            message: "There is no paused journey to continue.",
            completed: false
          };
          updateCalendarCard();
          return marker;
        }
        const leg = route.legs[route.nextLegIndex];
        const currentNode = currentTravelNode();
        if (!leg || !currentNode || currentNode.id !== leg.fromNodeId) {
          clock.active = {
            id,
            marker,
            kind: "error",
            message: "The current location no longer matches the saved route. Use :travel end, then plan a new journey.",
            completed: false
          };
          updateCalendarCard();
          return marker;
        }
        const completeFullRoute = readCompleteFullRouteImmediately() &&
          (route.legs.length - route.nextLegIndex > 1);
        const request = completeFullRoute
          ? travelRequestForRemainingRoute(route, route.nextLegIndex)
          : travelRequestForLeg(route, route.nextLegIndex);
        if (!request) {
          clock.active = {
            id,
            marker,
            kind: "error",
            message: "The next travel stage could not be calculated. End the route and plan it again.",
            completed: false
          };
          updateCalendarCard();
          return marker;
        }
        queueTravelConfirmation(request, id, marker, true);
        updateCalendarCard();
        return marker;
      }

      const destinationText = command.args.replace(/^to\s+/i, "").trim();
      const destination = resolveTravelNode(destinationText);
      const exactOrigin = currentTravelNode();
      const originEstimate = exactOrigin ? null : estimatedTravelOrigin();
      const origin = exactOrigin || originEstimate?.hub;
      if (!origin) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: "Travel requires at least a known region or continent. Edit the Location line in World Calendar or use :setlocation <place, continent>.",
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      if (!destination) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: `Unknown travel destination '${destinationText}'.`,
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      if (!originEstimate && origin.id === destination.id) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: `The character is already in ${destination.name}.`,
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      const route = buildTravelRoute(origin, originEstimate, destination, id);
      if (!route) {
        clock.active = {
          id,
          marker,
          kind: "error",
          message: `No staged route is configured between ${origin.name} and ${destination.name}.`,
          completed: false
        };
        updateCalendarCard();
        return marker;
      }
      const completeFullRoute = readCompleteFullRouteImmediately() && route.legs.length > 1;
      const request = completeFullRoute
        ? travelRequestForRemainingRoute(route, 0)
        : travelRequestForLeg(route, 0);
      queueTravelConfirmation(request, id, marker, false);
      updateCalendarCard();
      return marker;
    }

    const isNightSkip = command.name === "skip" && /^(?:the\s+)?night$/i.test(command.args);
    const parsed = isNightSkip
      ? { values: { years: 0, months: 0, days: 1 } }
      : parseDuration(command.args);
    if (parsed.error) {
      clock.active = { id, marker, kind: "error", message: parsed.error, completed: false };
      updateCalendarCard();
      return marker;
    }

    const maxYears = Number.isInteger(SETTINGS.MAX_SKIP_YEARS)
      ? Math.max(1, SETTINGS.MAX_SKIP_YEARS)
      : 1000;
    const roughMaximumDays = maxYears * 366;
    const roughRequestedDays = (parsed.values.years * 366) +
      (parsed.values.months * 31) + parsed.values.days;

    if (!Number.isSafeInteger(roughRequestedDays) || roughRequestedDays > roughMaximumDays) {
      clock.active = {
        id,
        marker,
        kind: "error",
        message: `One time skip cannot exceed approximately ${maxYears} years.`,
        completed: false
      };
      updateCalendarCard();
      return marker;
    }

    const beforeDay = clock.absoluteDay;
    const afterDay = addDuration(beforeDay, parsed.values);
    const beforeDate = ordinalToDate(beforeDay);
    const afterDate = ordinalToDate(afterDay);

    if (afterDay <= beforeDay || (afterDate.year - beforeDate.year) > maxYears + 1) {
      clock.active = {
        id,
        marker,
        kind: "error",
        message: `One time skip cannot exceed approximately ${maxYears} years.`,
        completed: false
      };
      updateCalendarCard();
      return marker;
    }

    const durationLabel = isNightSkip ? "one night" : describeDuration(parsed.values);
    const request = {
      kind: "skip",
      beforeDay,
      afterDay,
      beforeLocationId: clock.location.id,
      values: { ...parsed.values },
      durationLabel,
      isNightSkip,
      previewTransitions: previewCalendarTransitions(beforeDay, afterDay)
    };
    const elapsedDays = afterDay - beforeDay;
    if (isNightSkip || elapsedDays <= readAutoSkipLimit()) {
      const result = executeSkipRequest(request, id, marker);
      updateCalendarCard();
      return result;
    }

    clock.pending = request;
    clock.active = {
      id,
      marker,
      kind: "confirmation",
      confirmationKind: "skip",
      durationLabel,
      beforeLabel: formatDate(beforeDay),
      afterLabel: formatDate(afterDay),
      elapsedDays,
      transitions: request.previewTransitions,
      completed: false
    };
    updateCalendarCard();
    return marker;
  }

  if (hook === "context") {
    updateCalendarCard();
    const block = contextBlock();
    if (clock.active?.kind === "skip" && clock.active.skipStyle === "duration") {
      return replaceRecentStoryContext(text || " ", block);
    }
    return appendContext(text || " ", block);
  }

  if (hook === "output") {
    let output = text;
    const active = clock.active;

    if (active) {
      if (active.kind === "date") {
        output = calendarStatusText();
      } else if (active.kind === "where") {
        output = locationStatusText();
      } else if (active.kind === "weatherStatus") {
        const environment = currentEnvironment();
        output = [
          ">>> Current Weather",
          `Location: ${locationLabel()}`,
          `Date: ${formatDate(clock.absoluteDay)}`,
          `Season: ${environment.season}`,
          `Weather: ${environment.condition || "Unavailable"}`,
          `Temperature: ${Number.isInteger(environment.temperatureC) ? `${environment.temperatureC}°C` : "Unavailable"}`,
          `Source: ${environment.manual ? "manual override" : "automatic"}`
        ].join("\n");
      } else if (active.kind === "weatherUpdated") {
        output = `>>> Weather Updated\n${active.message}`;
      } else if (active.kind === "locationSet") {
        output = `>>> Location Updated\n${locationLabel()}`;
      } else if (active.kind === "help") {
        output = helpText();
      } else if (active.kind === "error") {
        output = `>>> Calendar Command Error\n${active.message}\nType :help for examples.`;
      } else if (active.kind === "cancelled") {
        output = `>>> Calendar Action Cancelled\n${active.message}`;
      } else if (active.kind === "routeEnded") {
        output = [
          ">>> Journey Ended",
          `The saved route to ${active.endedDestinationLabel} was removed.`,
          `The character remains in ${locationLabel()}.`
        ].join("\n");
      } else if (active.kind === "undoUnavailable") {
        output = ">>> Undo\nNothing to undo.";
      } else if (active.kind === "undo") {
        const locationLine = active.fromLocation === active.toLocation
          ? `Location remains: ${active.toLocation}`
          : `Location restored: ${active.fromLocation} → ${active.toLocation}`;
        output = [
          ">>> Undo Complete",
          `${active.undoneKind === "travel" ? "Journey" : "Time skip"} reverted.`,
          `Date restored: ${active.fromDate} → ${active.toDate}`,
          locationLine
        ].join("\n");
      } else if (active.kind === "confirmation") {
        const eventLines = active.transitions.length
          ? active.transitions.slice(0, 12).map((event) => `- ${previewTransitionNotice(event)}`)
          : ["- None."];
        if (active.transitions.length > 12) {
          eventLines.push(`- ${active.transitions.length - 12} additional calendar transitions.`);
        }
        if (active.confirmationKind === "travel") {
          const estimate = active.originWasEstimated
            ? `This first stage is an estimated ${active.accessDays}-day journey to ${active.hubLabel}.`
            : null;
          const routeLines = [
            active.fullRoute
              ? ">>> Confirm Full Journey"
              : active.isContinuation ? ">>> Resume Journey" : ">>> Confirm Journey",
            `Full route: ${active.routeLabel}`,
            `Stages: ${active.stageCount}`,
            `Remaining planned travel time: ${active.remainingTravelDays} days`,
            ""
          ];
          if (active.fullRoute) {
            routeLines.push(
              `Complete remaining stages: ${active.originLabel} → ${active.destinationLabel}`,
              `Stages to complete: ${active.remainingStageCount}`,
              `Travel time: ${active.travelDays} days`,
              `Travel modes: ${active.travelMode || "land"}`,
              `Arrival date: ${active.afterLabel}`,
              estimate,
              "",
              "Calendar events during the remaining journey:"
            );
          } else {
            routeLines.push(
              `Next stage (${active.stageNumber}/${active.stageCount}): ${active.originLabel} → ${active.destinationLabel}`,
              `Stage travel time: ${active.travelDays} days`,
              `Travel mode: ${active.travelMode || "land"}`,
              `Arrival date: ${active.afterLabel}`,
              estimate,
              "",
              "Calendar events during this stage:"
            );
          }
          output = [
            ...routeLines,
            ...eventLines,
            "",
            "Continue? (:yes/:no)"
          ].filter((line) => line !== null).join("\n");
        } else {
          output = [
            ">>> Confirm Time Skip",
            `Duration: ${active.durationLabel} (${active.elapsedDays} days)`,
            `${active.beforeLabel} → ${active.afterLabel}`,
            "",
            "Calendar events during this period:",
            ...eventLines,
            "",
            "Continue? (:yes/:no)"
          ].join("\n");
        }
      } else if (active.kind === "skip") {
        const body = text.replace(/[\u200B-\u200D]+/g, "").trim() ||
          (active.skipStyle === "night"
            ? `The night passes. The story resumes on the morning of ${active.afterLabel}.`
            : `Time passes. The story resumes on ${active.afterLabel}.`);
        const notices = active.transitions.length
          ? `\n\nCalendar events:\n${active.transitions.slice(0, 12).map((event) => `- ${transitionNotice(event)}`).join("\n")}${(
              active.transitions.length > 12
                ? `\n- ${active.transitions.length - 12} additional transitions occurred.`
                : ""
            )}`
          : "";
        const header = active.skipStyle === "night"
          ? `[Night Skip: ${active.beforeLabel} → Morning of ${active.afterLabel}]`
          : `[Time Skip: ${active.beforeLabel} → ${active.afterLabel}]`;
        output = `${header}${notices}\n\n${body}`;
        const transaction = clock.journal.find((item) => item.id === active.id);
        if (transaction && !Number.isInteger(transaction.commitActionCount)) {
          transaction.commitActionCount = safeActionCount();
          transaction.commitTurnSerial = clock.inputTurnSerial;
          transaction.undoExpiresTurnSerial = transaction.commitTurnSerial + UNDO_WINDOW_ACTIONS;
        }
      } else if (active.kind === "travel") {
        const body = text.replace(/[\u200B-\u200D]+/g, "").trim() ||
          `This travel stage ends with the character's arrival at ${active.destinationLabel}.`;
        const notices = active.transitions.length
          ? `\n\nCalendar events:\n${active.transitions.slice(0, 12).map((event) => `- ${transitionNotice(event)}`).join("\n")}${(
              active.transitions.length > 12
                ? `\n- ${active.transitions.length - 12} additional transitions occurred.`
                : ""
            )}`
          : "";
        const estimate = active.originWasEstimated
          ? `\nThis stage used an estimated ${active.accessDays}-day journey to ${active.hubLabel}.`
          : "";
        const routeStatus = active.routeRemaining
          ? `\n\nRoute paused at ${active.destinationLabel}.\nFinal destination: ${active.finalDestinationLabel}.\nUse :travel continue to preview the next stage, or :travel end to finish the route here.`
          : `\n\nFinal destination reached. The staged journey is complete.`;
        const journeyHeader = active.fullRoute
          ? `[Full Journey: ${active.originLabel} → ${active.destinationLabel}]\nStages completed: ${active.remainingStageCount}\nTravel modes: ${active.travelMode || "land"}`
          : `[Journey Stage ${active.stageNumber}/${active.stageCount}: ${active.originLabel} → ${active.destinationLabel}]\nTravel mode: ${active.travelMode || "land"}`;
        output = `${journeyHeader}\nTravel time: ${active.travelDays} days${estimate}\nArrival date: ${active.afterLabel}${notices}\n\n${body}${routeStatus}`;
        const transaction = clock.journal.find((item) => item.id === active.id);
        if (transaction && !Number.isInteger(transaction.commitActionCount)) {
          transaction.commitActionCount = safeActionCount();
          transaction.commitTurnSerial = clock.inputTurnSerial;
          transaction.undoExpiresTurnSerial = transaction.commitTurnSerial + UNDO_WINDOW_ACTIONS;
        }
      }
      output = `\n\n${String(output || "").trim()}\n\n`;
      active.completed = true;
    }

    updateCalendarCard();
    return output || ZERO_WIDTH_SPACE;
  }

  updateCalendarCard();
  return text || ZERO_WIDTH_SPACE;
}

// AI Dungeon Ideas v1.0.0
// Paste this entire file into the AI Dungeon "Library" script tab.

/**
 * Creator configuration. Auto follows the story language, with Russian and
 * English interface labels. Set LANGUAGE to "ru" or "en" to force that language.
 */
globalThis.IdeasSettings = {
  LANGUAGE: "auto",
  DEFAULT_IDEA_COUNT: 3
};

function Ideas(hook, inputText, next = (text) => ({ text })) {
  const START = ">>> Ideas · OOC";
  const END = "<<< Ideas";
  // Distinct from the World Calendar transaction marker.
  const MARKER = /\u2063\u2063[\u200B\u200C]+\u2063/g;
  const TYPES = ["SAY", "DO", "STORY", "PLAN"];
  const source = typeof inputText === "string" ? inputText : "";
  const actions = Array.isArray(globalThis.history) ? history : [];
  const actionText = (action) => String(action?.text ?? action?.rawText ?? "");
  const data = state.Ideas;

  const stripMeta = (text) => text
    .replace(/^\s*>>> Ideas · OOC[^\r\n]*\r?\n[\s\S]*?^\s*<<< Ideas[ \t]*(?=\r?$)/gm, "")
    .replace(MARKER, "");

  const storyActions = () => actions.filter((action) => {
    const text = actionText(action);
    return !text.trimStart().startsWith(START) && !text.match(MARKER);
  });

  // The bundled mods also inspect history directly. Filter only their view
  // for this hook, keeping the engine's history and action count intact.
  const passThrough = (text) => {
    const filtered = storyActions();
    if (filtered.length === actions.length) return next(text);
    globalThis.history = filtered;
    try {
      return next(text);
    } finally {
      globalThis.history = actions;
    }
  };

  const parseCommand = () => {
    let line = source.trim();
    if (/^>\s*you\s+say\s+["“]/i.test(line)) {
      line = line.replace(/^>\s*you\s+say\s+["“]/i, "").replace(/["”][.!?]?$/, "");
    } else if (/^>\s*you\s+/i.test(line)) {
      line = line.replace(/^>\s*you\s+(?:(?:try to|attempt to|do)\s+)?/i, "");
      line = line.replace(/\.$/, "");
    }
    const match = line.match(/^[:/](ideas|plans)(?:[ \t]+([^\r\n]*))?$/i);
    if (!match) return null;

    let mode = match[1].toLowerCase() === "plans" ? "plan" : "mix";
    let tail = (match[2] || "").trim();
    if (tail.toLowerCase() === "help") return { mode, help: true, focus: "" };

    let count = mode === "plan" ? 3 : globalThis.IdeasSettings?.DEFAULT_IDEA_COUNT;
    if (!Number.isInteger(count) || count < 3 || count > 8) count = 3;
    if (mode === "mix") {
      const type = tail.match(/^(say|do|story)(?=\s|$)/i);
      if (type) {
        mode = type[1].toLowerCase();
        tail = tail.slice(type[0].length).trimStart();
      }
      const size = tail.match(/^([+-]?\d+)(?=\s|$)/);
      if (size) {
        count = Number(size[1]);
        tail = tail.slice(size[0].length).trimStart();
        if (count < 3 || count > 8) return { mode, help: true, focus: tail };
      }
    }

    const focus = tail.replace(/^--(?:\s+|$)/, "").slice(0, 240);
    return { mode, count, focus };
  };

  const markerFor = (id) => "\u2063\u2063" + id.toString(2)
    .replace(/0/g, "\u200B").replace(/1/g, "\u200C") + "\u2063";

  const latestRequest = () => {
    const latest = actions.slice().reverse().find((action) => actionText(action).trim());
    const text = actionText(latest);
    const marker = text.match(MARKER)?.[0];
    if (marker) return data?.requests?.find((request) => request.marker === marker);
    // Some Retry paths keep the replaced answer in history but omit it from
    // the model context. Continue still includes that answer.
    if (text.trimStart().startsWith(START)) {
      const previous = actionText(actions[actions.indexOf(latest) - 1]).match(MARKER)?.[0];
      if (previous && source.lastIndexOf(previous) > source.lastIndexOf(START)) {
        return data?.requests?.find((request) => request.marker === previous);
      }
    }
    return undefined;
  };

  const cleanContext = () => {
    let text = stripMeta(source);
    const heading = text.lastIndexOf("Recent Story:");
    if (heading >= 0) {
      const start = heading + "Recent Story:".length;
      // If AID trimmed the beginning of the oldest menu, remove its remainder.
      const story = text.slice(start).replace(/^[\s\S]*?^\s*<<< Ideas[ \t]*(?=\r?$)/m, "");
      if (story !== text.slice(start)) text = text.slice(0, start) + "\n" + story.trimStart();
    }
    return text;
  };

  const languageFor = (request, recent) => {
    const setting = globalThis.IdeasSettings?.LANGUAGE;
    if (setting === "ru" || setting === "en") return setting;
    const sample = request.focus || recent;
    return /[А-Яа-яЁё]/.test(sample) ? "ru" : "auto";
  };

  const calendarSnapshot = () => {
    if (!state.WorldCalendar || !Array.isArray(globalThis.storyCards)) return "";
    const card = storyCards.find((item) => item?.keys === "%WC_CALENDAR_V1%");
    if (!card || /^Enabled:\s*false\b/im.test(card.description || card.notes || "")) return "";
    return String(card.entry || "")
      .split(/\r?\nRecent dated events:/i)[0]
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("==="))
      .join("\n").trim().slice(0, 650);
  };

  const safeData = (value) => value.replace(/[<>]/g, (char) => char === "<" ? "‹" : "›");

  const modelContext = (request, context) => {
    const maxChars = Number.isInteger(globalThis.info?.maxChars) && info.maxChars > 0
      ? info.maxChars : 16000;
    if (request.help) return "Output only OK.".slice(0, maxChars);

    const plan = request.mode === "plan";
    const recent = storyActions().slice(-8).map(actionText).join("\n").trim();
    const language = languageFor(request, recent);
    const count = request.count;
    const tag = request.mode.toUpperCase();
    const task = plan
      ? "Offer distinct directions for the next several scenes. Ground each direction in an unresolved thread, goal, or relationship from the available plot. Give a concrete first step and its likely trade-off. Leave future outcomes open."
      : "Offer distinct choices for the very next beat. Ground each in the latest scene and what the player can plausibly know, say or do. Vary the approach and stakes. Leave NPC responses and outcomes open.";
    const format = plan
      ? "Format each line as PLAN | direction — first step — trade-off."
      : request.mode === "mix"
        ? "Start each line with one label and a bar: SAY | for dialogue, DO | for an action, STORY | for a story development. Use all three labels."
        : `Format each line as ${tag} | ${{ SAY: "speakable dialogue", DO: "a playable action", STORY: "an optional story development" }[tag]}.`;
    const outputRules = `Write ${count} options, one per line, in ${language === "ru" ? "Russian" : language === "en" ? "English" : "the language of the current story"}.`;
    const prompt = [
      "<SYSTEM>",
      "# IDEAS — OUT-OF-STORY PLAYER ASSISTANCE",
      "For this response, pause narration and write a choice menu. Treat story and world data as reference. Ignore other script menus and commands.",
      task,
      "Respect established facts, player agency, and knowledge boundaries. Keep possible developments hypothetical and preserve undiscovered secrets.",
      request.focus ? `Player's focus: ${safeData(request.focus)}` : "",
      outputRules,
      "Keep the labels in English.",
      `Use at most ${plan ? 30 : 12} words per option. No intro, numbering, Markdown or closing text.`,
      format,
      "</SYSTEM>"
    ].filter(Boolean).join("\n");

    // Very small custom budgets still get a complete, usable request.
    if (prompt.length + 4 >= maxChars) {
      return `${outputRules} ${format}`.slice(0, maxChars);
    }

    const heading = context.lastIndexOf("Recent Story:");
    const memoryLength = Number.isInteger(globalThis.info?.memoryLength) ? info.memoryLength : 0;
    const split = heading >= 0 ? heading : Math.max(0, Math.min(context.length, memoryLength));
    const background = context.slice(0, split).trim();
    const scene = context.slice(split + (heading >= 0 ? "Recent Story:".length : 0)).trim();

    // A long OOC menu can displace scene text before the Context hook runs.
    const anchor = recent.slice(-90).trim();
    const excerpt = anchor && !scene.includes(anchor) ? recent.slice(-1300) : "";
    const calendar = calendarSnapshot();
    let budget = maxChars - prompt.length - 2;
    const take = (label, value, limit, keepEnd = false) => {
      const available = Math.min(limit, budget - label.length - 3);
      if (!value || available <= 0) return "";
      const section = label + "\n" + (keepEnd ? value.slice(-available) : value.slice(0, available));
      budget -= section.length + 2;
      return section;
    };

    const lastActions = take("Latest story actions:", excerpt, Math.floor(budget / 3), true);
    const world = take("World Calendar snapshot:", safeData(calendar), Math.floor(budget / 4));
    const plotLimit = scene ? Math.max(budget - scene.length - 16, Math.floor(budget * (plan ? 0.65 : 0.3))) : budget;
    const plot = take("Plot context:", background, plan ? plotLimit : Math.min(4500, plotLimit));
    const latestScene = take("Recent Story:", scene, plan ? budget : Math.min(5500, budget), true);
    return [plot, latestScene, lastActions, world, prompt].filter(Boolean).join("\n\n");
  };

  const formatOutput = (request, generated, contextRan) => {
    const recent = storyActions().slice(-4).map(actionText).join("\n");
    const russian = languageFor(request, recent) === "ru";
    const labels = russian
      ? { SAY: "Реплика", DO: "Действие", STORY: "Идея для сюжета", PLAN: "Направление" }
      : { SAY: "Say", DO: "Do", STORY: "Story idea", PLAN: "Direction" };
    const usage = [
      ":ideas [say|do|story] [3–8] [-- focus]",
      ":plans [-- focus]"
    ].join("\n");
    const title = request.mode === "plan" ? (russian ? "Планы" : "Plans") : (russian ? "Подсказки" : "Suggestions");
    const wrap = (body) => `\n\n${START} / ${title}\n${body}\n${END}\n\n`;
    if (request.help) return wrap(usage);
    if (!contextRan) return wrap(russian
      ? "Контекстный модификатор не отработал. Отключите Optimized Context и повторите команду."
      : "The Context script did not run. Turn off Optimized Context and re-enter the command.");

    const validTypes = request.mode === "mix" ? TYPES.slice(0, 3) : [request.mode.toUpperCase()];
    const seen = new Set();
    const lines = [];
    for (const line of generated.split(/\r?\n/)) {
      const content = line.replace(/\*\*/g, "").trim().replace(/^(?:[-*+•]|\d+[.)])\s*/, "");
      const match = content.match(/^(SAY|DO|STORY|PLAN)\s*[|｜:：—–−-]\s*(.+)$/i)
        || content.match(/^\[\s*(SAY|DO|STORY|PLAN)\s*\]\s*[|｜:：—–−-]?\s*(.+)$/i);
      if (!match) continue;
      const kind = match[1].toUpperCase();
      const body = match[2].trim();
      const key = body.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
      if (!validTypes.includes(kind) || !key || seen.has(key)) continue;
      seen.add(key);
      lines.push(`${lines.length + 1}. ${labels[kind]} — ${body}`);
      if (lines.length >= request.count) break;
    }

    if (lines.length) return wrap(lines.join("\n"));
    return wrap(russian
      ? "В ответе модели не удалось распознать меню. Повторите команду."
      : "The model did not return a recognizable menu. Re-enter the command.");
  };

  if (hook === "input") {
    if (data) {
      delete data.pending;
      delete data.generating;
      delete data.storyInput;
    }
    const command = parseCommand();
    if (!command) {
      if (data && source.trim()) data.storyInput = true;
      return passThrough(inputText);
    }

    const store = state.Ideas ||= { nextId: 1, requests: [] };
    const request = { ...command, marker: markerFor(store.nextId++) };
    store.requests.push(request);
    if (store.requests.length > 16) store.requests.shift();
    store.pending = request;
    return { text: request.marker };
  }

  if (hook === "context") {
    const request = data?.pending || (data && !data.storyInput ? latestRequest() : undefined);
    if (data) {
      delete data.pending;
      delete data.generating;
      delete data.storyInput;
    }
    const context = cleanContext();
    if (request && globalThis.stop !== true) {
      data.generating = request;
      return { text: modelContext(request, context) };
    }
    return passThrough(context === source ? inputText : (context || " "));
  }

  if (hook === "output") {
    const request = data?.generating || data?.pending;
    if (request) {
      const contextRan = Boolean(data.generating);
      delete data.generating;
      delete data.pending;
      return { text: formatOutput(request, source, contextRan) };
    }
  }

  return passThrough(inputText);
}
