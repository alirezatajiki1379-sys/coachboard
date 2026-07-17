import type { Json } from "@/types/database";
import { defaultEditorState, type DrillEditorAnchorType, type DrillEditorEndpoint, type DrillEditorLineStyle, type DrillEditorObject, type DrillEditorPitchStyle, type DrillEditorState } from "@/types/editor";

const supportedPitches = ["Full football pitch", "Half pitch", "Empty grid", "Empty field / blank"] as const;
const supportedPitchStyles = ["Plain green", "Striped green"] as const;
const supportedTypes = [
  "player",
  "goalkeeper",
  "coach",
  "cone",
  "marker",
  "ball",
  "ring",
  "bib",
  "pole",
  "mannequin",
  "goal",
  "mini_goal",
  "text",
  "arrow"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function defaultShowBackground(type: unknown, value: unknown) {
  if (typeof value === "boolean") return value;
  return type !== "text";
}

function lineStyleValue(value: unknown): DrillEditorLineStyle {
  return value === "dashed" || value === "slalom" || value === "solid" ? value : "solid";
}

function pitchStyleValue(value: unknown): DrillEditorPitchStyle {
  return supportedPitchStyles.includes(value as DrillEditorPitchStyle) ? (value as DrillEditorPitchStyle) : defaultEditorState.pitchStyle;
}

function anchorTypeValue(value: unknown): DrillEditorAnchorType | undefined {
  return value === "marker" || value === "line-endpoint" ? value : undefined;
}

function endpointValue(value: unknown): DrillEditorEndpoint | undefined {
  return value === "start" || value === "end" ? value : undefined;
}

function defaultWidthForType(type: DrillEditorObject["type"]) {
  if (type === "goal") return 120;
  if (type === "mini_goal") return 48;
  return 72;
}

function defaultHeightForType(type: DrillEditorObject["type"]) {
  if (type === "goal") return 60;
  if (type === "mini_goal") return 24;
  return 36;
}

export function parseEditorState(value: unknown): DrillEditorState {
  if (!isRecord(value)) return defaultEditorState;

  const pitch = value.pitch === "Penalty area"
    ? "Half pitch"
    : supportedPitches.includes(value.pitch as DrillEditorState["pitch"])
    ? (value.pitch as DrillEditorState["pitch"])
    : defaultEditorState.pitch;
  const pitchStyle = pitchStyleValue(value.pitchStyle);

  const objects = Array.isArray(value.objects)
    ? value.objects
        .filter(isRecord)
        .map((object): DrillEditorObject | null => {
          if (!supportedTypes.includes(object.type as DrillEditorObject["type"])) return null;
          const x = numberValue(object.x, 120);
          const y = numberValue(object.y, 120);
          const points = Array.isArray(object.points)
            ? object.points.filter((point): point is number => typeof point === "number")
            : undefined;
          const fallbackEndX = points && points.length >= 4 ? x + points[2] : x + 120;
          const fallbackEndY = points && points.length >= 4 ? y + points[3] : y;
          const endX = numberValue(object.endX, fallbackEndX);
          const endY = numberValue(object.endY, fallbackEndY);
          const fallbackControlX = (x + endX) / 2;
          const fallbackControlY = (y + endY) / 2;
          const type = object.type as DrillEditorObject["type"];
          return {
            id: stringValue(object.id) ?? crypto.randomUUID(),
            type,
            x,
            y,
            rotation: numberValue(object.rotation, 0),
            color: stringValue(object.color) ?? "#2563eb",
            label: stringValue(object.label),
            number: stringValue(object.number),
            name: stringValue(object.name),
            variant: stringValue(object.variant),
            showBackground: defaultShowBackground(object.type, object.showBackground),
            width: numberValue(object.width, defaultWidthForType(type)),
            height: numberValue(object.height, defaultHeightForType(type)),
            points,
            endX,
            endY,
            controlX: numberValue(object.controlX, fallbackControlX),
            controlY: numberValue(object.controlY, fallbackControlY),
            scale: numberValue(object.scale, 1),
            thickness: clampNumber(Math.round(numberValue(object.thickness, 5)), 1, 10),
            lineStyle: lineStyleValue(object.lineStyle),
            arrowHead: booleanValue(object.arrowHead, true),
            curveEdited: booleanValue(object.curveEdited, false),
            mirrored: booleanValue(object.mirrored, false),
            groupId: stringValue(object.groupId),
            startAnchorType: anchorTypeValue(object.startAnchorType),
            startAnchorObjectId: stringValue(object.startAnchorObjectId),
            startAnchorEndpoint: endpointValue(object.startAnchorEndpoint),
            startAnchorOffsetX: numberValue(object.startAnchorOffsetX, 0),
            startAnchorOffsetY: numberValue(object.startAnchorOffsetY, 0),
            endAnchorType: anchorTypeValue(object.endAnchorType),
            endAnchorObjectId: stringValue(object.endAnchorObjectId),
            endAnchorEndpoint: endpointValue(object.endAnchorEndpoint),
            endAnchorOffsetX: numberValue(object.endAnchorOffsetX, 0),
            endAnchorOffsetY: numberValue(object.endAnchorOffsetY, 0)
          };
        })
        .filter((object): object is DrillEditorObject => object !== null)
    : [];

  return {
    version: 1,
    pitch,
    pitchStyle,
    objects
  };
}

export function editorStateToJson(state: DrillEditorState): Json {
  return state as unknown as Json;
}

export function parseEditorJsonString(value: string): DrillEditorState {
  if (!value.trim()) return defaultEditorState;
  try {
    return parseEditorState(JSON.parse(value));
  } catch {
    return defaultEditorState;
  }
}

export function editorStateToString(state: DrillEditorState): string {
  return JSON.stringify(state);
}
