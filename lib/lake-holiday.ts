import {
  DEFAULT_FILTERS,
  EMPTY_WORKSPACE,
  type Filters,
  type RuleSet,
  type Workspace,
  type SavedSearch,
  type Listing,
} from "./types";
export const LAKE_HOLIDAY = {
  name: "Home · Lake Holiday, IL",
  lat: 41.6180404,
  lng: -88.6682705,
};
export const LAKE_RULES_URL =
  "https://swansonrealestate.net/wp-content/uploads/2025/06/Rules-Regs-2024-Lake-Holiday.pdf";
export const LAKE_HOLIDAY_RULE: RuleSet = {
  id: "lake-holiday-il-length",
  name: "Lake Holiday IL · under 21 ft (screening)",
  maxLength: 21,
  maxLengthExclusive: true,
  excludeUnknown: true,
};
export const FISHING_MAKES = [
  "Lund",
  "Ranger",
  "Bass Cat",
  "BassCat",
  "Skeeter",
  "Phoenix",
  "Falcon",
  "Triton",
  "Vexus",
  "Caymas",
  "Warrior",
  "Crestliner",
  "Alumacraft",
  "Nitro",
];
export const SKI_MAKES = [
  "MasterCraft",
  "Nautique",
  "Malibu",
  "Supra",
  "Moomba",
  "Tige",
  "Centurion",
  "Sanger",
  "Axis",
];
const nearby = {
  id: "lake-holiday-nearby",
  name: "Within 150 mi of Lake Holiday",
  kind: "radius" as const,
  lat: LAKE_HOLIDAY.lat,
  lng: LAKE_HOLIDAY.lng,
  radius: 150,
};
export const LAKE_HOLIDAY_FILTERS: Filters = {
  ...DEFAULT_FILTERS,
  reference: LAKE_HOLIDAY,
  sort: "distance",
  areas: [nearby],
  excludeUnknownLocation: true,
  ruleSet: LAKE_HOLIDAY_RULE,
  criteria: {
    status: { values: ["active"] },
    make: { values: [...FISHING_MAKES, ...SKI_MAKES], excludeUnknown: true },
    horsepower: { min: 200 },
    length: { min: 18 },
    category: {
      values: [
        "Bass",
        "Deep-V / multi-species",
        "Walleye",
        "Aluminum fishing",
        "Fiberglass fishing",
        "Ski / wake / surf",
      ],
    },
  },
};
export const LAKE_SEARCHES: SavedSearch[] = [
  {
    id: "holiday-nearby",
    name: "Lake Holiday · nearby picks",
    filters: LAKE_HOLIDAY_FILTERS,
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
  {
    id: "holiday-fishing",
    name: "Fishing · 200+ hp · nearby",
    filters: {
      ...LAKE_HOLIDAY_FILTERS,
      criteria: {
        status: { values: ["active"] },
        make: { values: FISHING_MAKES, excludeUnknown: true },
        horsepower: { min: 200, excludeUnknown: true },
      },
    },
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
  {
    id: "holiday-ski",
    name: "MasterCraft & peers · under 21 ft",
    filters: {
      ...LAKE_HOLIDAY_FILTERS,
      criteria: {
        status: { values: ["active"] },
        make: { values: SKI_MAKES, excludeUnknown: true },
        category: { values: ["Ski / wake / surf"], excludeUnknown: true },
      },
    },
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
  {
    id: "holiday-expanded",
    name: "Wider search · within 250 mi",
    filters: {
      ...LAKE_HOLIDAY_FILTERS,
      areas: [
        {
          ...nearby,
          id: "holiday-250",
          name: "Within 250 mi of Lake Holiday",
          radius: 250,
        },
      ],
    },
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
  {
    id: "holiday-review",
    name: "Include unknown lengths · verify first",
    filters: {
      ...LAKE_HOLIDAY_FILTERS,
      ruleSet: {
        ...LAKE_HOLIDAY_RULE,
        id: "holiday-length-review",
        name: "Under 21 ft or length unreported · verify",
        excludeUnknown: false,
      },
    },
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
  {
    id: "holiday-all-nearby",
    name: "All nearby ads · no lake screen",
    filters: {
      ...DEFAULT_FILTERS,
      reference: LAKE_HOLIDAY,
      sort: "distance",
      areas: [nearby],
      excludeUnknownLocation: true,
    },
    cadence: "off",
    channels: ["in-app"],
    digest: true,
  },
];
export function lakeHolidayWorkspace(): Workspace {
  return {
    ...EMPTY_WORKSPACE,
    favorites: [],
    notes: {},
    alerts: [],
    rules: [LAKE_HOLIDAY_RULE],
    savedSearches: LAKE_SEARCHES,
    referencePoints: [
      LAKE_HOLIDAY,
      { name: "Wheaton, IL", lat: 41.8661, lng: -88.107 },
    ],
  };
}
export function lakeLengthStatus(boat: Listing) {
  if (boat.length == null) return "Length unknown · verify with seller";
  if (boat.length >= 21) return "Outside the under-21-ft screen";
  return "Under 21 ft as listed · confirm measurement";
}
