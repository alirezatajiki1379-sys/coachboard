import type { PitchBackground } from "@/types/domain";

export type DrillEditorObjectType =
  | "player"
  | "goalkeeper"
  | "coach"
  | "cone"
  | "marker"
  | "ball"
  | "ring"
  | "bib"
  | "pole"
  | "mannequin"
  | "goal"
  | "mini_goal"
  | "text"
  | "arrow";

export type DrillEditorLineStyle = "solid" | "dashed" | "slalom";
export type DrillEditorPitchStyle = "Plain green" | "Striped green";
export type DrillEditorAnchorType = "marker" | "line-endpoint";
export type DrillEditorEndpoint = "start" | "end";

export type DrillEditorObject = {
  id: string;
  type: DrillEditorObjectType;
  x: number;
  y: number;
  rotation: number;
  color: string;
  label?: string;
  number?: string;
  name?: string;
  variant?: string;
  showBackground?: boolean;
  width?: number;
  height?: number;
  points?: number[];
  endX?: number;
  endY?: number;
  controlX?: number;
  controlY?: number;
  scale?: number;
  thickness?: number;
  lineStyle?: DrillEditorLineStyle;
  arrowHead?: boolean;
  curveEdited?: boolean;
  mirrored?: boolean;
  startAnchorType?: DrillEditorAnchorType;
  startAnchorObjectId?: string;
  startAnchorEndpoint?: DrillEditorEndpoint;
  startAnchorOffsetX?: number;
  startAnchorOffsetY?: number;
  endAnchorType?: DrillEditorAnchorType;
  endAnchorObjectId?: string;
  endAnchorEndpoint?: DrillEditorEndpoint;
  endAnchorOffsetX?: number;
  endAnchorOffsetY?: number;
};

export type DrillEditorState = {
  version: 1;
  pitch: Extract<PitchBackground, "Full football pitch" | "Half pitch" | "Empty grid"> | "Empty field / blank";
  pitchStyle: DrillEditorPitchStyle;
  objects: DrillEditorObject[];
};

export const defaultEditorState: DrillEditorState = {
  version: 1,
  pitch: "Full football pitch",
  pitchStyle: "Plain green",
  objects: []
};
