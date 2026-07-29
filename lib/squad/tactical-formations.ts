import { canonicalPositionLabels, getPositionFamily, type PositionFamily } from "@/lib/squad/positions";

export type TacticalFormationCode =
  | "4-3-3"
  | "4-2-3-1"
  | "4-4-2"
  | "4-1-4-1"
  | "4-3-1-2"
  | "4-2-2-2"
  | "3-4-3"
  | "3-4-2-1"
  | "3-5-2"
  | "3-4-1-2"
  | "5-3-2"
  | "5-4-1"
  | "Custom";

export type TacticalSlotDefinition = {
  slotKey: string;
  code: string;
  label: string;
  family: PositionFamily;
  x: number;
  y: number;
  naturalPositions: string[];
  compatiblePositions: string[];
  acceptedPositions: string[];
  sortOrder: number;
};

export type TacticalFormationDefinition = {
  code: TacticalFormationCode;
  name: string;
  slots: TacticalSlotDefinition[];
};

const roleAcceptedPositions: Record<string, string[]> = {
  GK: ["GK"],
  RB: ["RB", "RWB", "CB"],
  LB: ["LB", "LWB", "CB"],
  CB: ["CB", "RB", "LB"],
  RCB: ["CB", "RB"],
  LCB: ["CB", "LB"],
  CCB: ["CB"],
  RWB: ["RWB", "RB", "RM", "RW"],
  LWB: ["LWB", "LB", "LM", "LW"],
  CDM: ["CDM", "CM", "CB"],
  RDM: ["CDM", "CM"],
  LDM: ["CDM", "CM"],
  CM: ["CM", "CDM", "CAM"],
  RCM: ["CM", "CDM", "RM"],
  LCM: ["CM", "CDM", "LM"],
  CAM: ["CAM", "CM", "SS"],
  RAM: ["CAM", "RW", "RM"],
  LAM: ["CAM", "LW", "LM"],
  RM: ["RM", "RW", "RB", "RWB"],
  LM: ["LM", "LW", "LB", "LWB"],
  RW: ["RW", "RM", "ST"],
  LW: ["LW", "LM", "ST"],
  SS: ["SS", "CAM", "ST"],
  ST: ["ST", "SS"],
  RST: ["ST", "SS", "RW"],
  LST: ["ST", "SS", "LW"]
};

const roleNaturalPositions: Record<string, string[]> = {
  GK: ["GK"],
  RB: ["RB"],
  LB: ["LB"],
  CB: ["CB"],
  RCB: ["CB"],
  LCB: ["CB"],
  CCB: ["CB"],
  RWB: ["RWB"],
  LWB: ["LWB"],
  CDM: ["CDM"],
  RDM: ["CDM"],
  LDM: ["CDM"],
  CM: ["CM"],
  RCM: ["CM"],
  LCM: ["CM"],
  CAM: ["CAM"],
  RAM: ["CAM"],
  LAM: ["CAM"],
  RM: ["RM"],
  LM: ["LM"],
  RW: ["RW"],
  LW: ["LW"],
  SS: ["SS"],
  ST: ["ST"],
  RST: ["ST"],
  LST: ["ST"]
};

const roleLabels: Record<string, string> = {
  RCB: "Right Centre Back",
  LCB: "Left Centre Back",
  CCB: "Centre Back",
  RDM: "Right Defensive Midfielder",
  LDM: "Left Defensive Midfielder",
  RCM: "Right Central Midfielder",
  LCM: "Left Central Midfielder",
  RAM: "Right Attacking Midfielder",
  LAM: "Left Attacking Midfielder",
  RST: "Right Striker",
  LST: "Left Striker"
};

function slot(slotKey: string, code: string, x: number, y: number, sortOrder: number): TacticalSlotDefinition {
  const baseCode = roleAcceptedPositions[code] ? code : code.replace(/^[RLC]/, "");
  const acceptedPositions = roleAcceptedPositions[code] ?? roleAcceptedPositions[baseCode] ?? [code];
  const naturalPositions = roleNaturalPositions[code] ?? roleNaturalPositions[baseCode] ?? [acceptedPositions[0]];
  const compatiblePositions = acceptedPositions.filter((position) => !naturalPositions.includes(position));
  const canonicalCode = acceptedPositions[0];

  return {
    slotKey,
    code,
    label: roleLabels[code] ?? canonicalPositionLabels[code] ?? code,
    family: getPositionFamily(canonicalCode),
    x,
    y,
    naturalPositions,
    compatiblePositions,
    acceptedPositions,
    sortOrder
  };
}

function formation(code: TacticalFormationCode, rows: Array<Array<[string, number]>>): TacticalFormationDefinition {
  let order = 0;
  const slots = [
    slot("gk", "GK", 50, 90, order++),
    ...rows.flatMap((row, rowIndex) => {
      const y = [75, 56, 37, 20][rowIndex] ?? 50;
      return row.map(([roleCode, x], index) => slot(`${rowIndex + 1}-${index}-${roleCode.toLowerCase()}`, roleCode, x, y, order++));
    })
  ];
  return { code, name: code, slots };
}

export const tacticalFormations: TacticalFormationDefinition[] = [
  formation("4-3-3", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LCM", 30], ["CDM", 50], ["RCM", 70]],
    [["LW", 22], ["ST", 50], ["RW", 78]]
  ]),
  formation("4-2-3-1", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LDM", 40], ["RDM", 60]],
    [["LM", 22], ["CAM", 50], ["RM", 78]],
    [["ST", 50]]
  ]),
  formation("4-4-2", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LM", 18], ["LCM", 40], ["RCM", 60], ["RM", 82]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("4-1-4-1", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["CDM", 50]],
    [["LM", 18], ["LCM", 40], ["RCM", 60], ["RM", 82]],
    [["ST", 50]]
  ]),
  formation("4-3-1-2", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LCM", 30], ["CDM", 50], ["RCM", 70]],
    [["CAM", 50]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("4-2-2-2", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LDM", 40], ["RDM", 60]],
    [["LAM", 35], ["RAM", 65]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("3-4-3", [
    [["LCB", 28], ["CCB", 50], ["RCB", 72]],
    [["LM", 18], ["LCM", 40], ["RCM", 60], ["RM", 82]],
    [["LW", 22], ["ST", 50], ["RW", 78]]
  ]),
  formation("3-4-2-1", [
    [["LCB", 28], ["CCB", 50], ["RCB", 72]],
    [["LWB", 15], ["LCM", 40], ["RCM", 60], ["RWB", 85]],
    [["LAM", 38], ["RAM", 62]],
    [["ST", 50]]
  ]),
  formation("3-5-2", [
    [["LCB", 28], ["CCB", 50], ["RCB", 72]],
    [["LWB", 12], ["LCM", 34], ["CDM", 50], ["RCM", 66], ["RWB", 88]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("3-4-1-2", [
    [["LCB", 28], ["CCB", 50], ["RCB", 72]],
    [["LWB", 15], ["LCM", 40], ["RCM", 60], ["RWB", 85]],
    [["CAM", 50]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("5-3-2", [
    [["LWB", 10], ["LCB", 30], ["CCB", 50], ["RCB", 70], ["RWB", 90]],
    [["LCM", 34], ["CDM", 50], ["RCM", 66]],
    [["LST", 42], ["RST", 58]]
  ]),
  formation("5-4-1", [
    [["LWB", 10], ["LCB", 30], ["CCB", 50], ["RCB", 70], ["RWB", 90]],
    [["LM", 18], ["LCM", 40], ["RCM", 60], ["RM", 82]],
    [["ST", 50]]
  ]),
  formation("Custom", [
    [["LB", 15], ["LCB", 37], ["RCB", 63], ["RB", 85]],
    [["LCM", 34], ["RCM", 66]],
    [["CAM", 50]],
    [["LST", 42], ["RST", 58]]
  ])
];

export const tacticalFormationCodes = tacticalFormations.map((formationItem) => formationItem.code);

export function getTacticalFormation(code?: string) {
  return tacticalFormations.find((formationItem) => formationItem.code === code) ?? tacticalFormations[0];
}
