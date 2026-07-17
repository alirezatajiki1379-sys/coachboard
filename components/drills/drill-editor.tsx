"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Konva from "konva";
import { ArrowRight, Circle, Copy, Goal, MousePointer2, Plus, Trash2 } from "lucide-react";
import { Arrow, Circle as KonvaCircle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { Button } from "@/components/ui/button";
import { SvgIcon } from "@/components/drills/svg-icon";
import { createClient } from "@/lib/supabase/client";
import type { SvgIconKey } from "@/lib/editor/svg-icons";
import {
  defaultEditorState,
  type DrillEditorObject,
  type DrillEditorObjectType,
  type DrillEditorState
} from "@/types/editor";
import { editorStateToString, parseEditorJsonString } from "@/lib/drills/editor";
import type { Database, Json } from "@/types/database";

const stageWidth = 820;
const stageHeight = 520;
const colors = ["#2563eb", "#dc2626", "#f59e0b", "#16a34a", "#ffffff", "#111827", "#f97316", "#9333ea"];
const minObjectScale = 0.1;
const maxObjectScale = 4;
const pitchOverviewPadding = 18;
const defaultLineThicknessLevel = 2;
const slalomWaveAmplitude = 5;
const objectBaseSizeFactor = 0.7;
const editorHistoryLimit = 50;

const templateBoundaryColor = "#f59e0b";

export const drillGraphicTemplates: DrillGraphicTemplate[] = [
  {
    id: "funino-4-mini-goals",
    name: "Funino field",
    description: "Four mini goals, corner markers and field boundary.",
    tags: ["game", "mini goals", "setup"],
    source: "built-in",
    objects: [
      miniGoalTemplate(-150, -46, 90),
      miniGoalTemplate(-150, 46, 90),
      miniGoalTemplate(150, -46, 270),
      miniGoalTemplate(150, 46, 270),
      markerTemplate(-130, -82, "#facc15"),
      markerTemplate(130, -82, "#facc15"),
      markerTemplate(130, 82, "#facc15"),
      markerTemplate(-130, 82, "#facc15"),
      boundaryLineTemplate(-130, -82, 130, -82),
      boundaryLineTemplate(130, -82, 130, 82),
      boundaryLineTemplate(130, 82, -130, 82),
      boundaryLineTemplate(-130, 82, -130, -82),
      boundaryLineTemplate(0, -82, 0, 82, "#ffffff", "dashed")
    ]
  },
  {
    id: "passing-square",
    name: "Passing square",
    description: "Four cones with a square passing lane.",
    tags: ["passing", "cones"],
    source: "built-in",
    objects: [
      coneTemplate(-75, -75, "#f97316"),
      coneTemplate(75, -75, "#f97316"),
      coneTemplate(75, 75, "#f97316"),
      coneTemplate(-75, 75, "#f97316"),
      boundaryLineTemplate(-75, -75, 75, -75, "#2563eb", "dashed"),
      boundaryLineTemplate(75, -75, 75, 75, "#2563eb", "dashed"),
      boundaryLineTemplate(75, 75, -75, 75, "#2563eb", "dashed"),
      boundaryLineTemplate(-75, 75, -75, -75, "#2563eb", "dashed")
    ]
  },
  {
    id: "one-v-one-corridor",
    name: "1v1 corridor",
    description: "Narrow channel with mini goals and lane markers.",
    tags: ["1v1", "corridor"],
    source: "built-in",
    objects: [
      miniGoalTemplate(-130, 0, 90),
      miniGoalTemplate(130, 0, 270),
      coneTemplate(-95, -38, "#dc2626"),
      coneTemplate(95, -38, "#dc2626"),
      coneTemplate(95, 38, "#dc2626"),
      coneTemplate(-95, 38, "#dc2626"),
      boundaryLineTemplate(-95, -38, 95, -38),
      boundaryLineTemplate(-95, 38, 95, 38),
      boundaryLineTemplate(0, -38, 0, 38, "#ffffff", "dashed")
    ]
  },
  {
    id: "rondo-square",
    name: "Rondo square",
    description: "Compact marker square for rondos and possession games.",
    tags: ["rondo", "markers"],
    source: "built-in",
    objects: [
      markerTemplate(-75, -75, "#ffffff"),
      markerTemplate(0, -75, "#ffffff"),
      markerTemplate(75, -75, "#ffffff"),
      markerTemplate(75, 0, "#ffffff"),
      markerTemplate(75, 75, "#ffffff"),
      markerTemplate(0, 75, "#ffffff"),
      markerTemplate(-75, 75, "#ffffff"),
      markerTemplate(-75, 0, "#ffffff"),
      boundaryLineTemplate(-75, -75, 75, -75, "#ffffff", "dashed"),
      boundaryLineTemplate(75, -75, 75, 75, "#ffffff", "dashed"),
      boundaryLineTemplate(75, 75, -75, 75, "#ffffff", "dashed"),
      boundaryLineTemplate(-75, 75, -75, -75, "#ffffff", "dashed")
    ]
  },
  {
    id: "empty-cone-grid",
    name: "Cone grid",
    description: "Nine cones for quick grid or station setup.",
    tags: ["cones", "grid"],
    source: "built-in",
    objects: [-60, 0, 60].flatMap((x) => [-60, 0, 60].map((y) => coneTemplate(x, y, "#f59e0b")))
  }
];

type DrillEditorProps = {
  name?: string;
  initialValue?: string;
  onDirty?: () => void;
};

type LineTool = "solid" | "dashed" | "slalom";
type ActiveTool = "select" | LineTool;
type AddableObjectType = Exclude<DrillEditorObjectType, "arrow">;
type DragEvent = {
  cancelBubble?: boolean;
  target: { x: { (): number; (value: number): void }; y: { (): number; (value: number): void } };
};
type DragPointEvent = {
  cancelBubble?: boolean;
  target: {
    x: () => number;
    y: () => number;
    getStage?: () => {
      getPointerPosition: () => { x: number; y: number } | null;
    } | null;
  };
};
type SelectEvent = {
  cancelBubble?: boolean;
  evt?: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    clientX?: number;
    clientY?: number;
    preventDefault?: () => void;
  };
};
type StagePointerEvent = {
  target: {
    getStage: () => {
      getPointerPosition: () => { x: number; y: number } | null;
    } | null;
  };
};
type CanvasPointerEvent = {
  target: {
    getStage?: () => {
      getPointerPosition: () => { x: number; y: number } | null;
    } | null;
  };
};
type EditableField = "label" | "name" | "number";
type TextEditState = {
  id: string;
  field: EditableField;
  value: string;
  x: number;
  y: number;
  width: number;
};

type SelectionBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};
type ContextMenuState = {
  x: number;
  y: number;
  selectedIds: string[];
} | null;

type AlignmentGuide =
  | { type: "vertical"; x: number; variant: "align" }
  | { type: "horizontal"; y: number; variant: "align" }
  | { type: "spacing"; orientation: "horizontal" | "vertical"; points: [number, number, number, number]; label: string; labelX: number; labelY: number }
  | { type: "distance"; points: [number, number, number, number]; label: string; labelX: number; labelY: number }
  | { type: "angle"; points: [number, number, number, number]; label: string; labelX: number; labelY: number }
  | { type: "length"; label: string; labelX: number; labelY: number };
type AngleGuide = Extract<AlignmentGuide, { type: "angle" }>;

type RotationGuide = {
  x: number;
  y: number;
  label: string;
};

type EditorBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type DrillGraphicTemplateObject = Omit<DrillEditorObject, "id">;
type DrillGraphicTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  objects: DrillGraphicTemplateObject[];
  source: "built-in" | "user";
  createdAt?: string;
};

type StoredTemplateJson = {
  version: 1;
  objects: DrillGraphicTemplateObject[];
  pitch?: DrillEditorState["pitch"];
  pitchStyle?: DrillEditorState["pitchStyle"];
};

type TemplateRow = {
  id: string;
  name: string;
  template_json: Json;
  created_at: string | null;
};
type DatabaseTemplateInsert = Database["public"]["Tables"]["drill_graphic_templates"]["Insert"];
type DatabaseTemplateUpdate = Database["public"]["Tables"]["drill_graphic_templates"]["Update"];

type LineAnchor =
  | { type: "marker"; objectId: string }
  | { type: "line-endpoint"; objectId: string; endpoint: "start" | "end" };

const drillEditorObjectTypes: DrillEditorObjectType[] = [
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
];

export function DrillEditor({ name = "graphicJson", initialValue, onDirty }: DrillEditorProps) {
  const initialState = useMemo(() => (initialValue ? parseEditorJsonString(initialValue) : defaultEditorState), [initialValue]);
  const [state, setState] = useState<DrillEditorState>(initialState);
  const stateRef = useRef<DrillEditorState>(initialState);
  const undoStackRef = useRef<DrillEditorState[]>([]);
  const redoStackRef = useRef<DrillEditorState[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboardObjects, setClipboardObjects] = useState<DrillEditorObject[]>([]);
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [draftLine, setDraftLine] = useState<DrillEditorObject | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [rotationGuide, setRotationGuide] = useState<RotationGuide | null>(null);
  const keyboardGuideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorFocusRef = useRef<HTMLDivElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);
  const liveDragRef = useRef<{
    movedId: string;
    baseX: number;
    baseY: number;
    selectedIds: string[];
    objects: Map<string, DrillEditorObject>;
    historyCaptured: boolean;
  } | null>(null);
  const groupRotationRef = useRef<{
    bounds: EditorBounds;
    center: { x: number; y: number };
    handlePoint: { x: number; y: number };
    startAngle: number;
    selectedIds: string[];
    objects: DrillEditorObject[];
  } | null>(null);
  const groupScaleRef = useRef<{
    bounds: EditorBounds;
    center: { x: number; y: number };
    handlePoint: { x: number; y: number };
    startDistance: number;
    selectedIds: string[];
    objects: DrillEditorObject[];
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [spawnIndex, setSpawnIndex] = useState(0);
  const [pasteIndex, setPasteIndex] = useState(0);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [lineConnectionsOpen, setLineConnectionsOpen] = useState(false);
  const [userTemplates, setUserTemplates] = useState<DrillGraphicTemplate[]>([]);
  const [templateStatus, setTemplateStatus] = useState<string>("");
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const zoomBase = useMemo(() => (typeof window !== "undefined" && window.innerWidth >= 1024 ? 1.5 : 1), []);
  const [zoom, setZoom] = useState(1);
  const actualZoom = zoom * zoomBase;
  const viewTransform = getViewTransform(state.pitch);
  const selectedId = selectedIds[0] ?? null;
  const selectedObject = state.objects.find((object) => object.id === selectedId);
  const selectedObjects = state.objects.filter((object) => selectedIds.includes(object.id));
  const selectedGroupBounds = selectedObjects.length > 1 ? objectsSelectionBounds(selectedObjects, state.objects) : null;
  const groupRotationBounds = groupRotationRef.current?.bounds ?? selectedGroupBounds;
  const groupRotationHandlePoint = groupRotationRef.current?.handlePoint;
  const selectedPersistentGroupIds = Array.from(new Set(selectedObjects.map((object) => object.groupId).filter((groupId): groupId is string => Boolean(groupId))));
  const showGroupProperties = selectedObjects.length > 1;

  useEffect(() => {
    stateRef.current = initialState;
    setState(initialState);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setSelectedIds([]);
    setDraftLine(null);
  }, [initialState]);

  useEffect(() => {
    setLineConnectionsOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu(event: KeyboardEvent | MouseEvent) {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setContextMenu(null);
    }
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("mousedown", closeMenu);
    return () => {
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("mousedown", closeMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    let active = true;

    async function loadUserTemplates() {
      setTemplatesLoading(true);
      setTemplateStatus("");
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("drill_graphic_templates")
          .select("id, name, template_json, created_at")
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (!active) return;
        setUserTemplates((data ?? []).map(templateFromRow).filter((template): template is DrillGraphicTemplate => Boolean(template)));
      } catch (error) {
        if (!active) return;
        setTemplateStatus(templateErrorMessage(error));
      } finally {
        if (active) setTemplatesLoading(false);
      }
    }

    loadUserTemplates();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (keyboardGuideTimeoutRef.current) clearTimeout(keyboardGuideTimeoutRef.current);
    };
  }, []);

  function captureHistorySnapshot() {
    undoStackRef.current = [...undoStackRef.current.slice(-(editorHistoryLimit - 1)), cloneEditorState(stateRef.current)];
    redoStackRef.current = [];
    onDirty?.();
  }

  function applyHistoryState(nextState: DrillEditorState) {
    const cloned = cloneEditorState(nextState);
    stateRef.current = cloned;
    setState(cloned);
    setSelectedIds((current) => current.filter((id) => cloned.objects.some((object) => object.id === id)));
    setDraftLine(null);
    setAlignmentGuides([]);
    setRotationGuide(null);
    liveDragRef.current = null;
    groupRotationRef.current = null;
    onDirty?.();
    focusEditorCanvas();
  }

  function undoEditorChange() {
    const previous = undoStackRef.current.at(-1);
    if (!previous) return;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [...redoStackRef.current.slice(-(editorHistoryLimit - 1)), cloneEditorState(stateRef.current)];
    applyHistoryState(previous);
  }

  function redoEditorChange() {
    const next = redoStackRef.current.at(-1);
    if (!next) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [...undoStackRef.current.slice(-(editorHistoryLimit - 1)), cloneEditorState(stateRef.current)];
    applyHistoryState(next);
  }

  function updateState(updater: (current: DrillEditorState) => DrillEditorState, options: { history?: boolean } = {}) {
    const current = stateRef.current;
    const next = updater(current);
    if (next === current) return;
    if (options.history !== false) {
      undoStackRef.current = [...undoStackRef.current.slice(-(editorHistoryLimit - 1)), cloneEditorState(current)];
      redoStackRef.current = [];
    }
    stateRef.current = next;
    onDirty?.();
    setState(next);
  }

  function addObject(type: AddableObjectType, point = nextSpawnPoint(), keepVisible = true) {
    const id = crypto.randomUUID();
    const base = { ...createObject(type, id), x: point.x, y: point.y };
    updateState((current) => ({ ...current, objects: [...current.objects, base] }));
    setSelectedIds([id]);
    setActiveTool("select");
    setSpawnIndex((current) => current + 1);
    if (keepVisible) ensureCanvasPointVisible(point);
    focusEditorCanvas();
  }

  function updateObject(id: string, patch: Partial<DrillEditorObject>, options?: { history?: boolean }) {
    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => (object.id === id ? { ...object, ...patch } : object))
    }), options);
  }

  function objectSelectionIds(object: DrillEditorObject, objects = state.objects) {
    return object.groupId ? objects.filter((candidate) => candidate.groupId === object.groupId).map((candidate) => candidate.id) : [object.id];
  }

  function expandIdsToGroups(ids: string[], objects = state.objects) {
    const expanded = new Set<string>();
    ids.forEach((id) => {
      const object = objects.find((candidate) => candidate.id === id);
      if (!object) return;
      objectSelectionIds(object, objects).forEach((selectionId) => expanded.add(selectionId));
    });
    return objects.filter((object) => expanded.has(object.id)).map((object) => object.id);
  }

  function selectEditorObject(object: DrillEditorObject, event?: SelectEvent) {
    if (event) event.cancelBubble = true;
    const ids = objectSelectionIds(object);
    const additive = Boolean(event?.evt?.metaKey || event?.evt?.ctrlKey || event?.evt?.shiftKey);
    setSelectedIds((current) => {
      if (!additive) return ids;
      const expandedCurrent = expandIdsToGroups(current);
      const allSelected = ids.every((id) => expandedCurrent.includes(id));
      return allSelected
        ? expandedCurrent.filter((id) => !ids.includes(id))
        : state.objects.filter((candidate) => expandedCurrent.includes(candidate.id) || ids.includes(candidate.id)).map((candidate) => candidate.id);
    });
    focusEditorCanvas();
  }

  function openEditorContextMenu(event: SelectEvent, object: DrillEditorObject) {
    event.evt?.preventDefault?.();
    event.cancelBubble = true;
    const objectIds = objectSelectionIds(object);
    const expandedSelection = expandIdsToGroups(selectedIds);
    const nextSelection = expandedSelection.includes(object.id) ? expandedSelection : objectIds;
    if (!expandedSelection.includes(object.id)) setSelectedIds(nextSelection);
    const rect = stageContainerRef.current?.getBoundingClientRect();
    const clientX = event.evt?.clientX ?? rect?.left ?? 0;
    const clientY = event.evt?.clientY ?? rect?.top ?? 0;
    const menuWidth = 190;
    const menuHeight = 300;
    const viewportWidth = typeof window === "undefined" ? clientX + menuWidth : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? clientY + menuHeight : window.innerHeight;
    setContextMenu({
      x: clamp(clientX, 8, Math.max(8, viewportWidth - menuWidth - 8)),
      y: clamp(clientY, 8, Math.max(8, viewportHeight - menuHeight - 8)),
      selectedIds: nextSelection
    });
  }

  function beginTextEdit(object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) {
    const rotation = ((object.rotation % 360) * Math.PI) / 180;
    const scale = object.scale ?? 1;
    const visualScale = object.type === "arrow" ? 1 : objectBaseSizeFactor;
    const rotatedX = localX * scale * visualScale * Math.cos(rotation) - localY * scale * visualScale * Math.sin(rotation);
    const rotatedY = localX * scale * visualScale * Math.sin(rotation) + localY * scale * visualScale * Math.cos(rotation);
    setSelectedIds([object.id]);
    setTextEdit({
      id: object.id,
      field,
      value: String(object[field] ?? ""),
      x: viewX(object.x + rotatedX, viewTransform) * actualZoom,
      y: viewY(object.y + rotatedY, viewTransform) * actualZoom,
      width: width * scale * visualScale * actualZoom
    });
  }

  function commitTextEdit() {
    if (!textEdit) return;
    updateObject(textEdit.id, { [textEdit.field]: textEdit.value });
    setTextEdit(null);
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    updateState((current) => ({
      ...current,
      objects: detachAnchorsForDeletedTargets(current.objects, selectedIds).filter((object) => !selectedIds.includes(object.id))
    }));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    pasteObjects(selectedObjects);
  }

  function copySelected() {
    if (!selectedObjects.length) return;
    setClipboardObjects(selectedObjects.map((object) => ({ ...object })));
  }

  function pasteClipboard() {
    pasteObjects(clipboardObjects);
  }

function pasteObjects(objectsToPaste: DrillEditorObject[]) {
    if (!objectsToPaste.length) return;
    const offset = nextPasteOffset();
    const copies = copyObjectsWithFreshGroups(objectsToPaste, offset.x, offset.y);
    updateState((current) => ({ ...current, objects: [...current.objects, ...copies] }));
    setSelectedIds(copies.map((object) => object.id));
    setPasteIndex((current) => current + 1);
    focusEditorCanvas();
  }

  function groupSelectedObjects() {
    const ids = expandIdsToGroups(selectedIds);
    if (ids.length < 2) return;
    const groupId = crypto.randomUUID();
    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!ids.includes(object.id)) return object;
        const prepared = object.type === "arrow" ? resolvedFreeLineObject(object, current.objects) : object;
        return { ...prepared, groupId };
      })
    }));
    setSelectedIds(ids);
    setContextMenu(null);
    focusEditorCanvas();
  }

  function ungroupSelectedObjects() {
    const groupIds = new Set(selectedObjects.map((object) => object.groupId).filter((groupId): groupId is string => Boolean(groupId)));
    if (!groupIds.size) return;
    const affectedIds = state.objects.filter((object) => object.groupId && groupIds.has(object.groupId)).map((object) => object.id);
    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => (object.groupId && groupIds.has(object.groupId) ? { ...object, groupId: undefined } : object))
    }));
    setSelectedIds(affectedIds);
    setContextMenu(null);
    focusEditorCanvas();
  }

  function isAddableObjectType(value: string): value is AddableObjectType {
    return [
      "player",
      "goalkeeper",
      "coach",
      "cone",
      "marker",
      "ring",
      "ball",
      "bib",
      "pole",
      "mannequin",
      "goal",
      "mini_goal",
      "text"
    ].includes(value);
  }

  function moveSelectedLayer(action: "forward" | "backward" | "front" | "back") {
    const ids = expandIdsToGroups(selectedIds);
    if (!ids.length) return;
    updateState((current) => {
      return { ...current, objects: moveLayerBlock(current.objects, ids, action) };
    });
    setContextMenu(null);
  }

  function clearCanvas() {
    if (!window.confirm("Clear all objects from this drill graphic?")) return;
    updateState((current) => ({ ...current, objects: [] }));
    setSelectedIds([]);
    setDraftLine(null);
  }

  function visibleCanvasCenter() {
    const container = stageContainerRef.current;
    if (!container) return inverseViewPoint({ x: stageWidth / 2, y: stageHeight / 2 }, viewTransform);
    return inverseViewPoint(
      {
        x: (container.scrollLeft + container.clientWidth / 2) / actualZoom,
        y: (container.scrollTop + container.clientHeight / 2) / actualZoom
      },
      viewTransform
    );
  }

  function nextSpawnPoint() {
    const center = visibleCanvasCenter();
    const offset = spawnOffset(spawnIndex);
    return clampCanvasPoint({ x: center.x + offset.x, y: center.y + offset.y });
  }

  function nextPasteOffset() {
    const offset = spawnOffset(pasteIndex + 1);
    return { x: offset.x || 24, y: offset.y || 24 };
  }

  function addObjectFromDrop(type: AddableObjectType, clientX: number, clientY: number) {
    const rect = stageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = inverseViewPoint({ x: (clientX - rect.left) / actualZoom, y: (clientY - rect.top) / actualZoom }, viewTransform);
    addObject(type, clampCanvasPoint(point), false);
  }

  function insertTemplate(template: DrillGraphicTemplate) {
    const center = visibleCanvasCenter();
    const objects = instantiateTemplateObjects(template, center);
    updateState((current) => ({ ...current, objects: [...current.objects, ...objects] }));
    setSelectedIds(objects.map((object) => object.id));
    setActiveTool("select");
    ensureTemplateVisible(objects);
    focusEditorCanvas();
  }

  function ensureTemplateVisible(objects: DrillEditorObject[]) {
    const bounds = templateObjectsBounds(objects);
    if (!bounds) return;
    ensureCanvasPointVisible({
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    });
  }

  async function saveSelectionAsTemplate() {
    if (!selectedObjects.length) {
      setTemplateStatus("Select objects first.");
      return;
    }

    const name = window.prompt("Template name");
    if (!name?.trim()) return;
    const templateJson = templateJsonFromSelection(selectedObjects, state);
    setTemplateStatus("Saving template...");

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You must be logged in to save templates.");

      const insertPayload: DatabaseTemplateInsert = {
        user_id: user.id,
        name: name.trim(),
        template_json: templateJsonToJson(templateJson)
      };
      const { data, error } = await supabase
        .from("drill_graphic_templates")
        .insert(insertPayload as never)
        .select("id, name, template_json, created_at")
        .single();
      if (error) throw error;

      const template = templateFromRow(data);
      if (template) setUserTemplates((current) => [template, ...current]);
      setTemplateStatus("Template saved.");
    } catch (error) {
      setTemplateStatus(templateErrorMessage(error));
    }
  }

  async function renameUserTemplate(template: DrillGraphicTemplate) {
    if (template.source !== "user") return;
    const nextName = window.prompt("Rename template", template.name);
    if (!nextName?.trim() || nextName.trim() === template.name) return;
    setTemplateStatus("Renaming template...");

    try {
      const supabase = createClient();
      const updatePayload: DatabaseTemplateUpdate = { name: nextName.trim() };
      const { data, error } = await supabase
        .from("drill_graphic_templates")
        .update(updatePayload as never)
        .eq("id", template.id)
        .select("id, name, template_json, created_at")
        .single();
      if (error) throw error;
      const renamed = templateFromRow(data);
      if (renamed) setUserTemplates((current) => current.map((item) => (item.id === template.id ? renamed : item)));
      setTemplateStatus("Template renamed.");
    } catch (error) {
      setTemplateStatus(templateErrorMessage(error));
    }
  }

  async function deleteUserTemplate(template: DrillGraphicTemplate) {
    if (template.source !== "user") return;
    if (!window.confirm(`Delete template "${template.name}"? Existing drills where it was inserted will not change.`)) return;
    setTemplateStatus("Deleting template...");

    try {
      const supabase = createClient();
      const { error } = await supabase.from("drill_graphic_templates").delete().eq("id", template.id);
      if (error) throw error;
      setUserTemplates((current) => current.filter((item) => item.id !== template.id));
      setTemplateStatus("Template deleted.");
    } catch (error) {
      setTemplateStatus(templateErrorMessage(error));
    }
  }

  function focusEditorCanvas() {
    window.setTimeout(() => editorFocusRef.current?.focus(), 0);
  }

  function ensureCanvasPointVisible(point: { x: number; y: number }) {
    const container = stageContainerRef.current;
    if (!container) return;
    const stagePoint = {
      x: viewX(point.x, viewTransform) * actualZoom,
      y: viewY(point.y, viewTransform) * actualZoom
    };
    const margin = 80;
    const minVisibleX = container.scrollLeft + margin;
    const maxVisibleX = container.scrollLeft + container.clientWidth - margin;
    const minVisibleY = container.scrollTop + margin;
    const maxVisibleY = container.scrollTop + container.clientHeight - margin;
    if (stagePoint.x >= minVisibleX && stagePoint.x <= maxVisibleX && stagePoint.y >= minVisibleY && stagePoint.y <= maxVisibleY) return;

    window.setTimeout(() => {
      container.scrollTo({
        left: clamp(stagePoint.x - container.clientWidth / 2, 0, Math.max(0, container.scrollWidth - container.clientWidth)),
        top: clamp(stagePoint.y - container.clientHeight / 2, 0, Math.max(0, container.scrollHeight - container.clientHeight)),
        behavior: "smooth"
      });
    }, 0);
  }

  function moveSelectedBy(dx: number, dy: number) {
    if (!selectedIds.length) return;
    const activeIds = expandIdsToGroups(selectedIds);
    if (activeIds.length === 1) {
      const selected = state.objects.find((object) => object.id === selectedIds[0]);
      if (selected && isSetupGuideObject(selected)) {
        updateState((current) => {
          const movements = new Map([[selected.id, { dx, dy }]]);
          return { ...current, objects: applyObjectMovements(current.objects, movements) };
        });
        showKeyboardAlignmentGuides({ ...selected, x: selected.x + dx, y: selected.y + dy });
        return;
      }
    }

    setAlignmentGuides([]);
    updateState((current) => {
      const movements = new Map(activeIds.map((id) => [id, { dx, dy }]));
      return { ...current, objects: applyObjectMovements(current.objects, movements) };
    });
  }

  function beginObjectDrag(movedObject: DrillEditorObject) {
    const clickedIds = objectSelectionIds(movedObject);
    const currentSelection = expandIdsToGroups(selectedIds);
    const activeIds = currentSelection.includes(movedObject.id) ? currentSelection : clickedIds;
    if (!currentSelection.includes(movedObject.id)) setSelectedIds(activeIds);
    liveDragRef.current = {
      movedId: movedObject.id,
      baseX: movedObject.x,
      baseY: movedObject.y,
      selectedIds: activeIds,
      objects: new Map(state.objects.map((object) => [object.id, object])),
      historyCaptured: false
    };
  }

  function moveSelectedLiveFromDrag(movedObject: DrillEditorObject, x: number, y: number) {
    const dragBase = liveDragRef.current;
    if (!dragBase || dragBase.movedId !== movedObject.id) beginObjectDrag(movedObject);
    const currentBase = liveDragRef.current;
    if (!currentBase) return { x, y };
    if (!currentBase.historyCaptured) {
      captureHistorySnapshot();
      currentBase.historyCaptured = true;
    }

    const baseMovedObject = currentBase.objects.get(movedObject.id) ?? movedObject;
    const snapped = snapSetupObject(baseMovedObject, x, y, state.objects);
    const dx = snapped.x - currentBase.baseX;
    const dy = snapped.y - currentBase.baseY;

    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        const baseObject = currentBase.objects.get(object.id);
        return baseObject && currentBase.selectedIds.includes(object.id)
          ? { ...object, ...objectPositionPatch(baseObject, dx, dy) }
          : object;
      })
    }), { history: false });
    setAlignmentGuides(calculateAlignmentGuides(baseMovedObject, snapped.x, snapped.y, state.objects));
    return snapped;
  }

  function finishObjectDrag() {
    setAlignmentGuides([]);
    liveDragRef.current = null;
  }

  function beginGroupRotation(point: { x: number; y: number }) {
    const currentObjects = stateRef.current.objects;
    const currentSelectedObjects = currentObjects.filter((object) => selectedIds.includes(object.id));
    const bounds = currentSelectedObjects.length > 1 ? objectsSelectionBounds(currentSelectedObjects, currentObjects) : null;
    if (!bounds || currentSelectedObjects.length < 2) return;
    const center = boundsCenter(bounds);
    const baselineObjects = groupRotationBaselineObjects(currentObjects, selectedIds);
    groupRotationRef.current = {
      bounds,
      center,
      handlePoint: point,
      startAngle: angleFromCenter(center, point),
      selectedIds: [...selectedIds],
      objects: baselineObjects
    };
    captureHistorySnapshot();
  }

  function rotateSelectedGroup(point: { x: number; y: number }) {
    const rotationBase = groupRotationRef.current;
    if (!rotationBase) return;
    rotationBase.handlePoint = point;
    const delta = angleFromCenter(rotationBase.center, point) - rotationBase.startAngle;
    const baseObjects = new Map(rotationBase.objects.map((object) => [object.id, object]));
    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!rotationBase.selectedIds.includes(object.id)) return object;
        const baseObject = baseObjects.get(object.id);
        return baseObject ? rotateObjectAroundPoint(baseObject, rotationBase.center, delta, rotationBase.objects) : object;
      })
    }), { history: false });

    const guideAngle = nearestCardinalAngle(delta);
    setRotationGuide(guideAngle === null ? null : { x: rotationBase.center.x, y: rotationBase.center.y, label: `${guideAngle}°` });
  }

  function finishGroupRotation(point: { x: number; y: number }) {
    rotateSelectedGroup(point);
    groupRotationRef.current = null;
    setRotationGuide(null);
    setAlignmentGuides([]);
    focusEditorCanvas();
  }

  function beginGroupScale(point: { x: number; y: number }) {
    const currentObjects = stateRef.current.objects;
    const currentSelectedObjects = currentObjects.filter((object) => selectedIds.includes(object.id));
    const bounds = currentSelectedObjects.length > 1 ? objectsSelectionBounds(currentSelectedObjects, currentObjects) : null;
    if (!bounds || currentSelectedObjects.length < 2) return;
    const center = boundsCenter(bounds);
    groupScaleRef.current = {
      bounds,
      center,
      handlePoint: point,
      startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      selectedIds: [...selectedIds],
      objects: groupRotationBaselineObjects(currentObjects, selectedIds)
    };
    captureHistorySnapshot();
  }

  function scaleSelectedGroup(point: { x: number; y: number }) {
    const scaleBase = groupScaleRef.current;
    if (!scaleBase) return;
    scaleBase.handlePoint = point;
    const distance = Math.max(1, Math.hypot(point.x - scaleBase.center.x, point.y - scaleBase.center.y));
    const factor = clamp(distance / scaleBase.startDistance, 0.1, 8);
    const baseObjects = new Map(scaleBase.objects.map((object) => [object.id, object]));
    updateState((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!scaleBase.selectedIds.includes(object.id)) return object;
        const baseObject = baseObjects.get(object.id);
        return baseObject ? scaleObjectAroundPoint(baseObject, scaleBase.center, factor) : object;
      })
    }), { history: false });
  }

  function finishGroupScale(point: { x: number; y: number }) {
    scaleSelectedGroup(point);
    groupScaleRef.current = null;
    focusEditorCanvas();
  }

  function showKeyboardAlignmentGuides(movedObject: DrillEditorObject) {
    if (keyboardGuideTimeoutRef.current) clearTimeout(keyboardGuideTimeoutRef.current);
    setAlignmentGuides(calculateAlignmentGuides(movedObject, movedObject.x, movedObject.y, state.objects, 1));
    keyboardGuideTimeoutRef.current = setTimeout(() => setAlignmentGuides([]), 900);
  }

  function stageCanvasPoint(event: CanvasPointerEvent) {
    const point = event.target.getStage?.()?.getPointerPosition();
    if (!point) return null;
    return inverseViewPoint({ x: point.x / actualZoom, y: point.y / actualZoom }, viewTransform);
  }

  function disconnectLineEndpoint(line: DrillEditorObject, endpoint: "start" | "end") {
    const resolvedLine = resolveLineObject(line, state.objects);
    updateObject(
      line.id,
      endpoint === "start"
        ? {
            x: resolvedLine.x,
            y: resolvedLine.y,
            startAnchorType: undefined,
            startAnchorObjectId: undefined,
            startAnchorEndpoint: undefined,
            startAnchorOffsetX: undefined,
            startAnchorOffsetY: undefined
          }
        : {
            endX: resolvedLine.endX ?? resolvedLine.x + 120,
            endY: resolvedLine.endY ?? resolvedLine.y,
            endAnchorType: undefined,
            endAnchorObjectId: undefined,
            endAnchorEndpoint: undefined,
            endAnchorOffsetX: undefined,
            endAnchorOffsetY: undefined
          }
    );
  }

  function rotateSelectedLineTo(targetAngle: number) {
    if (!selectedObject || selectedObject.type !== "arrow") return;
    updateObject(selectedObject.id, rotateLineToAnglePatch(selectedObject, state.objects, targetAngle));
  }

  function connectLineEndpoint(line: DrillEditorObject, endpoint: "start" | "end", objectId: string) {
    const anchor = parseAnchorValue(objectId);
    if (!anchor || wouldCreateAnchorCycle(line.id, endpoint, anchor, state.objects)) return;
    const anchorPoint = resolveAnchorPoint(anchor, state.objects, new Set([line.id]));
    if (!anchorPoint) return;

    updateObject(
      line.id,
      endpoint === "start"
        ? {
            x: anchorPoint.x,
            y: anchorPoint.y,
            startAnchorType: anchor.type,
            startAnchorObjectId: anchor.objectId,
            startAnchorEndpoint: anchor.type === "line-endpoint" ? anchor.endpoint : undefined,
            startAnchorOffsetX: undefined,
            startAnchorOffsetY: undefined
          }
        : {
            endX: anchorPoint.x,
            endY: anchorPoint.y,
            endAnchorType: anchor.type,
            endAnchorObjectId: anchor.objectId,
            endAnchorEndpoint: anchor.type === "line-endpoint" ? anchor.endpoint : undefined,
            endAnchorOffsetX: undefined,
            endAnchorOffsetY: undefined
          }
    );
  }

  function startLineDrawing(event: StagePointerEvent) {
    const stage = event.target.getStage();
    const point = stage?.getPointerPosition();
    const startedOnEmptyPitch = Object.is(event.target as unknown, stage as unknown);
    if (!point || activeTool === "select" || !startedOnEmptyPitch) return;
    const stagePoint = { x: point.x / actualZoom, y: point.y / actualZoom };
    const canvasPoint = inverseViewPoint(stagePoint, viewTransform);

    const id = crypto.randomUUID();
    setDraftLine({
      id,
      type: "arrow",
      x: canvasPoint.x,
      y: canvasPoint.y,
      endX: canvasPoint.x,
      endY: canvasPoint.y,
      controlX: canvasPoint.x,
      controlY: canvasPoint.y,
      rotation: 0,
      color: activeTool === "slalom" ? "#2563eb" : "#dc2626",
      thickness: defaultLineThicknessLevel,
      lineStyle: activeTool,
      arrowHead: activeTool === "slalom",
      curveEdited: false,
      label: ""
    });
  }

  function updateDraftLine(event: StagePointerEvent) {
    if (!draftLine) return;
    const point = event.target.getStage()?.getPointerPosition();
    if (!point) return;
    const stagePoint = { x: point.x / actualZoom, y: point.y / actualZoom };
    const canvasPoint = inverseViewPoint(stagePoint, viewTransform);
    setDraftLine((current) =>
      current
        ? {
            ...current,
            endX: canvasPoint.x,
            endY: canvasPoint.y,
            controlX: (current.x + canvasPoint.x) / 2,
            controlY: (current.y + canvasPoint.y) / 2
          }
        : current
    );
  }

  function finishLineDrawing() {
    if (!draftLine) return;
    const distance = Math.hypot((draftLine.endX ?? draftLine.x) - draftLine.x, (draftLine.endY ?? draftLine.y) - draftLine.y);
    if (distance > 10) {
      updateState((current) => ({ ...current, objects: [...current.objects, draftLine] }));
      setSelectedIds([draftLine.id]);
      setActiveTool("select");
      focusEditorCanvas();
    }
    setDraftLine(null);
  }

  function startMarqueeSelection(event: StagePointerEvent) {
    const point = stageCanvasPoint(event);
    if (!point) return;
    setSelectionBox({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
  }

  function updateMarqueeSelection(event: StagePointerEvent) {
    if (!selectionBox) return;
    const point = stageCanvasPoint(event);
    if (!point) return;
    setSelectionBox((current) => (current ? { ...current, endX: point.x, endY: point.y } : current));
  }

  function finishMarqueeSelection() {
    if (!selectionBox) return;
    const rect = normalizedSelectionRect(selectionBox);
    const movedEnough = rect.width > 6 || rect.height > 6;
    if (movedEnough) {
      setSelectedIds(expandIdsToGroups(state.objects.filter((object) => objectIntersectsRect(object, rect)).map((object) => object.id)));
    } else {
      setSelectedIds([]);
    }
    setSelectionBox(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (textEdit) return;
    if (isEditableElement(event.target)) return;
    const shortcut = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (shortcut && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redoEditorChange();
      else undoEditorChange();
      return;
    }

    if (shortcut && key === "y") {
      event.preventDefault();
      redoEditorChange();
      return;
    }

    if (shortcut && key === "c") {
      event.preventDefault();
      copySelected();
      return;
    }

    if (shortcut && key === "v") {
      event.preventDefault();
      pasteClipboard();
      return;
    }

    if (shortcut && key === "d") {
      event.preventDefault();
      duplicateSelected();
      return;
    }

    if ((event.key === "Backspace" || event.key === "Delete") && selectedIds.length) {
      event.preventDefault();
      deleteSelected();
      return;
    }

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && selectedIds.length) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 2;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      moveSelectedBy(dx, dy);
    }
  }

  return (
    <section className="rounded-lg border border-board-line bg-white p-4 shadow-soft sm:p-5">
      <input type="hidden" name={name} value={editorStateToString(state)} readOnly />

      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-lg font-bold text-board-navy">Drill graphic</h2>
          <p className="mt-1 text-sm text-slate-500">Draw the pitch setup with players, equipment, labels and movement lines.</p>
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800 sm:hidden">
            For detailed graphic editing, tablet or desktop is recommended. You can still add and adjust objects here.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Pitch area</span>
            <select
              value={state.pitch}
              onChange={(event) =>
                updateState((current) => ({ ...current, pitch: event.target.value as DrillEditorState["pitch"] }))
              }
              className="mt-1 h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            >
              <option>Full football pitch</option>
              <option>Half pitch</option>
              <option>Empty grid</option>
              <option>Empty field / blank</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Pitch style</span>
            <select
              value={state.pitchStyle}
              onChange={(event) =>
                updateState((current) => ({ ...current, pitchStyle: event.target.value as DrillEditorState["pitchStyle"] }))
              }
              className="mt-1 h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            >
              <option>Plain green</option>
              <option>Striped green</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Zoom</span>
            <select
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="mt-1 h-10 rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
            >
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
              <option value={2}>200%</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <aside className="rounded-lg border border-board-line bg-board-paper p-3">
          <p className="mb-3 text-xs font-bold uppercase text-slate-500">Templates</p>
          <p className="mb-3 text-xs leading-5 text-slate-500">
            Select objects on the pitch, save them as a template, then reuse the setup in future drills.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={saveSelectionAsTemplate} disabled={!selectedIds.length}>
              Save selection as template
            </Button>
            <span className="text-xs font-semibold text-slate-500">
              {selectedIds.length ? `${selectedIds.length} selected` : "Select objects first."}
            </span>
          </div>
          {templateStatus ? <p className="mt-2 text-xs font-semibold text-slate-500">{templateStatus}</p> : null}

          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">My templates</p>
          {templatesLoading ? <p className="text-xs text-slate-500">Loading templates...</p> : null}
          {!templatesLoading && !userTemplates.length ? <p className="rounded-md border border-dashed border-board-line bg-white p-3 text-xs leading-5 text-slate-500">No saved templates yet. Select a setup on the pitch and save it here.</p> : null}
          {userTemplates.length ? (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {userTemplates.map((template) => (
                <TemplateButton
                  key={template.id}
                  template={template}
                  onClick={() => insertTemplate(template)}
                  onRename={() => renameUserTemplate(template)}
                  onDelete={() => deleteUserTemplate(template)}
                />
              ))}
            </div>
          ) : null}

          <p className="mb-3 mt-5 text-xs font-bold uppercase text-slate-500">Objects</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <ToolButton label="Select / move" active={activeTool === "select"} icon={<MousePointer2 className="h-4 w-4" />} onClick={() => setActiveTool("select")} />
          <ToolButton label="Player" icon={<Circle className="h-4 w-4" />} dragType="player" onClick={() => addObject("player")} />
          <ToolButton label="Goalkeeper" icon={<Circle className="h-4 w-4" />} dragType="goalkeeper" onClick={() => addObject("goalkeeper")} />
          <ToolButton label="Coach" icon={<Circle className="h-4 w-4" />} dragType="coach" onClick={() => addObject("coach")} />
          <ToolButton label="Cone" icon={<Plus className="h-4 w-4" />} dragType="cone" onClick={() => addObject("cone")} />
          <ToolButton label="Flat marker" icon={<Circle className="h-4 w-4" />} dragType="marker" onClick={() => addObject("marker")} />
          <ToolButton label="Ring" icon={<Circle className="h-4 w-4" />} dragType="ring" onClick={() => addObject("ring")} />
          <ToolButton label="Ball" icon={<Circle className="h-4 w-4" />} dragType="ball" onClick={() => addObject("ball")} />
          <ToolButton label="Bibs / Leibchen" icon={<Circle className="h-4 w-4" />} dragType="bib" onClick={() => addObject("bib")} />
          <ToolButton label="Pole" icon={<Plus className="h-4 w-4" />} dragType="pole" onClick={() => addObject("pole")} />
          <ToolButton label="Mannequin" icon={<Goal className="h-4 w-4" />} dragType="mannequin" onClick={() => addObject("mannequin")} />
          <ToolButton label="Normal goal" icon={<Goal className="h-4 w-4" />} dragType="goal" onClick={() => addObject("goal")} />
          <ToolButton label="Mini goal" icon={<Goal className="h-4 w-4" />} dragType="mini_goal" onClick={() => addObject("mini_goal")} />
          <ToolButton label="Text label" icon={<MousePointer2 className="h-4 w-4" />} dragType="text" onClick={() => addObject("text")} />
          </div>

          <p className="mb-3 mt-5 text-xs font-bold uppercase text-slate-500">Draw lines</p>
          <div className="grid gap-2 sm:grid-cols-3">
          <ToolButton label="Solid arrow" active={activeTool === "solid"} icon={<ArrowRight className="h-4 w-4" />} onClick={() => setActiveTool("solid")} />
          <ToolButton label="Dashed arrow" active={activeTool === "dashed"} icon={<ArrowRight className="h-4 w-4" />} onClick={() => setActiveTool("dashed")} />
          <ToolButton label="Slalom dribble" active={activeTool === "slalom"} icon={<ArrowRight className="h-4 w-4" />} onClick={() => setActiveTool("slalom")} />
          </div>

          <Button type="button" variant="danger" className="mt-4" onClick={clearCanvas}>
            Clear canvas
          </Button>
        </aside>

        <div
          ref={editorFocusRef}
          className="rounded-lg border border-board-line bg-slate-100 outline-none focus:ring-4 focus:ring-green-100"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          <div
            ref={stageContainerRef}
            className="relative overflow-auto"
            onContextMenu={(event) => event.preventDefault()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const type = event.dataTransfer.getData("application/x-coachboard-object") as AddableObjectType;
              if (isAddableObjectType(type)) addObjectFromDrop(type, event.clientX, event.clientY);
            }}
          >
            <Stage
              width={stageWidth * actualZoom}
              height={stageHeight * actualZoom}
              scaleX={actualZoom}
              scaleY={actualZoom}
              onMouseDown={(event) => {
                setContextMenu(null);
                if (activeTool !== "select") {
                  startLineDrawing(event);
                  return;
                }
                if (event.target === event.target.getStage()) startMarqueeSelection(event);
              }}
              onMouseMove={(event) => {
                updateDraftLine(event);
                updateMarqueeSelection(event);
              }}
              onMouseUp={() => {
                finishLineDrawing();
                finishMarqueeSelection();
              }}
              onTouchStart={(event) => {
                if (activeTool !== "select") startLineDrawing(event);
              }}
              onTouchMove={updateDraftLine}
              onTouchEnd={finishLineDrawing}
            >
              <Layer>
                <Group x={viewTransform.x} y={viewTransform.y} scaleX={viewTransform.scaleX} scaleY={viewTransform.scaleY} {...viewClipProps(state.pitch)}>
                  <PitchBackground pitch={state.pitch === "Half pitch" ? "Full football pitch" : state.pitch} pitchStyle={state.pitchStyle} />
                  {state.objects.map((object) => (
                    <EditorObject
                      key={object.id}
                      object={object}
                      selected={selectedIds.includes(object.id)}
                      multiSelected={selectedIds.length > 1 && selectedIds.includes(object.id)}
                      zoom={actualZoom}
                      onSelect={(event) => selectEditorObject(object, event)}
                      onContextMenu={(event) => openEditorContextMenu(event, object)}
                      onChange={(patch, options) => updateObject(object.id, patch, options)}
                      onCaptureHistory={captureHistorySnapshot}
                      onMoveStart={() => beginObjectDrag(object)}
                      onMove={(x, y) => moveSelectedLiveFromDrag(object, x, y)}
                      onMoveEnd={finishObjectDrag}
                      onRotationGuide={setRotationGuide}
                      onRotationGuideEnd={() => setRotationGuide(null)}
                      onAlignmentGuides={setAlignmentGuides}
                      objects={state.objects}
                      onTextEdit={beginTextEdit}
                    />
                  ))}
                  {draftLine ? (
                    <EditorObject object={draftLine} selected={false} multiSelected={false} zoom={actualZoom} onSelect={() => undefined} onContextMenu={() => undefined} onChange={() => undefined} onCaptureHistory={() => undefined} onMoveStart={() => undefined} onMove={(x, y) => ({ x, y })} onMoveEnd={() => undefined} onRotationGuide={() => undefined} onRotationGuideEnd={() => undefined} onAlignmentGuides={() => undefined} objects={state.objects} onTextEdit={() => undefined} />
                  ) : null}
                  {draftLine ? <AlignmentGuides guides={[lineLengthGuide(draftLine, state.objects)]} /> : null}
                  {groupRotationBounds ? (
                    <GroupRotationHandle
                      bounds={groupRotationBounds}
                      handlePoint={groupRotationHandlePoint}
                      zoom={actualZoom}
                      toCanvasPoint={stageCanvasPoint}
                      onDragStart={beginGroupRotation}
                      onDragMove={rotateSelectedGroup}
                      onDragEnd={finishGroupRotation}
                    />
                  ) : null}
                  {groupRotationBounds ? (
                    <GroupScaleHandle
                      bounds={groupRotationBounds}
                      zoom={actualZoom}
                      toCanvasPoint={stageCanvasPoint}
                      onDragStart={beginGroupScale}
                      onDragMove={scaleSelectedGroup}
                      onDragEnd={finishGroupScale}
                    />
                  ) : null}
                  {alignmentGuides.length ? <AlignmentGuides guides={alignmentGuides} /> : null}
                  {rotationGuide ? <RotationGuideLabel guide={rotationGuide} /> : null}
                  {selectionBox ? <SelectionRect box={selectionBox} /> : null}
                </Group>
              </Layer>
            </Stage>
            {textEdit ? (
              <input
                autoFocus
                value={textEdit.value}
                onChange={(event) => setTextEdit((current) => (current ? { ...current, value: event.target.value } : current))}
                onBlur={commitTextEdit}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") commitTextEdit();
                  if (event.key === "Escape") setTextEdit(null);
                }}
                className="absolute z-10 h-8 rounded-md border border-board-green bg-white px-2 text-sm font-semibold text-board-navy shadow-soft outline-none ring-4 ring-green-100"
                style={{ left: textEdit.x, top: textEdit.y, width: Math.max(textEdit.width, 72) }}
              />
            ) : null}
            {contextMenu ? (
              <EditorContextMenu
                menu={contextMenu}
                canGroup={selectedIds.length >= 2}
                canUngroup={selectedPersistentGroupIds.length > 0}
                onClose={() => setContextMenu(null)}
                onLayer={moveSelectedLayer}
                onGroup={groupSelectedObjects}
                onUngroup={ungroupSelectedObjects}
                onDuplicate={duplicateSelected}
                onDelete={deleteSelected}
              />
            ) : null}
          </div>
        </div>

        {showGroupProperties ? (
        <aside className="rounded-lg border border-board-line bg-board-paper p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Properties</p>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-board-line bg-white p-3">
              <p className="text-sm font-bold text-board-navy">Group: {selectedObjects.length} items</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Move, rotate, scale, layer, duplicate or delete the selected items together.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={groupSelectedObjects} disabled={selectedObjects.length < 2}>
                Group
              </Button>
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={ungroupSelectedObjects} disabled={!selectedPersistentGroupIds.length}>
                Ungroup
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("forward")}>
                Bring forward
              </Button>
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("backward")}>
                Send backward
              </Button>
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("front")}>
                Bring to front
              </Button>
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("back")}>
                Send to back
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" className="h-9 px-3" onClick={duplicateSelected}>
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
              <Button type="button" variant="danger" className="h-9 px-3" onClick={deleteSelected}>
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>
            <p className="text-xs leading-5 text-slate-500">Use the corner handle to scale the group and the green handle to rotate it.</p>
          </div>
        </aside>
        ) : selectedObject ? (
        <aside className="rounded-lg border border-board-line bg-board-paper p-4">
          <p className="text-xs font-bold uppercase text-slate-500">Properties</p>
            <div className="mt-4 space-y-4">
              <p className="capitalize text-sm font-semibold text-board-navy">{labelForType(selectedObject.type)}</p>
              {canEditColor(selectedObject) ? (
                <ColorPalette value={selectedObject.color} onChange={(color) => updateObject(selectedObject.id, { color })} />
              ) : null}

              {selectedObject.type === "player" && (
                <>
                  <PropertySelect
                    label="Icon style"
                    value={selectedObject.variant ?? "circle"}
                    options={[
                      { label: "Circle", value: "circle" },
                      { label: "Standing", value: "front" },
                      { label: "Running", value: "running" },
                      { label: "Passing", value: "passing" },
                      { label: "Jogging", value: "jogging" },
                      { label: "With ball", value: "with-ball" },
                      { label: "Ball in hand", value: "ball-hand" }
                    ]}
                    onChange={(variant) => updatePlayerVariant(selectedObject, variant, updateObject)}
                  />
                  <FieldGrid>
                    <PropertyInput label="Number" value={selectedObject.number ?? ""} onChange={(number) => updateObject(selectedObject.id, { number })} />
                    <PropertyInput label="Name" value={selectedObject.name ?? ""} onChange={(name) => updateObject(selectedObject.id, { name })} />
                  </FieldGrid>
                </>
              )}

              {selectedObject.type === "goalkeeper" && (
                <>
                  <PropertySelect
                    label="Icon style"
                    value={selectedObject.variant ?? "front"}
                    options={[
                      { label: "Goalkeeper", value: "front" },
                      { label: "Goalkeeper with ball", value: "with-ball" }
                    ]}
                    onChange={(variant) => updateObject(selectedObject.id, { variant })}
                  />
                  <FieldGrid>
                    <PropertyInput label="Number" value={selectedObject.number ?? ""} onChange={(number) => updateObject(selectedObject.id, { number })} />
                    <PropertyInput label="Name" value={selectedObject.name ?? ""} onChange={(name) => updateObject(selectedObject.id, { name })} />
                  </FieldGrid>
                </>
              )}

              {selectedObject.type === "coach" && (
                <>
                  <PropertySelect
                    label="Icon style"
                    value={selectedObject.variant ?? "pointing"}
                    options={[
                      { label: "Coaching", value: "pointing" },
                      { label: "Coach with ball", value: "coach-ball" }
                    ]}
                    onChange={(variant) => updateObject(selectedObject.id, { variant })}
                  />
                  <PropertyInput label="Name" value={selectedObject.name ?? ""} onChange={(name) => updateObject(selectedObject.id, { name })} />
                </>
              )}

              {selectedObject.type === "bib" && (
                <>
                  <FieldGrid>
                    <PropertyInput label="Number" value={selectedObject.number ?? ""} onChange={(number) => updateObject(selectedObject.id, { number })} />
                    <PropertySelect
                      label="Bib shape"
                      value={selectedObject.variant ?? "classic"}
                      options={[
                        { label: "Classic", value: "classic" },
                        { label: "Tall", value: "tall" }
                      ]}
                      onChange={(variant) => updateObject(selectedObject.id, { variant })}
                    />
                  </FieldGrid>
                </>
              )}

              {selectedObject.type === "ball" && (
                <PropertySelect
                  label="Ball type"
                  value={selectedObject.variant ?? "football"}
                  options={[
                    { label: "Football", value: "football" },
                    { label: "Small football", value: "small-football" },
                    { label: "Tennis ball", value: "tennis" },
                    { label: "Basketball", value: "basketball" }
                  ]}
                  onChange={(variant) => updateObject(selectedObject.id, { variant })}
                />
              )}

              {selectedObject.type === "cone" && (
                <PropertySelect
                  label="Cone style"
                  value={selectedObject.variant ?? "simple"}
                  options={[
                    { label: "Normal cone", value: "simple" },
                    { label: "Cone with stripe", value: "stripe" }
                  ]}
                  onChange={(variant) => updateObject(selectedObject.id, { variant })}
                />
              )}

              {(selectedObject.type === "goal" || selectedObject.type === "mini_goal") && (
                selectedObject.type === "goal" ? (
                  <PropertySelect
                    label="Goal view"
                    value={selectedObject.variant === "youth-angled" ? "youth-front" : selectedObject.variant ?? "front"}
                    options={[
                      { label: "Normal front", value: "front" },
                      { label: "Normal angled left", value: "angled" },
                      { label: "Normal angled right", value: "right" },
                      { label: "Youth front", value: "youth-front" }
                    ]}
                    onChange={(variant) => updateObject(selectedObject.id, { variant })}
                  />
                ) : (
                  <p className="rounded-md border border-board-line bg-white px-3 py-2 text-sm font-semibold text-slate-700">Mini Goal</p>
                )
              )}

              {selectedObject.type === "text" && (
                <>
                  <PropertyInput label="Label" value={selectedObject.label ?? ""} onChange={(label) => updateObject(selectedObject.id, { label })} />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedObject.showBackground ?? false}
                      onChange={(event) => updateObject(selectedObject.id, { showBackground: event.target.checked })}
                      className="h-4 w-4 rounded border-board-line text-board-green focus:ring-board-green"
                    />
                    Show background
                  </label>
                </>
              )}

              {selectedObject.type === "arrow" ? (
                <>
                  <PropertyInput label="Label" value={selectedObject.label ?? ""} onChange={(label) => updateObject(selectedObject.id, { label })} />
                  <FieldGrid>
                    <NumberInput label="Curve X" value={selectedObject.controlX ?? midpoint(selectedObject.x, selectedObject.endX ?? selectedObject.x + 120)} min={0} max={stageWidth} onChange={(controlX) => updateObject(selectedObject.id, { controlX, curveEdited: true })} />
                    <NumberInput label="Curve Y" value={selectedObject.controlY ?? midpoint(selectedObject.y, selectedObject.endY ?? selectedObject.y)} min={0} max={stageHeight} onChange={(controlY) => updateObject(selectedObject.id, { controlY, curveEdited: true })} />
                  </FieldGrid>
                  <NumberInput label="Thickness" value={normalizeThicknessLevel(selectedObject.thickness)} min={1} max={10} step={1} onChange={(thickness) => updateObject(selectedObject.id, { thickness: normalizeThicknessLevel(thickness) })} />
                  <div>
                    <span className="text-xs font-semibold text-slate-500">Rotate line</span>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[0, 90, 180, 270].map((angle) => (
                        <Button
                          key={angle}
                          type="button"
                          variant="secondary"
                          className="h-9 justify-center px-2"
                          onClick={() => rotateSelectedLineTo(angle)}
                        >
                          {angle}°
                        </Button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={lineShowsArrow(selectedObject)}
                      onChange={(event) => updateObject(selectedObject.id, { arrowHead: event.target.checked })}
                      className="h-4 w-4 rounded border-board-line text-board-green focus:ring-board-green"
                    />
                    Show arrow
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={lineConnectionsOpen}
                      onChange={(event) => setLineConnectionsOpen(event.target.checked)}
                      className="h-4 w-4 rounded border-board-line text-board-green focus:ring-board-green"
                    />
                    Use connections
                  </label>
                  <details
                    open={lineConnectionsOpen}
                    onToggle={(event) => setLineConnectionsOpen(event.currentTarget.open)}
                    className="rounded-lg border border-board-line bg-white px-3 py-2"
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Connections</summary>
                    <div className="mt-3 space-y-3">
                      <FieldGrid>
                        <PropertySelect
                          label="Connect start to marker"
                          value={markerAnchorSelectValue(selectedObject, "start")}
                          options={markerConnectionOptions(state.objects)}
                          onChange={(value) => (value ? connectLineEndpoint(selectedObject, "start", value) : disconnectLineEndpoint(selectedObject, "start"))}
                        />
                        <PropertySelect
                          label="Connect end to marker"
                          value={markerAnchorSelectValue(selectedObject, "end")}
                          options={markerConnectionOptions(state.objects)}
                          onChange={(value) => (value ? connectLineEndpoint(selectedObject, "end", value) : disconnectLineEndpoint(selectedObject, "end"))}
                        />
                      </FieldGrid>
                      <FieldGrid>
                        <PropertySelect
                          label="Connect start to line endpoint"
                          value={lineEndpointAnchorSelectValue(selectedObject, "start")}
                          options={lineEndpointConnectionOptions(state.objects, selectedObject.id)}
                          onChange={(value) => (value ? connectLineEndpoint(selectedObject, "start", value) : disconnectLineEndpoint(selectedObject, "start"))}
                        />
                        <PropertySelect
                          label="Connect end to line endpoint"
                          value={lineEndpointAnchorSelectValue(selectedObject, "end")}
                          options={lineEndpointConnectionOptions(state.objects, selectedObject.id)}
                          onChange={(value) => (value ? connectLineEndpoint(selectedObject, "end", value) : disconnectLineEndpoint(selectedObject, "end"))}
                        />
                      </FieldGrid>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => disconnectLineEndpoint(selectedObject, "start")}>
                          Disconnect start
                        </Button>
                        <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => disconnectLineEndpoint(selectedObject, "end")}>
                          Disconnect end
                        </Button>
                      </div>
                    </div>
                  </details>
                  <details className="rounded-lg border border-board-line bg-white px-3 py-2">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Advanced coordinates</summary>
                    <div className="mt-3 space-y-3">
                      <FieldGrid>
                        <NumberInput label="Start X" value={selectedObject.x} min={0} max={stageWidth} onChange={(x) => updateObject(selectedObject.id, endpointCoordinatePatch(selectedObject, "start", "x", x))} />
                        <NumberInput label="Start Y" value={selectedObject.y} min={0} max={stageHeight} onChange={(y) => updateObject(selectedObject.id, endpointCoordinatePatch(selectedObject, "start", "y", y))} />
                      </FieldGrid>
                      <FieldGrid>
                        <NumberInput label="End X" value={selectedObject.endX ?? selectedObject.x + 120} min={0} max={stageWidth} onChange={(endX) => updateObject(selectedObject.id, endpointCoordinatePatch(selectedObject, "end", "x", endX))} />
                        <NumberInput label="End Y" value={selectedObject.endY ?? selectedObject.y} min={0} max={stageHeight} onChange={(endY) => updateObject(selectedObject.id, endpointCoordinatePatch(selectedObject, "end", "y", endY))} />
                      </FieldGrid>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <FieldGrid>
                    <NumberInput label="Scale" value={selectedObject.scale ?? 1} min={minObjectScale} max={maxObjectScale} step={0.1} onChange={(scale) => updateObject(selectedObject.id, { scale })} />
                    <NumberInput label="Rotation" value={positiveRotation(selectedObject.rotation)} min={0} max={359} step={1} onChange={(rotation) => updateObject(selectedObject.id, { rotation: positiveRotation(rotation) })} />
                  </FieldGrid>
                  {canMirror(selectedObject) ? (
                    <Button type="button" variant="secondary" className="h-9 w-full justify-center" onClick={() => updateObject(selectedObject.id, { mirrored: !(selectedObject.mirrored ?? false) })}>
                      Mirror horizontally
                    </Button>
                  ) : null}
                </>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("forward")}>
                  Bring forward
                </Button>
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("backward")}>
                  Send backward
                </Button>
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("front")}>
                  Bring to front
                </Button>
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => moveSelectedLayer("back")}>
                  Send to back
                </Button>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={duplicateSelected}>
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button type="button" variant="danger" className="h-9 px-3" onClick={deleteSelected}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
              <p className="text-xs leading-5 text-slate-500">Tip: press Delete or Backspace while the canvas is focused to remove the selected item.</p>
            </div>
        </aside>
        ) : null}
      </div>
    </section>
  );
}

function ToolButton({ label, icon, active, dragType, onClick }: { label: string; icon: ReactNode; active?: boolean; dragType?: AddableObjectType; onClick: () => void }) {
  return (
    <button
      type="button"
      draggable={Boolean(dragType)}
      onDragStart={(event) => {
        if (!dragType) return;
        event.dataTransfer.setData("application/x-coachboard-object", dragType);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
      className={`flex h-10 w-full items-center gap-2 rounded-md border px-3 text-left text-sm font-semibold transition ${
        active
          ? "border-board-green bg-green-50 text-board-navy"
          : "border-board-line bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TemplateButton({
  template,
  onClick,
  onRename,
  onDelete
}: {
  template: DrillGraphicTemplate;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-board-line bg-white transition hover:border-board-green">
      <button
        type="button"
        onClick={onClick}
        className="block min-h-20 w-full p-3 text-left transition hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-board-green"
      >
        <span className="block text-sm font-bold text-board-navy">{template.name}</span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500">{template.description}</span>
        <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {template.source === "built-in" ? "Built-in" : "My template"}
        </span>
      </button>
      {template.source === "user" ? (
        <div className="flex border-t border-board-line bg-slate-50">
          <button type="button" onClick={onRename} className="flex-1 px-2 py-2 text-xs font-bold text-board-navy hover:bg-white">
            Rename
          </button>
          <button type="button" onClick={onDelete} className="flex-1 border-l border-board-line px-2 py-2 text-xs font-bold text-red-600 hover:bg-white">
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SelectionRect({ box }: { box: SelectionBox }) {
  const rect = normalizedSelectionRect(box);
  return (
    <Rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill="rgba(37,99,235,0.12)"
      stroke="#2563eb"
      strokeWidth={1}
      dash={[6, 5]}
      listening={false}
    />
  );
}

function AlignmentGuides({ guides }: { guides: AlignmentGuide[] }) {
  return (
    <Group listening={false}>
      {guides.map((guide, index) => {
        if (guide.type === "vertical") {
          return (
            <Group key={index}>
              <Line points={[guide.x, 0, guide.x, stageHeight]} stroke="#0284c7" strokeWidth={2} dash={[8, 5]} opacity={0.9} />
              <Rect x={guide.x + 7} y={22} width={56} height={22} fill="rgba(2,132,199,0.88)" cornerRadius={5} />
              <Text text="Same X" x={guide.x + 7} y={26} width={56} align="center" fill="#ffffff" fontSize={11} fontStyle="bold" />
            </Group>
          );
        }
        if (guide.type === "horizontal") {
          return (
            <Group key={index}>
              <Line points={[0, guide.y, stageWidth, guide.y]} stroke="#0284c7" strokeWidth={2} dash={[8, 5]} opacity={0.9} />
              <Rect x={18} y={guide.y + 7} width={56} height={22} fill="rgba(2,132,199,0.88)" cornerRadius={5} />
              <Text text="Same Y" x={18} y={guide.y + 11} width={56} align="center" fill="#ffffff" fontSize={11} fontStyle="bold" />
            </Group>
          );
        }

        if (guide.type === "distance") {
          return (
            <Group key={index}>
              <Line points={guide.points} stroke="#7c3aed" strokeWidth={1.75} dash={[2, 5]} opacity={0.82} />
              <Rect x={guide.labelX - 30} y={guide.labelY - 12} width={60} height={24} fill="rgba(15,23,42,0.86)" cornerRadius={6} />
              <Text text={guide.label} x={guide.labelX - 30} y={guide.labelY - 8} width={60} align="center" fill="#ffffff" fontSize={12} fontStyle="bold" />
            </Group>
          );
        }

        if (guide.type === "angle") {
          return (
            <Group key={index}>
              <Line points={guide.points} stroke="#16a34a" strokeWidth={3} opacity={0.88} />
              <Rect x={guide.labelX - 25} y={guide.labelY - 12} width={50} height={24} fill="rgba(22,101,52,0.92)" cornerRadius={6} />
              <Text text={guide.label} x={guide.labelX - 25} y={guide.labelY - 8} width={50} align="center" fill="#ffffff" fontSize={12} fontStyle="bold" />
            </Group>
          );
        }

        if (guide.type === "length") {
          return (
            <Group key={index}>
              <Rect x={guide.labelX - 32} y={guide.labelY - 12} width={64} height={24} fill="rgba(15,23,42,0.88)" cornerRadius={6} />
              <Text text={guide.label} x={guide.labelX - 32} y={guide.labelY - 8} width={64} align="center" fill="#ffffff" fontSize={12} fontStyle="bold" />
            </Group>
          );
        }

        return (
          <Group key={index}>
            <Line points={guide.points} stroke="#f59e0b" strokeWidth={2.5} dash={[6, 4]} opacity={0.95} />
            <Rect x={guide.labelX - 54} y={guide.labelY - 12} width={108} height={24} fill="rgba(146,64,14,0.92)" cornerRadius={6} />
            <Text text={guide.label} x={guide.labelX - 54} y={guide.labelY - 8} width={108} align="center" fill="#ffffff" fontSize={11} fontStyle="bold" />
          </Group>
        );
      })}
    </Group>
  );
}

function RotationGuideLabel({ guide }: { guide: RotationGuide }) {
  return (
    <Group listening={false}>
      <Line points={[guide.x - 18, guide.y, guide.x + 18, guide.y]} stroke="#22c55e" strokeWidth={2} opacity={0.9} />
      <Line points={[guide.x, guide.y - 18, guide.x, guide.y + 18]} stroke="#22c55e" strokeWidth={2} opacity={0.9} />
      <Rect x={guide.x - 25} y={guide.y - 43} width={50} height={24} fill="rgba(22,101,52,0.9)" cornerRadius={6} />
      <Text text={guide.label} x={guide.x - 25} y={guide.y - 39} width={50} align="center" fill="#ffffff" fontSize={12} fontStyle="bold" />
    </Group>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function PropertyInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function PropertySelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="mt-1 h-10 w-full rounded-md border border-board-line bg-white px-3 text-sm outline-none focus:border-board-green focus:ring-4 focus:ring-green-100"
      />
    </label>
  );
}

function ColorPalette({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">Color</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`Set color ${color}`}
            onClick={() => onChange(color)}
            className={`h-7 w-7 rounded-full border ${value === color ? "ring-2 ring-board-green ring-offset-2" : "border-slate-300"}`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </label>
  );
}

function cloneEditorState(state: DrillEditorState): DrillEditorState {
  return {
    ...state,
    objects: state.objects.map((object) => ({ ...object }))
  };
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function createObject(type: Exclude<DrillEditorObjectType, "arrow">, id: string): DrillEditorObject {
  const base = { id, type, x: 240, y: 180, rotation: 0, color: "#2563eb", scale: 1 };
  if (type === "goalkeeper") return { ...base, color: "#16a34a", variant: "front" };
  if (type === "coach") return { ...base, color: "#374151", variant: "pointing" };
  if (type === "cone") return { ...base, color: "#f97316", variant: "simple" };
  if (type === "marker") return { ...base, color: "#f59e0b" };
  if (type === "ring") return { ...base, color: "#2563eb" };
  if (type === "ball") return { ...base, color: "#ffffff", variant: "football" };
  if (type === "bib") return { ...base, color: "#84cc16", variant: "classic" };
  if (type === "pole") return { ...base, color: "#facc15" };
  if (type === "mannequin") return { ...base, color: "#facc15" };
  if (type === "goal") return { ...base, color: "#111827", width: 120, height: 60, variant: "front" };
  if (type === "mini_goal") return { ...base, color: "#111827", width: 48, height: 24, variant: "front" };
  if (type === "text") return { ...base, color: "#111827", label: "Label", showBackground: false };
  return { ...base, variant: "front" };
}

function miniGoalTemplate(x: number, y: number, rotation: number): DrillGraphicTemplateObject {
  return {
    type: "mini_goal",
    x,
    y,
    rotation,
    color: "#111827",
    scale: 1,
    width: 48,
    height: 24,
    variant: "front"
  };
}

function markerTemplate(x: number, y: number, color: string): DrillGraphicTemplateObject {
  return {
    type: "marker",
    x,
    y,
    rotation: 0,
    color,
    scale: 1
  };
}

function coneTemplate(x: number, y: number, color: string): DrillGraphicTemplateObject {
  return {
    type: "cone",
    x,
    y,
    rotation: 0,
    color,
    scale: 1,
    variant: "simple"
  };
}

function boundaryLineTemplate(
  x: number,
  y: number,
  endX: number,
  endY: number,
  color = templateBoundaryColor,
  lineStyle: DrillEditorObject["lineStyle"] = "solid"
): DrillGraphicTemplateObject {
  return {
    type: "arrow",
    x,
    y,
    endX,
    endY,
    controlX: midpoint(x, endX),
    controlY: midpoint(y, endY),
    rotation: 0,
    color,
    scale: 1,
    thickness: 1,
    lineStyle,
    arrowHead: false,
    curveEdited: false,
    label: ""
  };
}

function instantiateTemplateObjects(template: DrillGraphicTemplate, center: { x: number; y: number }) {
  const bounds = templateObjectBounds(template.objects);
  const templateCenter = bounds
    ? {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
      }
    : { x: 0, y: 0 };
  const dx = center.x - templateCenter.x;
  const dy = center.y - templateCenter.y;
  const groupMap = new Map<string, string>();
  return template.objects.map((object) => {
    const nextGroupId = object.groupId
      ? groupMap.get(object.groupId) ?? crypto.randomUUID()
      : undefined;
    if (object.groupId && nextGroupId) groupMap.set(object.groupId, nextGroupId);
    return moveObjectBy({ ...object, id: crypto.randomUUID(), groupId: nextGroupId }, dx, dy);
  });
}

function templateObjectBounds(objects: DrillGraphicTemplateObject[]) {
  return templateObjectsBounds(objects.map((object) => ({ ...object, id: "template" })));
}

function templateObjectsBounds(objects: Array<DrillEditorObject | DrillGraphicTemplateObject>) {
  let bounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const object of objects) {
    const objectBounds =
      object.type === "arrow"
        ? {
            minX: Math.min(object.x, object.endX ?? object.x, object.controlX ?? object.x),
            minY: Math.min(object.y, object.endY ?? object.y, object.controlY ?? object.y),
            maxX: Math.max(object.x, object.endX ?? object.x, object.controlX ?? object.x),
            maxY: Math.max(object.y, object.endY ?? object.y, object.controlY ?? object.y)
          }
        : {
            minX: object.x,
            minY: object.y,
            maxX: object.x,
            maxY: object.y
          };
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, objectBounds.minX),
          minY: Math.min(bounds.minY, objectBounds.minY),
          maxX: Math.max(bounds.maxX, objectBounds.maxX),
          maxY: Math.max(bounds.maxY, objectBounds.maxY)
        }
      : objectBounds;
  }
  return bounds;
}

function templateJsonFromSelection(objects: DrillEditorObject[], state: DrillEditorState): StoredTemplateJson {
  const resolvedObjects = objects.map((object) => stripTemplateAnchors(object.type === "arrow" ? resolveLineObject(object, state.objects) : object));
  const bounds = templateObjectsBounds(resolvedObjects);
  const center = bounds
    ? {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2
      }
    : { x: 0, y: 0 };

  return {
    version: 1,
    pitch: state.pitch,
    pitchStyle: state.pitchStyle,
    objects: resolvedObjects.map((object) => drillObjectToTemplateObject(moveObjectBy(object, -center.x, -center.y)))
  };
}

function drillObjectToTemplateObject(object: DrillEditorObject): DrillGraphicTemplateObject {
  const templateObject: Partial<DrillEditorObject> = { ...object };
  delete templateObject.id;
  return templateObject as DrillGraphicTemplateObject;
}

function stripTemplateAnchors(object: DrillEditorObject): DrillEditorObject {
  if (object.type !== "arrow") return object;
  return {
    ...object,
    startAnchorType: undefined,
    startAnchorObjectId: undefined,
    startAnchorEndpoint: undefined,
    startAnchorOffsetX: undefined,
    startAnchorOffsetY: undefined,
    endAnchorType: undefined,
    endAnchorObjectId: undefined,
    endAnchorEndpoint: undefined,
    endAnchorOffsetX: undefined,
    endAnchorOffsetY: undefined
  };
}

function templateJsonToJson(template: StoredTemplateJson): Json {
  return JSON.parse(JSON.stringify(template)) as Json;
}

function templateFromRow(row: TemplateRow | null): DrillGraphicTemplate | null {
  if (!row) return null;
  const templateJson = parseStoredTemplateJson(row.template_json);
  if (!templateJson || !templateJson.objects.length) return null;
  return {
    id: row.id,
    name: row.name,
    description: `${templateJson.objects.length} object${templateJson.objects.length === 1 ? "" : "s"}`,
    tags: [],
    objects: templateJson.objects,
    source: "user",
    createdAt: row.created_at ?? undefined
  };
}

function parseStoredTemplateJson(value: Json): StoredTemplateJson | null {
  const parsed = JSON.parse(JSON.stringify(value)) as unknown;
  if (!isObjectRecord(parsed)) return null;
  const objectsValue = parsed.objects;
  if (!Array.isArray(objectsValue)) return null;
  const objects = objectsValue
    .map((object) => templateObjectFromUnknown(object))
    .filter((object): object is DrillGraphicTemplateObject => Boolean(object));

  return {
    version: 1,
    objects,
    pitch: isEditorPitch(parsed.pitch) ? parsed.pitch : undefined,
    pitchStyle: isEditorPitchStyle(parsed.pitchStyle) ? parsed.pitchStyle : undefined
  };
}

function templateObjectFromUnknown(value: unknown): DrillGraphicTemplateObject | null {
  if (!isObjectRecord(value) || !isDrillEditorObjectType(value.type)) return null;
  const x = numberFromUnknown(value.x);
  const y = numberFromUnknown(value.y);
  if (x === null || y === null) return null;

  const object: DrillGraphicTemplateObject = {
    type: value.type,
    x,
    y,
    rotation: numberFromUnknown(value.rotation) ?? 0,
    color: stringFromUnknown(value.color) ?? "#2563eb"
  };

  assignString(value, object, "label");
  assignString(value, object, "number");
  assignString(value, object, "name");
  assignString(value, object, "variant");
  assignBoolean(value, object, "showBackground");
  assignNumber(value, object, "width");
  assignNumber(value, object, "height");
  assignNumber(value, object, "endX");
  assignNumber(value, object, "endY");
  assignNumber(value, object, "controlX");
  assignNumber(value, object, "controlY");
  assignNumber(value, object, "scale");
  assignNumber(value, object, "thickness");
  assignBoolean(value, object, "arrowHead");
  assignBoolean(value, object, "curveEdited");
  assignBoolean(value, object, "mirrored");
  assignString(value, object, "groupId");
  if (isLineStyle(value.lineStyle)) object.lineStyle = value.lineStyle;
  if (Array.isArray(value.points) && value.points.every((point) => typeof point === "number" && Number.isFinite(point))) {
    object.points = value.points;
  }

  return object;
}

function assignString<K extends keyof DrillGraphicTemplateObject>(source: Record<string, unknown>, target: DrillGraphicTemplateObject, key: K) {
  const value = stringFromUnknown(source[key]);
  if (value !== null) Object.assign(target, { [key]: value });
}

function assignNumber<K extends keyof DrillGraphicTemplateObject>(source: Record<string, unknown>, target: DrillGraphicTemplateObject, key: K) {
  const value = numberFromUnknown(source[key]);
  if (value !== null) Object.assign(target, { [key]: value });
}

function assignBoolean<K extends keyof DrillGraphicTemplateObject>(source: Record<string, unknown>, target: DrillGraphicTemplateObject, key: K) {
  const value = booleanFromUnknown(source[key]);
  if (value !== null) Object.assign(target, { [key]: value });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDrillEditorObjectType(value: unknown): value is DrillEditorObjectType {
  return typeof value === "string" && drillEditorObjectTypes.includes(value as DrillEditorObjectType);
}

function isLineStyle(value: unknown): value is DrillEditorObject["lineStyle"] {
  return value === "solid" || value === "dashed" || value === "slalom";
}

function isEditorPitch(value: unknown): value is DrillEditorState["pitch"] {
  return value === "Full football pitch" || value === "Half pitch" || value === "Empty grid" || value === "Empty field / blank";
}

function isEditorPitchStyle(value: unknown): value is DrillEditorState["pitchStyle"] {
  return value === "Plain green" || value === "Striped green";
}

function stringFromUnknown(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberFromUnknown(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanFromUnknown(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function templateErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (isObjectRecord(error) && typeof error.message === "string") return error.message;
  return "Template action failed.";
}

function updatePlayerVariant(
  object: DrillEditorObject,
  variant: string,
  updateObject: (id: string, patch: Partial<DrillEditorObject>) => void
) {
  const patch: Partial<DrillEditorObject> = { variant };
  if (variant === "circle" && !object.number) patch.number = "8";
  if (variant !== "circle" && object.number === "8") patch.number = undefined;
  updateObject(object.id, patch);
}

function labelForType(type: DrillEditorObjectType) {
  return type.replaceAll("_", " ");
}

function canEditColor(object: DrillEditorObject) {
  if (object.type === "coach" || object.type === "ball") return false;
  return true;
}

function canMirror(object: DrillEditorObject) {
  return object.type !== "arrow" && object.type !== "text";
}

function markerConnectionOptions(objects: DrillEditorObject[]) {
  return [
    { label: "Not connected", value: "" },
    ...objects
      .filter((object) => object.type === "marker")
      .map((object, index) => ({
        label: `Flat marker ${index + 1}${object.color ? ` (${object.color})` : ""}`,
        value: `marker:${object.id}`
      }))
  ];
}

function lineEndpointConnectionOptions(objects: DrillEditorObject[], currentLineId: string) {
  const lines = objects.filter((object) => object.type === "arrow" && object.id !== currentLineId);
  return [
    { label: "Not connected", value: "" },
    ...lines.flatMap((object, index) => {
      const label = lineConnectionLabel(object, index);
      return [
        { label: `${label} start`, value: `line:${object.id}:start` },
        { label: `${label} end`, value: `line:${object.id}:end` }
      ];
    })
  ];
}

function lineConnectionLabel(object: DrillEditorObject, index: number) {
  if (object.lineStyle === "dashed") return `Dashed arrow ${index + 1}`;
  if (object.lineStyle === "slalom") return `Slalom line ${index + 1}`;
  return `Line ${index + 1}`;
}

function markerAnchorSelectValue(object: DrillEditorObject, endpoint: "start" | "end") {
  const type = endpoint === "start" ? object.startAnchorType : object.endAnchorType;
  const objectId = endpoint === "start" ? object.startAnchorObjectId : object.endAnchorObjectId;
  return type === "marker" && objectId ? `marker:${objectId}` : "";
}

function lineEndpointAnchorSelectValue(object: DrillEditorObject, endpoint: "start" | "end") {
  const type = endpoint === "start" ? object.startAnchorType : object.endAnchorType;
  const objectId = endpoint === "start" ? object.startAnchorObjectId : object.endAnchorObjectId;
  const anchorEndpoint = endpoint === "start" ? object.startAnchorEndpoint : object.endAnchorEndpoint;
  return type === "line-endpoint" && objectId && anchorEndpoint ? `line:${objectId}:${anchorEndpoint}` : "";
}

function getViewTransform(pitch: DrillEditorState["pitch"]) {
  if (pitch === "Half pitch") {
    const fullGeometry = pitchGeometry("Full football pitch");
    if (!fullGeometry) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const clip = halfPitchClip(fullGeometry);
    const cameraScale = Math.min(stageWidth / clip.width, stageHeight / clip.height);
    return {
      x: (stageWidth - clip.width * cameraScale) / 2 - clip.x * cameraScale,
      y: (stageHeight - clip.height * cameraScale) / 2 - clip.y * cameraScale,
      scaleX: cameraScale,
      scaleY: cameraScale
    };
  }

  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}

function halfPitchClip(geometry: PitchGeometry) {
  return {
    x: geometry.offsetX - pitchOverviewPadding,
    y: geometry.offsetY - pitchOverviewPadding,
    width: (pitchLengthM / 2) * geometry.scale + pitchOverviewPadding * 2,
    height: pitchWidthM * geometry.scale + pitchOverviewPadding * 2
  };
}

function viewClipProps(pitch: DrillEditorState["pitch"]) {
  if (pitch !== "Half pitch") return {};
  const geometry = pitchGeometry("Full football pitch");
  if (!geometry) return {};
  const clip = halfPitchClip(geometry);
  return {
    clipX: clip.x,
    clipY: clip.y,
    clipWidth: clip.width,
    clipHeight: clip.height
  };
}

function viewX(x: number, transform: ReturnType<typeof getViewTransform>) {
  return transform.x + x * transform.scaleX;
}

function viewY(y: number, transform: ReturnType<typeof getViewTransform>) {
  return transform.y + y * transform.scaleY;
}

function inverseViewPoint(point: { x: number; y: number }, transform: ReturnType<typeof getViewTransform>) {
  return {
    x: (point.x - transform.x) / transform.scaleX,
    y: (point.y - transform.y) / transform.scaleY
  };
}

function PitchBackground({ pitch, pitchStyle }: { pitch: DrillEditorState["pitch"]; pitchStyle: DrillEditorState["pitchStyle"] }) {
  const line = "rgba(255,255,255,0.9)";
  const surface = pitch === "Empty field / blank" ? "#2f7a50" : "#28764A";
  const geometry = pitchGeometry(pitch);
  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={stageWidth} height={stageHeight} fill={surface} />
      {pitch === "Empty grid" ? (
        Array.from({ length: 28 }).map((_, index) => (
          <Line
            key={index}
            points={index % 2 === 0 ? [index * 30, 0, index * 30, stageHeight] : [0, index * 20, stageWidth, index * 20]}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
        ))
      ) : pitch === "Empty field / blank" || !geometry ? null : (
        <>
          {pitchStyle === "Striped green" ? <PitchStripes geometry={geometry} /> : null}
          <PitchLines pitch={pitch} geometry={geometry} line={line} />
        </>
      )}
    </Group>
  );
}

type PitchGeometry = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

const pitchLengthM = 105;
const pitchWidthM = 68;
const penaltyDepthM = 16.5;
const penaltyWidthM = 40.32;
const goalAreaDepthM = 5.5;
const goalAreaWidthM = 18.32;
const centerCircleRadiusM = 9.15;
const penaltySpotM = 11;
const goalWidthM = 7.32;
const normalGoalGroundOffsetM = 1.5;

function pitchGeometry(pitch: DrillEditorState["pitch"]): PitchGeometry | null {
  if (pitch === "Empty grid" || pitch === "Empty field / blank") return null;
  const view =
    pitch === "Full football pitch"
      ? { minX: 0, maxX: pitchLengthM, minY: 0, maxY: pitchWidthM }
      : { minX: 0, maxX: pitchLengthM / 2, minY: 0, maxY: pitchWidthM };
  const margin = 20;
  const scale = Math.min((stageWidth - margin * 2) / (view.maxX - view.minX), (stageHeight - margin * 2) / (view.maxY - view.minY));
  const drawWidth = (view.maxX - view.minX) * scale;
  const drawHeight = (view.maxY - view.minY) * scale;

  return {
    ...view,
    offsetX: (stageWidth - drawWidth) / 2,
    offsetY: (stageHeight - drawHeight) / 2,
    scale
  };
}

function projectPoint(geometry: PitchGeometry, x: number, y: number) {
  return {
    x: geometry.offsetX + (x - geometry.minX) * geometry.scale,
    y: geometry.offsetY + (y - geometry.minY) * geometry.scale
  };
}

function PitchStripes({ geometry }: { geometry: PitchGeometry }) {
  const stripeMeters = 5.5;
  const firstStripe = Math.floor(geometry.minX / stripeMeters) * stripeMeters;
  return (
    <>
      {Array.from({ length: Math.ceil((geometry.maxX - firstStripe) / stripeMeters) }).map((_, index) => {
        const stripeStart = firstStripe + index * stripeMeters;
        const stripeEnd = stripeStart + stripeMeters;
        const visibleStart = Math.max(stripeStart, geometry.minX);
        const visibleEnd = Math.min(stripeEnd, geometry.maxX);
        const topLeft = projectPoint(geometry, visibleStart, geometry.minY);
        const bottomRight = projectPoint(geometry, visibleEnd, geometry.maxY);
        return (
          <Rect
            key={index}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            fill={index % 2 === 0 ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)"}
          />
        );
      })}
    </>
  );
}

function PitchLines({ pitch, geometry, line }: { pitch: DrillEditorState["pitch"]; geometry: PitchGeometry; line: string }) {
  const centerY = pitchWidthM / 2;
  const showRight = pitch === "Full football pitch";
  const showCenter = pitch === "Full football pitch" || pitch === "Half pitch";
  const fieldTopLeft = projectPoint(geometry, 0, 0);
  const fieldBottomRight = projectPoint(geometry, pitchLengthM, pitchWidthM);
  const visibleFieldLeft = Math.max(fieldTopLeft.x, geometry.offsetX);
  const visibleFieldRight = Math.min(fieldBottomRight.x, geometry.offsetX + (geometry.maxX - geometry.minX) * geometry.scale);
  const visibleFieldTop = Math.max(fieldTopLeft.y, geometry.offsetY);
  const visibleFieldBottom = Math.min(fieldBottomRight.y, geometry.offsetY + (geometry.maxY - geometry.minY) * geometry.scale);

  return (
    <>
      <Rect x={visibleFieldLeft} y={visibleFieldTop} width={visibleFieldRight - visibleFieldLeft} height={visibleFieldBottom - visibleFieldTop} stroke={line} strokeWidth={3} />
      {showCenter ? <MeterLine geometry={geometry} points={[pitchLengthM / 2, 0, pitchLengthM / 2, pitchWidthM]} stroke={line} strokeWidth={2} /> : null}
      {showCenter ? (
        <>
          <MeterCircle geometry={geometry} x={pitchLengthM / 2} y={centerY} radius={centerCircleRadiusM} stroke={line} strokeWidth={2} />
          <MeterCircle geometry={geometry} x={pitchLengthM / 2} y={centerY} radius={0.45} fill={line} />
        </>
      ) : null}
      <PenaltyMarkings geometry={geometry} side="left" line={line} />
      {showRight ? <PenaltyMarkings geometry={geometry} side="right" line={line} /> : null}
    </>
  );
}

function MeterLine({ geometry, points, stroke, strokeWidth }: { geometry: PitchGeometry; points: [number, number, number, number]; stroke: string; strokeWidth: number }) {
  const start = projectPoint(geometry, points[0], points[1]);
  const end = projectPoint(geometry, points[2], points[3]);
  return <Line points={[start.x, start.y, end.x, end.y]} stroke={stroke} strokeWidth={strokeWidth} />;
}

function MeterCircle({
  geometry,
  x,
  y,
  radius,
  stroke,
  strokeWidth,
  fill
}: {
  geometry: PitchGeometry;
  x: number;
  y: number;
  radius: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const center = projectPoint(geometry, x, y);
  return <KonvaCircle x={center.x} y={center.y} radius={radius * geometry.scale} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
}

function MeterRect({ geometry, x, y, width, height, stroke }: { geometry: PitchGeometry; x: number; y: number; width: number; height: number; stroke: string }) {
  const topLeft = projectPoint(geometry, x, y);
  return <Rect x={topLeft.x} y={topLeft.y} width={width * geometry.scale} height={height * geometry.scale} stroke={stroke} strokeWidth={2} />;
}

function PenaltyMarkings({ geometry, side, line }: { geometry: PitchGeometry; side: "left" | "right"; line: string }) {
  const isLeft = side === "left";
  const goalLine = isLeft ? 0 : pitchLengthM;
  const direction = isLeft ? 1 : -1;
  const penaltyX = isLeft ? 0 : pitchLengthM - penaltyDepthM;
  const goalAreaX = isLeft ? 0 : pitchLengthM - goalAreaDepthM;
  const penaltyY = (pitchWidthM - penaltyWidthM) / 2;
  const goalAreaY = (pitchWidthM - goalAreaWidthM) / 2;
  const spotX = goalLine + direction * penaltySpotM;

  return (
    <>
      <BackgroundGoal geometry={geometry} goalLine={goalLine} centerY={pitchWidthM / 2} side={side} />
      <MeterRect geometry={geometry} x={penaltyX} y={penaltyY} width={penaltyDepthM} height={penaltyWidthM} stroke={line} />
      <MeterRect geometry={geometry} x={goalAreaX} y={goalAreaY} width={goalAreaDepthM} height={goalAreaWidthM} stroke={line} />
      <MeterCircle geometry={geometry} x={spotX} y={pitchWidthM / 2} radius={0.45} fill={line} />
      <PenaltyArc geometry={geometry} spotX={spotX} spotY={pitchWidthM / 2} side={side} line={line} />
    </>
  );
}

function PenaltyArc({ geometry, spotX, spotY, side, line }: { geometry: PitchGeometry; spotX: number; spotY: number; side: "left" | "right"; line: string }) {
  const points: number[] = [];
  const startDeg = side === "left" ? -52 : 128;
  const endDeg = side === "left" ? 52 : 232;
  for (let degree = startDeg; degree <= endDeg; degree += 3) {
    const radians = (degree * Math.PI) / 180;
    const point = projectPoint(geometry, spotX + Math.cos(radians) * centerCircleRadiusM, spotY + Math.sin(radians) * centerCircleRadiusM);
    points.push(point.x, point.y);
  }
  return <Line points={points} stroke={line} strokeWidth={2} lineCap="round" lineJoin="round" />;
}

function BackgroundGoal({ geometry, goalLine, centerY, side }: { geometry: PitchGeometry; goalLine: number; centerY: number; side: "left" | "right" }) {
  const direction = side === "left" ? -1 : 1;
  const x = projectPoint(geometry, goalLine, centerY).x;
  const top = projectPoint(geometry, goalLine, centerY - goalWidthM / 2).y;
  const bottom = projectPoint(geometry, goalLine, centerY + goalWidthM / 2).y;
  const depth = 2.2 * geometry.scale;
  return (
    <>
      <Rect x={side === "left" ? x - depth : x} y={top} width={depth} height={bottom - top} stroke="rgba(255,255,255,0.88)" strokeWidth={2} />
      <Line points={[x, top, x + direction * depth, top + depth * 0.45, x + direction * depth, bottom - depth * 0.45, x, bottom]} stroke="rgba(255,255,255,0.58)" strokeWidth={1.5} />
      <Line points={[x + direction * depth * 0.5, top + 2, x + direction * depth * 0.5, bottom - 2]} stroke="rgba(255,255,255,0.34)" strokeWidth={1} />
    </>
  );
}

function EditorObject({
  object,
  selected,
  multiSelected,
  zoom,
  onSelect,
  onContextMenu,
  onChange,
  onCaptureHistory,
  onMoveStart,
  onMove,
  onMoveEnd,
  onRotationGuide,
  onRotationGuideEnd,
  onAlignmentGuides,
  objects,
  onTextEdit
}: {
  object: DrillEditorObject;
  selected: boolean;
  multiSelected: boolean;
  zoom: number;
  onSelect: (event?: SelectEvent) => void;
  onContextMenu: (event: SelectEvent) => void;
  onChange: (patch: Partial<DrillEditorObject>, options?: { history?: boolean }) => void;
  onCaptureHistory: () => void;
  onMoveStart: () => void;
  onMove: (x: number, y: number) => { x: number; y: number };
  onMoveEnd: () => void;
  onRotationGuide: (guide: RotationGuide | null) => void;
  onRotationGuideEnd: () => void;
  onAlignmentGuides: (guides: AlignmentGuide[]) => void;
  objects: DrillEditorObject[];
  onTextEdit: (object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const scale = object.scale ?? 1;

  useEffect(() => {
    if (object.type === "arrow" || !selected || multiSelected || !groupRef.current || !transformerRef.current) return;
    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [object.type, selected, multiSelected]);

  if (object.type === "arrow") {
    return (
      <EditorLine
        object={object}
        objects={objects}
        selected={selected}
        multiSelected={multiSelected}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        onChange={onChange}
        onCaptureHistory={onCaptureHistory}
        onMoveStart={onMoveStart}
        onMove={onMove}
        onMoveEnd={onMoveEnd}
        onAlignmentGuides={onAlignmentGuides}
      />
    );
  }

  function persistTransform() {
    const node = groupRef.current;
    if (!node) return;
    const nextScale = clamp(node.scaleX(), minObjectScale, maxObjectScale);
    node.scaleX(nextScale);
    node.scaleY(nextScale);
    onChange({
      x: node.x(),
      y: node.y(),
      rotation: positiveRotation(node.rotation()),
      scale: nextScale
    });
    onRotationGuideEnd();
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={object.x}
        y={object.y}
        rotation={object.rotation}
        scaleX={scale}
        scaleY={scale}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onContextMenu={onContextMenu}
        onDblClick={onSelect}
        onDragStart={onMoveStart}
        onDragMove={(event: DragEvent) => {
          const snapped = onMove(event.target.x(), event.target.y());
          event.target.x(snapped.x);
          event.target.y(snapped.y);
        }}
        onDragEnd={onMoveEnd}
        onTransformEnd={persistTransform}
      >
        <Group scaleX={objectBaseSizeFactor} scaleY={objectBaseSizeFactor}>
          {object.type === "goal" ? <NormalGoal object={object} /> : null}
          {object.type === "mini_goal" ? <MiniGoal object={object} /> : null}
          {object.type === "text" ? <LabelObject object={object} onTextEdit={onTextEdit} /> : null}
          {object.type === "cone" ? <ConeObject object={object} /> : null}
          {object.type === "marker" ? <MarkerObject object={object} /> : null}
          {object.type === "ring" ? <RingObject object={object} /> : null}
          {object.type === "ball" ? <BallObject object={object} /> : null}
          {object.type === "bib" ? <BibObject object={object} onTextEdit={onTextEdit} /> : null}
          {object.type === "pole" ? <PoleObject object={object} /> : null}
          {object.type === "mannequin" ? <MannequinObject object={object} /> : null}
          {object.type === "player" || object.type === "goalkeeper" || object.type === "coach" ? <PlayerObject object={object} onTextEdit={onTextEdit} /> : null}
        </Group>
      </Group>
      {selected && !multiSelected ? (
        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
          keepRatio
          borderStroke="#111827"
          borderDash={[5, 5]}
          anchorStroke="#111827"
          anchorFill="#ffffff"
          anchorSize={7 / zoom}
          borderStrokeWidth={1.5 / zoom}
          anchorStrokeWidth={1.5 / zoom}
          boundBoxFunc={(oldBox, newBox) => {
            const bounds = objectBounds(object);
            const minSize = Math.max(bounds.width, bounds.height) * minObjectScale * zoom;
            const maxSize = Math.max(bounds.width, bounds.height) * maxObjectScale * zoom;
            if (Math.max(newBox.width, newBox.height) < minSize || Math.max(newBox.width, newBox.height) > maxSize) {
              return oldBox;
            }
            return newBox;
          }}
        />
      ) : null}
      {selected && !multiSelected ? (
        <CustomRotationHandle
          object={object}
          zoom={zoom}
          onChange={(rotation) => onChange({ rotation }, { history: false })}
          onCaptureHistory={onCaptureHistory}
          onGuide={onRotationGuide}
          onGuideEnd={onRotationGuideEnd}
        />
      ) : null}
    </>
  );
}

function GroupRotationHandle({
  bounds,
  handlePoint,
  zoom,
  toCanvasPoint,
  onDragStart,
  onDragMove,
  onDragEnd
}: {
  bounds: EditorBounds;
  handlePoint?: { x: number; y: number };
  zoom: number;
  toCanvasPoint: (event: DragPointEvent) => { x: number; y: number } | null;
  onDragStart: (point: { x: number; y: number }) => void;
  onDragMove: (point: { x: number; y: number }) => void;
  onDragEnd: (point: { x: number; y: number }) => void;
}) {
  const center = boundsCenter(bounds);
  const handle = handlePoint ?? groupRotationHandlePosition(bounds);

  function eventPoint(event: DragPointEvent) {
    const canvasPoint = toCanvasPoint(event);
    if (canvasPoint) return canvasPoint;
    return {
      x: finiteNumber(event.target.x(), handle.x),
      y: finiteNumber(event.target.y(), handle.y)
    };
  }

  return (
    <Group>
      <Rect
        x={bounds.minX}
        y={bounds.minY}
        width={bounds.maxX - bounds.minX}
        height={bounds.maxY - bounds.minY}
        stroke="#16a34a"
        strokeWidth={1.25 / zoom}
        dash={[5, 4]}
        listening={false}
      />
      <KonvaCircle
        x={handle.x}
        y={handle.y}
        radius={8 / zoom}
        fill="#ffffff"
        stroke="#16a34a"
        strokeWidth={2 / zoom}
        draggable
        onDragStart={(event: DragPointEvent) => {
          event.cancelBubble = true;
          onDragStart(eventPoint(event));
        }}
        onDragMove={(event: DragPointEvent) => {
          event.cancelBubble = true;
          onDragMove(eventPoint(event));
        }}
        onDragEnd={(event: DragPointEvent) => {
          event.cancelBubble = true;
          onDragEnd(eventPoint(event));
        }}
      />
      <KonvaCircle x={center.x} y={center.y} radius={2.5 / zoom} fill="#16a34a" listening={false} />
    </Group>
  );
}

function GroupScaleHandle({
  bounds,
  zoom,
  toCanvasPoint,
  onDragStart,
  onDragMove,
  onDragEnd
}: {
  bounds: EditorBounds;
  zoom: number;
  toCanvasPoint: (event: DragPointEvent) => { x: number; y: number } | null;
  onDragStart: (point: { x: number; y: number }) => void;
  onDragMove: (point: { x: number; y: number }) => void;
  onDragEnd: (point: { x: number; y: number }) => void;
}) {
  const handle = { x: bounds.maxX, y: bounds.maxY };
  function eventPoint(event: DragPointEvent) {
    const canvasPoint = toCanvasPoint(event);
    if (canvasPoint) return canvasPoint;
    return {
      x: finiteNumber(event.target.x(), handle.x),
      y: finiteNumber(event.target.y(), handle.y)
    };
  }

  return (
    <KonvaCircle
      x={handle.x}
      y={handle.y}
      radius={6 / zoom}
      fill="#ffffff"
      stroke="#111827"
      strokeWidth={1.8 / zoom}
      draggable
      onDragStart={(event: DragPointEvent) => {
        event.cancelBubble = true;
        onDragStart(eventPoint(event));
      }}
      onDragMove={(event: DragPointEvent) => {
        event.cancelBubble = true;
        onDragMove(eventPoint(event));
      }}
      onDragEnd={(event: DragPointEvent) => {
        event.cancelBubble = true;
        onDragEnd(eventPoint(event));
      }}
    />
  );
}

function EditorContextMenu({
  menu,
  canGroup,
  canUngroup,
  onClose,
  onLayer,
  onGroup,
  onUngroup,
  onDuplicate,
  onDelete
}: {
  menu: NonNullable<ContextMenuState>;
  canGroup: boolean;
  canUngroup: boolean;
  onClose: () => void;
  onLayer: (action: "forward" | "backward" | "front" | "back") => void;
  onGroup: () => void;
  onUngroup: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  function action(callback: () => void) {
    return (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      callback();
      onClose();
    };
  }

  return (
    <div
      className="fixed z-50 w-48 overflow-hidden rounded-lg border border-board-line bg-white py-1 text-sm shadow-xl"
      style={{ left: menu.x, top: menu.y }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <MenuButton onClick={action(() => onLayer("front"))}>Bring to front</MenuButton>
      <MenuButton onClick={action(() => onLayer("forward"))}>Bring forward</MenuButton>
      <MenuButton onClick={action(() => onLayer("backward"))}>Send backward</MenuButton>
      <MenuButton onClick={action(() => onLayer("back"))}>Send to back</MenuButton>
      <div className="my-1 border-t border-board-line" />
      <MenuButton onClick={action(onGroup)} disabled={!canGroup}>Group</MenuButton>
      <MenuButton onClick={action(onUngroup)} disabled={!canUngroup}>Ungroup</MenuButton>
      <div className="my-1 border-t border-board-line" />
      <MenuButton onClick={action(onDuplicate)}>Duplicate</MenuButton>
      <MenuButton onClick={action(onDelete)} danger>Delete</MenuButton>
    </div>
  );
}

function MenuButton({ children, onClick, disabled, danger }: { children: ReactNode; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`block w-full px-3 py-2 text-left font-semibold disabled:cursor-not-allowed disabled:text-slate-300 ${danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-green-50"}`}
    >
      {children}
    </button>
  );
}

function CustomRotationHandle({
  object,
  zoom,
  onChange,
  onCaptureHistory,
  onGuide,
  onGuideEnd
}: {
  object: DrillEditorObject;
  zoom: number;
  onChange: (rotation: number) => void;
  onCaptureHistory: () => void;
  onGuide: (guide: RotationGuide | null) => void;
  onGuideEnd: () => void;
}) {
  const handle = rotationHandlePosition(object);

  function updateRotation(event: DragPointEvent) {
    event.cancelBubble = true;
    const dx = event.target.x() - object.x;
    const dy = event.target.y() - object.y;
    const rotation = positiveRotation((Math.atan2(dy, dx) * 180) / Math.PI + 90);
    const guideAngle = nearestCardinalAngle(rotation);
    onChange(rotation);
    onGuide(guideAngle === null ? null : { x: object.x, y: object.y, label: `${guideAngle}°` });
  }

  return (
    <Group>
      <KonvaCircle
        x={handle.x}
        y={handle.y}
        radius={7 / zoom}
        fill="#ffffff"
        stroke="#16a34a"
        strokeWidth={2 / zoom}
        draggable
        onDragStart={(event: DragPointEvent) => {
          event.cancelBubble = true;
          onCaptureHistory();
        }}
        onDragMove={updateRotation}
        onDragEnd={(event: DragPointEvent) => {
          updateRotation(event);
          onGuideEnd();
        }}
      />
    </Group>
  );
}

function PlayerObject({
  object,
  onTextEdit
}: {
  object: DrillEditorObject;
  onTextEdit: (object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) => void;
}) {
  const label = object.name ?? "";
  const variant = object.type === "coach" ? object.variant ?? "pointing" : object.variant ?? "circle";

  if (variant !== "circle") {
    return <BodyPlayerObject object={object} variant={variant} onTextEdit={onTextEdit} />;
  }

  return (
    <>
      <Group scaleX={object.mirrored ? -1 : 1}>
        <KonvaCircle radius={12} fill={object.color} stroke="#ffffff" strokeWidth={2} shadowColor="rgba(15,23,42,0.25)" shadowBlur={4} shadowOffsetY={1} />
        {object.type === "goalkeeper" ? <Rect x={-8} y={-4} width={16} height={8} fill="rgba(255,255,255,0.22)" cornerRadius={2} /> : null}
      </Group>
      {object.number ? (
        <Text
          text={object.number}
          fill="#ffffff"
          fontStyle="bold"
          align="center"
          width={24}
          offsetX={12}
          offsetY={6}
          fontSize={10.5}
          onDblClick={() => onTextEdit(object, "number", -14, -12, 40)}
          onDblTap={() => onTextEdit(object, "number", -14, -12, 40)}
        />
      ) : null}
      {label ? (
        <>
          <Rect x={-28} y={13} width={56} height={14} fill="rgba(255,255,255,0.9)" cornerRadius={4} />
          <Text
            text={label}
            x={-26}
            y={15}
            width={52}
            align="center"
            fill="#111827"
            fontSize={8.5}
            fontStyle="bold"
            onDblClick={() => onTextEdit(object, "name", -28, 12, 68)}
            onDblTap={() => onTextEdit(object, "name", -28, 12, 68)}
          />
        </>
      ) : null}
    </>
  );
}

function BodyPlayerObject({
  object,
  variant,
  onTextEdit
}: {
  object: DrillEditorObject;
  variant: string;
  onTextEdit: (object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) => void;
}) {
  const icon = playerIconFor(object.type, variant);

  return (
    <>
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon
          icon={icon}
          color={object.color}
          jerseyColorize={object.type === "player" || object.type === "goalkeeper"}
          targetHeight={object.type === "coach" ? 52 : 46}
        />
      </Group>
      {object.number ? (
        <Text
          text={object.number}
          x={-17}
          y={-12}
          width={34}
          align="center"
          fill="#ffffff"
          fontSize={13}
          fontStyle="bold"
          onDblClick={() => onTextEdit(object, "number", -20, -16, 52)}
          onDblTap={() => onTextEdit(object, "number", -20, -16, 52)}
        />
      ) : null}
      {object.name ? (
        <Text
          text={object.name}
          x={-34}
          y={25}
          width={68}
          align="center"
          fill="#111827"
          fontSize={11}
          fontStyle="bold"
          onDblClick={() => onTextEdit(object, "name", -34, 23, 78)}
          onDblTap={() => onTextEdit(object, "name", -34, 23, 78)}
        />
      ) : null}
    </>
  );
}

function playerIconFor(type: DrillEditorObjectType, variant: string): SvgIconKey {
  if (type === "goalkeeper") return variant === "with-ball" ? "goalkeeperWithBall" : "goalkeeper";
  if (type === "coach") return variant === "coach-ball" ? "coachWithBall" : "coach";
  if (variant === "running") return "playerRunning";
  if (variant === "passing") return "playerPassing";
  if (variant === "jogging") return "playerJogging";
  if (variant === "with-ball") return "playerWithBall";
  if (variant === "ball-hand") return "playerBallHand";
  return "playerStanding";
}

function ConeObject({ object }: { object: DrillEditorObject }) {
  if (object.variant === "stripe") {
    return (
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon icon="coneStripe" color={object.color} colorize targetHeight={13} />
      </Group>
    );
  }

  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <SvgAssetIcon filename="Cone Simple.svg" width={18} height={18} color={object.color} />
    </Group>
  );
}

function MarkerObject({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <SvgIcon icon="marker" color={object.color} colorize targetWidth={11} />
    </Group>
  );
}

function RingObject({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <SvgIcon icon="ring" color={object.color} colorize targetWidth={21} />
    </Group>
  );
}

function BallObject({ object }: { object: DrillEditorObject }) {
  const variant = object.variant;
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      {variant === "tennis" ? <SvgAssetIcon filename="Tennis Ball.svg" size={11} /> : null}
      {variant === "basketball" ? <SvgAssetIcon filename="Basketball.svg" size={25} /> : null}
      {variant !== "tennis" && variant !== "basketball" ? <SvgAssetIcon filename="Football.svg" size={variant === "small-football" ? 14 : 21} /> : null}
    </Group>
  );
}

function SvgAssetIcon({ filename, size, width, height, color }: { filename: string; size?: number; width?: number; height?: number; color?: string }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const displayWidth = width ?? size ?? 24;
  const displayHeight = height ?? size ?? displayWidth;

  useEffect(() => {
    const nextImage = new window.Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => setImage(nextImage);
    nextImage.src = `/api/editor-icons/${encodeURIComponent(filename)}${color ? `?color=${encodeURIComponent(color)}` : ""}`;
  }, [color, filename]);

  return (
    <>
      <Rect x={-displayWidth / 2} y={-displayHeight / 2} width={displayWidth} height={displayHeight} fill="rgba(0,0,0,0)" />
      {image ? (
        <KonvaImage image={image} x={-displayWidth / 2} y={-displayHeight / 2} width={displayWidth} height={displayHeight} listening={false} />
      ) : null}
    </>
  );
}

function BibObject({
  object,
  onTextEdit
}: {
  object: DrillEditorObject;
  onTextEdit: (object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) => void;
}) {
  const height = object.variant === "tall" ? 70 : 58;
  return (
    <Group scaleX={0.29} scaleY={0.29}>
      <Group scaleX={object.mirrored ? -1 : 1}>
        <Line
          points={[-24, -height / 2 + 5, -10, -height / 2, -4, -20, 4, -20, 10, -height / 2, 24, -height / 2 + 5, 18, height / 2, -18, height / 2]}
          closed
          fill={object.color}
          stroke="#111827"
          strokeWidth={2}
          lineJoin="round"
        />
        <Line points={[-7, -height / 2 + 4, 7, -height / 2 + 4]} stroke="#e5e7eb" strokeWidth={5} lineCap="round" />
      </Group>
      {object.number ? (
        <Text
          text={object.number}
          x={-18}
          y={-3}
          width={36}
          align="center"
          fill="#ffffff"
          fontSize={25}
          fontStyle="bold"
          onDblClick={() => onTextEdit(object, "number", -18, -8, 48)}
          onDblTap={() => onTextEdit(object, "number", -18, -8, 48)}
        />
      ) : null}
    </Group>
  );
}

function PoleObject({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <Rect x={-8} y={-20} width={16} height={40} fill="rgba(0,0,0,0)" />
      <SvgIcon icon="pole" color={object.color} colorize targetHeight={35} />
    </Group>
  );
}

function MannequinObject({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={(object.mirrored ? -1 : 1) * 0.72} scaleY={1.16}>
      <SvgIcon icon="mannequin" color={object.color} colorize targetHeight={41} />
    </Group>
  );
}

function NormalGoal({ object }: { object: DrillEditorObject }) {
  const variant = object.variant ?? "front";
  const hitWidth = goalBaseWidth(object) + 24;
  const hitHeight = goalBaseWidth(object) * 0.58;
  if (variant === "youth-front" || variant === "youth-angled") {
    return (
      <>
        <Rect x={-hitWidth / 2} y={-hitHeight / 2} width={hitWidth} height={hitHeight} fill="rgba(0,0,0,0)" />
        <Group scaleX={object.mirrored ? -1 : 1}>
          <SvgIcon icon="youthGoal" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
        </Group>
      </>
    );
  }
  if (variant === "right") {
    return (
      <>
        <Rect x={-hitWidth / 2} y={-hitHeight / 2} width={hitWidth} height={hitHeight} fill="rgba(0,0,0,0)" />
        <Group scaleX={object.mirrored ? -1 : 1}>
          <SvgIcon icon="goalRight" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
        </Group>
      </>
    );
  }
  if (variant === "angled") {
    return (
      <>
        <Rect x={-hitWidth / 2} y={-hitHeight / 2} width={hitWidth} height={hitHeight} fill="rgba(0,0,0,0)" />
        <Group scaleX={object.mirrored ? -1 : 1}>
          <SvgIcon icon="goalLeft" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
        </Group>
      </>
    );
  }
  return (
    <>
      <Rect x={-hitWidth / 2} y={-hitHeight / 2} width={hitWidth} height={hitHeight} fill="rgba(0,0,0,0)" />
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgAssetIcon filename="Goal.svg" width={goalBaseWidth(object)} height={goalBaseWidth(object) * 0.58} />
      </Group>
    </>
  );
}

function MiniGoal({ object }: { object: DrillEditorObject }) {
  const hitWidth = 52;
  const hitHeight = 34;
  return (
    <>
      <Rect x={-hitWidth / 2} y={-hitHeight / 2} width={hitWidth} height={hitHeight} fill="rgba(0,0,0,0)" />
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon icon="miniGoal" color={object.color} colorize targetWidth={34} />
      </Group>
    </>
  );
}

function LabelObject({
  object,
  onTextEdit
}: {
  object: DrillEditorObject;
  onTextEdit: (object: DrillEditorObject, field: EditableField, localX: number, localY: number, width: number) => void;
}) {
  const text = object.label || "Label";
  const width = Math.max(76, text.length * 11 + 24);
  const showBackground = object.showBackground ?? false;
  return (
    <>
      {showBackground ? (
        <Rect width={width} height={32} offsetX={width / 2} offsetY={16} fill="rgba(255,255,255,0.96)" stroke="rgba(15,23,42,0.22)" strokeWidth={1.5} cornerRadius={7} shadowColor="rgba(15,23,42,0.16)" shadowBlur={6} shadowOffsetY={2} />
      ) : null}
      <Text
        text={text}
        width={width}
        offsetX={width / 2}
        offsetY={9}
        align="center"
        fill={object.color}
        fontSize={17}
        fontStyle="bold"
        onDblClick={() => onTextEdit(object, "label", -width / 2, -18, width + 12)}
        onDblTap={() => onTextEdit(object, "label", -width / 2, -18, width + 12)}
      />
    </>
  );
}

function EditorLine({
  object,
  objects,
  selected,
  multiSelected,
  onSelect,
  onChange,
  onCaptureHistory,
  onMoveStart,
  onMove,
  onMoveEnd,
  onContextMenu,
  onAlignmentGuides
}: {
  object: DrillEditorObject;
  objects: DrillEditorObject[];
  selected: boolean;
  multiSelected: boolean;
  onSelect: (event?: SelectEvent) => void;
  onContextMenu: (event: SelectEvent) => void;
  onChange: (patch: Partial<DrillEditorObject>, options?: { history?: boolean }) => void;
  onCaptureHistory: () => void;
  onMoveStart: () => void;
  onMove: (x: number, y: number) => { x: number; y: number };
  onMoveEnd: () => void;
  onAlignmentGuides: (guides: AlignmentGuide[]) => void;
}) {
  const line = resolveLineObject(object, objects);
  const points = line.lineStyle === "slalom" ? slalomPoints(line) : linePoints(line);
  const thicknessLevel = normalizeThicknessLevel(object.thickness);
  const thickness = lineStrokeWidth(thicknessLevel);
  const arrowSize = arrowheadSize(thicknessLevel);
  const dash = object.lineStyle === "dashed" ? [18, 12] : undefined;
  const endX = line.endX ?? line.x + 120;
  const endY = line.endY ?? line.y;
  const controlX = line.controlX ?? midpoint(line.x, endX);
  const controlY = line.controlY ?? midpoint(line.y, endY);
  const angleGuide = selected ? lineCardinalAngleGuide(line, objects) : null;
  const lineDragBaseRef = useRef<{
    x: number;
    y: number;
    endX: number;
    endY: number;
    controlX: number;
    controlY: number;
  } | null>(null);
  const groupDragRef = useRef(false);

  function beginLineDrag(event: DragEvent) {
    event.cancelBubble = true;
    event.target.x(0);
    event.target.y(0);
    groupDragRef.current = multiSelected;
    if (groupDragRef.current) {
      lineDragBaseRef.current = { x: line.x, y: line.y, endX, endY, controlX, controlY };
      onMoveStart();
      return;
    }
    lineDragBaseRef.current = { x: line.x, y: line.y, endX, endY, controlX, controlY };
    onCaptureHistory();
  }

  function moveLine(event: DragEvent) {
    event.cancelBubble = true;
    if (groupDragRef.current) {
      const base = lineDragBaseRef.current ?? { x: line.x, y: line.y, endX, endY, controlX, controlY };
      const snapped = onMove(base.x + finiteNumber(event.target.x(), 0), base.y + finiteNumber(event.target.y(), 0));
      event.target.x(snapped.x - base.x);
      event.target.y(snapped.y - base.y);
      return;
    }
    const base = lineDragBaseRef.current ?? { x: line.x, y: line.y, endX, endY, controlX, controlY };
    const dx = finiteNumber(event.target.x(), 0);
    const dy = finiteNumber(event.target.y(), 0);
    onChange({
      x: base.x + dx,
      y: base.y + dy,
      endX: base.endX + dx,
      endY: base.endY + dy,
      startAnchorType: undefined,
      startAnchorObjectId: undefined,
      startAnchorEndpoint: undefined,
      startAnchorOffsetX: undefined,
      startAnchorOffsetY: undefined,
      endAnchorType: undefined,
      endAnchorObjectId: undefined,
      endAnchorEndpoint: undefined,
      endAnchorOffsetX: undefined,
      endAnchorOffsetY: undefined,
      controlX: base.controlX + dx,
      controlY: base.controlY + dy
    }, { history: false });
    const nextLine = {
      ...object,
      x: base.x + dx,
      y: base.y + dy,
      endX: base.endX + dx,
      endY: base.endY + dy,
      controlX: base.controlX + dx,
      controlY: base.controlY + dy,
      startAnchorType: undefined,
      startAnchorObjectId: undefined,
      startAnchorEndpoint: undefined,
      endAnchorType: undefined,
      endAnchorObjectId: undefined,
      endAnchorEndpoint: undefined
    };
    onAlignmentGuides(calculateLineAlignmentGuides({
      ...nextLine
    }, objects).concat(lineLengthGuide(nextLine, objects)));
  }

  function finishLineDrag(event: DragEvent) {
    moveLine(event);
    event.target.x(0);
    event.target.y(0);
    lineDragBaseRef.current = null;
    if (groupDragRef.current) {
      onMoveEnd();
      groupDragRef.current = false;
    }
    onAlignmentGuides([]);
  }

  function endpointPatch(endpoint: "start" | "end", x: number, y: number): Partial<DrillEditorObject> {
    const snapped = snapLineEndpointToCardinalAngle(
      endpoint,
      { startX: line.x, startY: line.y, endX, endY },
      finiteNumber(x, endpoint === "start" ? line.x : endX),
      finiteNumber(y, endpoint === "start" ? line.y : endY)
    );
    return lineEndpointMovePatch(
      object,
      endpoint,
      { startX: line.x, startY: line.y, endX, endY, controlX, controlY },
      snapped.x,
      snapped.y
    );
  }

  function updateEndpoint(endpoint: "start" | "end", x: number, y: number) {
    const patch = endpointPatch(endpoint, x, y);
    const nextLine = { ...object, ...patch };
    onChange(patch, { history: false });
    const angleGuide = lineCardinalAngleGuide(nextLine, objects);
    onAlignmentGuides([
      ...(angleGuide ? [angleGuide] : []),
      ...calculateLineAlignmentGuides(nextLine, objects),
      lineLengthGuide(nextLine, objects)
    ]);
  }

  return (
    <Group>
      {selected ? <Line points={points} stroke="rgba(255,255,255,0.72)" strokeWidth={thickness + 7} lineCap="round" lineJoin="round" tension={0.35} listening={false} /> : null}
      {object.lineStyle === "slalom" ? (
        <>
          <Line points={points} stroke={object.color} strokeWidth={thickness} lineCap="round" lineJoin="round" tension={0.35} hitStrokeWidth={18} onClick={onSelect} onTap={onSelect} onContextMenu={onContextMenu} />
          {lineShowsArrow(object) ? <Arrow points={lastSegment(points)} stroke={object.color} fill={object.color} strokeWidth={thickness} pointerLength={arrowSize} pointerWidth={arrowSize} onClick={onSelect} onTap={onSelect} onContextMenu={onContextMenu} /> : null}
        </>
      ) : (
        <>
          <Line points={points} stroke={object.color} strokeWidth={thickness} dash={dash} lineCap="round" lineJoin="round" tension={0.5} hitStrokeWidth={18} onClick={onSelect} onTap={onSelect} onContextMenu={onContextMenu} />
          {lineShowsArrow(object) ? <Arrow points={lastSegment(points)} stroke={object.color} fill={object.color} strokeWidth={thickness} pointerLength={arrowSize} pointerWidth={arrowSize} dash={dash} onClick={onSelect} onTap={onSelect} onContextMenu={onContextMenu} /> : null}
        </>
      )}
      {object.label ? <Text text={object.label} x={controlX - 36} y={controlY - 28} width={72} align="center" fill={object.color} fontStyle="bold" /> : null}
      {object.startAnchorObjectId ? <KonvaCircle x={line.x} y={line.y} radius={5} fill="#22c55e" stroke="#ffffff" strokeWidth={1.5} listening={false} /> : null}
      {object.endAnchorObjectId ? <KonvaCircle x={endX} y={endY} radius={5} fill="#22c55e" stroke="#ffffff" strokeWidth={1.5} listening={false} /> : null}
      {angleGuide ? (
        <Group listening={false}>
          <Line points={angleGuide.points} stroke="#16a34a" strokeWidth={2.5} opacity={0.72} />
          <Rect x={angleGuide.labelX - 25} y={angleGuide.labelY - 12} width={50} height={24} fill="rgba(22,101,52,0.9)" cornerRadius={6} />
          <Text text={angleGuide.label} x={angleGuide.labelX - 25} y={angleGuide.labelY - 8} width={50} align="center" fill="#ffffff" fontSize={12} fontStyle="bold" />
        </Group>
      ) : null}
      <Line
        points={points}
        stroke="rgba(0,0,0,0.01)"
        strokeWidth={Math.max(thickness, 8)}
        lineCap="round"
        lineJoin="round"
        tension={object.lineStyle === "slalom" ? 0.35 : 0.5}
        hitStrokeWidth={24}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onContextMenu={onContextMenu}
        onDragStart={beginLineDrag}
        onDragMove={moveLine}
        onDragEnd={finishLineDrag}
      />
      {selected && !multiSelected ? (
        <>
          <EndpointHandle
            x={line.x}
            y={line.y}
            onDragStart={onCaptureHistory}
            onDragMove={(x, y) => updateEndpoint("start", x, y)}
            onDragEnd={(x, y) => {
              updateEndpoint("start", x, y);
              onAlignmentGuides([]);
            }}
          />
          <EndpointHandle
            x={endX}
            y={endY}
            onDragStart={onCaptureHistory}
            onDragMove={(x, y) => updateEndpoint("end", x, y)}
            onDragEnd={(x, y) => {
              updateEndpoint("end", x, y);
              onAlignmentGuides([]);
            }}
          />
          <CurveHandle
            x={controlX}
            y={controlY}
            onDragStart={onCaptureHistory}
            onDragMove={(x, y) => {
              const nextLine = { ...object, controlX: x, controlY: y, curveEdited: true };
              onChange({ controlX: x, controlY: y, curveEdited: true }, { history: false });
              onAlignmentGuides([lineLengthGuide(nextLine, objects)]);
            }}
            onDragEnd={() => onAlignmentGuides([])}
          />
        </>
      ) : null}
    </Group>
  );
}

function endpointCoordinatePatch(object: DrillEditorObject, endpoint: "start" | "end", axis: "x" | "y", value: number): Partial<DrillEditorObject> {
  const startX = finiteNumber(object.x, 0);
  const startY = finiteNumber(object.y, 0);
  const endX = finiteNumber(object.endX, startX + 120);
  const endY = finiteNumber(object.endY, startY);
  const controlX = finiteNumber(object.controlX, midpoint(startX, endX));
  const controlY = finiteNumber(object.controlY, midpoint(startY, endY));
  const nextX = endpoint === "start" ? (axis === "x" ? value : startX) : axis === "x" ? value : endX;
  const nextY = endpoint === "start" ? (axis === "y" ? value : startY) : axis === "y" ? value : endY;

  return lineEndpointMovePatch(object, endpoint, { startX, startY, endX, endY, controlX, controlY }, nextX, nextY);
}

function snapLineEndpointToCardinalAngle(
  endpoint: "start" | "end",
  geometry: { startX: number; startY: number; endX: number; endY: number },
  x: number,
  y: number
) {
  const pivot = endpoint === "start" ? { x: geometry.endX, y: geometry.endY } : { x: geometry.startX, y: geometry.startY };
  const distance = Math.hypot(x - pivot.x, y - pivot.y);
  if (distance < 8) return { x, y };

  const rawAngle = positiveRotation((Math.atan2(y - pivot.y, x - pivot.x) * 180) / Math.PI);
  const lineAngle = endpoint === "start" ? positiveRotation(rawAngle + 180) : rawAngle;
  const guideAngle = nearestCardinalAngle(lineAngle, 3);
  if (guideAngle === null) return { x, y };

  const endpointAngle = endpoint === "start" ? positiveRotation(guideAngle + 180) : guideAngle;
  const radians = (endpointAngle * Math.PI) / 180;
  return {
    x: pivot.x + Math.cos(radians) * distance,
    y: pivot.y + Math.sin(radians) * distance
  };
}

function lineCardinalAngleGuide(line: DrillEditorObject, objects: DrillEditorObject[]): AngleGuide | null {
  const geometry = lineGeometry(line, objects);
  const angle = positiveRotation((Math.atan2(geometry.end.y - geometry.start.y, geometry.end.x - geometry.start.x) * 180) / Math.PI);
  const guideAngle = nearestCardinalAngle(angle, 3);
  if (guideAngle === null) return null;

  const center = lineCenter(geometry);
  const lineLength = Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y);
  const halfLength = Math.max(lineLength / 2, 28);
  const radians = (guideAngle * Math.PI) / 180;
  const dx = Math.cos(radians) * halfLength;
  const dy = Math.sin(radians) * halfLength;

  return {
    type: "angle",
    points: [center.x - dx, center.y - dy, center.x + dx, center.y + dy],
    label: `${guideAngle}°`,
    labelX: center.x,
    labelY: center.y - 24
  };
}

function lineLengthGuide(line: DrillEditorObject, objects: DrillEditorObject[]): AlignmentGuide {
  const resolvedLine = resolveLineObject(line, objects);
  const points = resolvedLine.lineStyle === "slalom" ? slalomPoints(resolvedLine) : linePoints(resolvedLine);
  const geometry = lineGeometry(resolvedLine, objects);
  const center = {
    x: finiteNumber(resolvedLine.controlX, midpoint(geometry.start.x, geometry.end.x)),
    y: finiteNumber(resolvedLine.controlY, midpoint(geometry.start.y, geometry.end.y))
  };
  return {
    type: "length",
    label: formatMeters(pixelDistanceToMeters(pathLength(points))),
    labelX: center.x,
    labelY: center.y - 22
  };
}

function pathLength(points: number[]) {
  let length = 0;
  for (let index = 2; index < points.length; index += 2) {
    length += Math.hypot(points[index] - points[index - 2], points[index + 1] - points[index - 1]);
  }
  return length;
}

function lineEndpointMovePatch(
  object: DrillEditorObject,
  endpoint: "start" | "end",
  geometry: { startX: number; startY: number; endX: number; endY: number; controlX: number; controlY: number },
  x: number,
  y: number
): Partial<DrillEditorObject> {
  const nextX = finiteNumber(x, endpoint === "start" ? geometry.startX : geometry.endX);
  const nextY = finiteNumber(y, endpoint === "start" ? geometry.startY : geometry.endY);
  const nextStartX = endpoint === "start" ? nextX : geometry.startX;
  const nextStartY = endpoint === "start" ? nextY : geometry.startY;
  const nextEndX = endpoint === "end" ? nextX : geometry.endX;
  const nextEndY = endpoint === "end" ? nextY : geometry.endY;
  const editedCurve = object.curveEdited ?? false;
  const deltaX = endpoint === "start" ? nextStartX - geometry.startX : nextEndX - geometry.endX;
  const deltaY = endpoint === "start" ? nextStartY - geometry.startY : nextEndY - geometry.endY;
  const controlX = editedCurve ? geometry.controlX + deltaX / 2 : midpoint(nextStartX, nextEndX);
  const controlY = editedCurve ? geometry.controlY + deltaY / 2 : midpoint(nextStartY, nextEndY);

  return endpoint === "start"
    ? {
        x: nextStartX,
        y: nextStartY,
        controlX,
        controlY,
        startAnchorType: undefined,
        startAnchorObjectId: undefined,
        startAnchorEndpoint: undefined,
        startAnchorOffsetX: undefined,
        startAnchorOffsetY: undefined
      }
    : {
        endX: nextEndX,
        endY: nextEndY,
        controlX,
        controlY,
        endAnchorType: undefined,
        endAnchorObjectId: undefined,
        endAnchorEndpoint: undefined,
        endAnchorOffsetX: undefined,
        endAnchorOffsetY: undefined
      };
}

function EndpointHandle({
  x,
  y,
  onDragStart,
  onDragMove,
  onDragEnd
}: {
  x: number;
  y: number;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
}) {
  return (
    <KonvaCircle
      x={x}
      y={y}
      radius={8}
      fill="#ffffff"
      stroke="#111827"
      strokeWidth={2}
      draggable
      onDragStart={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragStart();
      }}
      onDragMove={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragMove(finiteNumber(event.target.x(), x), finiteNumber(event.target.y(), y));
      }}
      onDragEnd={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragEnd(finiteNumber(event.target.x(), x), finiteNumber(event.target.y(), y));
      }}
    />
  );
}

function CurveHandle({
  x,
  y,
  onDragStart,
  onDragMove,
  onDragEnd
}: {
  x: number;
  y: number;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
}) {
  return (
    <Rect
      x={x - 7}
      y={y - 7}
      width={14}
      height={14}
      fill="#fef3c7"
      stroke="#111827"
      strokeWidth={2}
      draggable
      onDragStart={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragStart();
      }}
      onDragMove={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragMove(finiteNumber(event.target.x() + 7, x), finiteNumber(event.target.y() + 7, y));
      }}
      onDragEnd={(event: DragEvent) => {
        event.cancelBubble = true;
        onDragEnd();
      }}
    />
  );
}

function linePoints(object: DrillEditorObject) {
  if (!object.curveEdited) {
    const startX = finiteNumber(object.x, 0);
    const startY = finiteNumber(object.y, 0);
    const endX = finiteNumber(object.endX, startX + 120);
    const endY = finiteNumber(object.endY, startY);
    return [startX, startY, endX, endY];
  }

  return curvedLinePoints(object);
}

function curvedLinePoints(object: DrillEditorObject) {
  const startX = finiteNumber(object.x, 0);
  const startY = finiteNumber(object.y, 0);
  const endX = finiteNumber(object.endX, startX + 120);
  const endY = finiteNumber(object.endY, startY);
  const controlX = finiteNumber(object.controlX, midpoint(startX, endX));
  const controlY = finiteNumber(object.controlY, midpoint(startY, endY));
  const points: number[] = [];
  const steps = 28;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const inverse = 1 - t;
    points.push(
      inverse * inverse * startX + 2 * inverse * t * controlX + t * t * endX,
      inverse * inverse * startY + 2 * inverse * t * controlY + t * t * endY
    );
  }

  return points;
}

function slalomPoints(object: DrillEditorObject) {
  const startX = finiteNumber(object.x, 0);
  const startY = finiteNumber(object.y, 0);
  const endX = finiteNumber(object.endX, startX + 120);
  const endY = finiteNumber(object.endY, startY);
  const controlX = finiteNumber(object.controlX, midpoint(startX, endX));
  const controlY = finiteNumber(object.controlY, midpoint(startY, endY));
  const points: number[] = [];
  const steps = 24;

  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const inverse = 1 - t;
    const baseX = inverse * inverse * startX + 2 * inverse * t * controlX + t * t * endX;
    const baseY = inverse * inverse * startY + 2 * inverse * t * controlY + t * t * endY;
    const tangentX = 2 * inverse * (controlX - startX) + 2 * t * (endX - controlX);
    const tangentY = 2 * inverse * (controlY - startY) + 2 * t * (endY - controlY);
    const length = Math.max(Math.hypot(tangentX, tangentY), 1);
    const normalX = -tangentY / length;
    const normalY = tangentX / length;
    const wave = index === 0 || index === steps ? 0 : Math.sin(t * Math.PI * 9) * slalomWaveAmplitude;
    points.push(baseX + normalX * wave, baseY + normalY * wave);
  }

  return points;
}

function lastSegment(points: number[]) {
  if (points.length < 4) return points;
  return points.slice(points.length - 4);
}

function copyObjectWithOffset(object: DrillEditorObject, offsetX: number, offsetY: number): DrillEditorObject {
  return {
    ...moveObjectBy(object, offsetX, offsetY),
    id: crypto.randomUUID(),
    ...(object.type === "arrow"
      ? {
          startAnchorObjectId: undefined,
          startAnchorOffsetX: undefined,
          startAnchorOffsetY: undefined,
          endAnchorObjectId: undefined,
          endAnchorOffsetX: undefined,
          endAnchorOffsetY: undefined
        }
      : {})
  };
}

function copyObjectsWithFreshGroups(objects: DrillEditorObject[], offsetX: number, offsetY: number) {
  const groupMap = new Map<string, string>();
  return objects.map((object) => {
    const copy = copyObjectWithOffset(object, offsetX, offsetY);
    if (!object.groupId) return { ...copy, groupId: undefined };
    const nextGroupId = groupMap.get(object.groupId) ?? crypto.randomUUID();
    groupMap.set(object.groupId, nextGroupId);
    return { ...copy, groupId: nextGroupId };
  });
}

function moveLayerBlock(objects: DrillEditorObject[], selectedIds: string[], action: "forward" | "backward" | "front" | "back") {
  const selected = new Set(selectedIds);
  const block = objects.filter((object) => selected.has(object.id));
  if (!block.length) return objects;
  const rest = objects.filter((object) => !selected.has(object.id));
  if (action === "front") return [...rest, ...block];
  if (action === "back") return [...block, ...rest];

  const indexes = objects.map((object, index) => (selected.has(object.id) ? index : -1)).filter((index) => index >= 0);
  const start = Math.min(...indexes);
  const end = Math.max(...indexes);
  if (action === "forward") {
    const after = objects.slice(end + 1).find((object) => !selected.has(object.id));
    if (!after) return objects;
    const afterIndex = rest.findIndex((object) => object.id === after.id);
    return [...rest.slice(0, afterIndex + 1), ...block, ...rest.slice(afterIndex + 1)];
  }

  const before = [...objects.slice(0, start)].reverse().find((object) => !selected.has(object.id));
  if (!before) return objects;
  const beforeIndex = rest.findIndex((object) => object.id === before.id);
  return [...rest.slice(0, beforeIndex), ...block, ...rest.slice(beforeIndex)];
}

function spawnOffset(index: number) {
  const offsets = [
    { x: 0, y: 0 },
    { x: 26, y: 0 },
    { x: -26, y: 0 },
    { x: 0, y: 26 },
    { x: 0, y: -26 },
    { x: 26, y: 26 },
    { x: -26, y: 26 },
    { x: 26, y: -26 },
    { x: -26, y: -26 }
  ];
  const cycle = offsets[index % offsets.length];
  const ring = Math.floor(index / offsets.length);
  return { x: cycle.x + ring * 14, y: cycle.y + ring * 14 };
}

function clampCanvasPoint(point: { x: number; y: number }) {
  return {
    x: clamp(point.x, 24, stageWidth - 24),
    y: clamp(point.y, 24, stageHeight - 24)
  };
}

function applyObjectMovements(objects: DrillEditorObject[], movements: Map<string, { dx: number; dy: number }>) {
  const cleanMovements = new Map(
    Array.from(movements.entries()).map(([id, movement]) => [
      id,
      {
        dx: Number.isFinite(movement.dx) ? movement.dx : 0,
        dy: Number.isFinite(movement.dy) ? movement.dy : 0
      }
    ])
  );
  const movedObjects = objects.map((object) => {
    const movement = cleanMovements.get(object.id);
    return movement ? moveObjectBy(object, movement.dx, movement.dy) : object;
  });

  return movedObjects.map((object) => {
    if (object.type !== "arrow" || cleanMovements.has(object.id)) return object;

    const startAnchor = anchorFromObject(object, "start", objects);
    const endAnchor = anchorFromObject(object, "end", objects);
    const startMovement = startAnchor?.type === "marker" ? cleanMovements.get(startAnchor.objectId) : undefined;
    const endMovement = endAnchor?.type === "marker" ? cleanMovements.get(endAnchor.objectId) : undefined;
    if (!startMovement && !endMovement) return object;

    const movedEndpointCount = Number(Boolean(startMovement)) + Number(Boolean(endMovement));
    const controlDx = ((startMovement?.dx ?? 0) + (endMovement?.dx ?? 0)) / movedEndpointCount;
    const controlDy = ((startMovement?.dy ?? 0) + (endMovement?.dy ?? 0)) / movedEndpointCount;

    return {
      ...object,
      ...(object.curveEdited || object.lineStyle === "slalom"
        ? {
            controlX: (object.controlX ?? midpoint(object.x, object.endX ?? object.x + 120)) + controlDx,
            controlY: (object.controlY ?? midpoint(object.y, object.endY ?? object.y)) + controlDy
          }
        : {})
    };
  });
}

function moveObjectBy(object: DrillEditorObject, dx: number, dy: number): DrillEditorObject {
  return {
    ...object,
    ...objectPositionPatch(object, dx, dy)
  };
}

function objectPositionPatch(object: DrillEditorObject, dx: number, dy: number): Partial<DrillEditorObject> {
  return {
    x: object.x + dx,
    y: object.y + dy,
    ...(object.endX !== undefined ? { endX: object.endX + dx } : {}),
    ...(object.endY !== undefined ? { endY: object.endY + dy } : {}),
    ...(object.controlX !== undefined ? { controlX: object.controlX + dx } : {}),
    ...(object.controlY !== undefined ? { controlY: object.controlY + dy } : {})
  };
}

function groupRotationBaselineObjects(objects: DrillEditorObject[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return objects.map((object) => {
    if (!selected.has(object.id)) return { ...object };
    if (object.type !== "arrow") return { ...object };
    return resolvedFreeLineObject(object, objects);
  });
}

function resolvedFreeLineObject(line: DrillEditorObject, objects: DrillEditorObject[]): DrillEditorObject {
  const resolved = resolveLineObject(line, objects);
  return {
    ...resolved,
    startAnchorType: undefined,
    startAnchorObjectId: undefined,
    startAnchorEndpoint: undefined,
    startAnchorOffsetX: undefined,
    startAnchorOffsetY: undefined,
    endAnchorType: undefined,
    endAnchorObjectId: undefined,
    endAnchorEndpoint: undefined,
    endAnchorOffsetX: undefined,
    endAnchorOffsetY: undefined
  };
}

function rotateObjectAroundPoint(
  object: DrillEditorObject,
  center: { x: number; y: number },
  degrees: number,
  objects: DrillEditorObject[]
): DrillEditorObject {
  if (object.type === "arrow") {
    return { ...object, ...rotateLineAroundPointPatch(object, objects, center, degrees) };
  }

  const rotated = rotatePointAround({ x: object.x, y: object.y }, center, degrees);
  return {
    ...object,
    x: rotated.x,
    y: rotated.y,
    rotation: positiveRotation(object.rotation + degrees)
  };
}

function scaleObjectAroundPoint(object: DrillEditorObject, center: { x: number; y: number }, factor: number): DrillEditorObject {
  if (object.type === "arrow") {
    const geometry = lineGeometry(object, [object]);
    const start = scalePointAround(geometry.start, center, factor);
    const end = scalePointAround(geometry.end, center, factor);
    const control = scalePointAround(geometry.control, center, factor);
    return {
      ...object,
      x: start.x,
      y: start.y,
      endX: end.x,
      endY: end.y,
      controlX: control.x,
      controlY: control.y,
      scale: clamp((object.scale ?? 1) * factor, minObjectScale, maxObjectScale),
      startAnchorType: undefined,
      startAnchorObjectId: undefined,
      startAnchorEndpoint: undefined,
      startAnchorOffsetX: undefined,
      startAnchorOffsetY: undefined,
      endAnchorType: undefined,
      endAnchorObjectId: undefined,
      endAnchorEndpoint: undefined,
      endAnchorOffsetX: undefined,
      endAnchorOffsetY: undefined
    };
  }

  const point = scalePointAround({ x: object.x, y: object.y }, center, factor);
  return {
    ...object,
    x: point.x,
    y: point.y,
    scale: clamp((object.scale ?? 1) * factor, minObjectScale, maxObjectScale)
  };
}

function scalePointAround(point: { x: number; y: number }, center: { x: number; y: number }, factor: number) {
  return {
    x: center.x + (point.x - center.x) * factor,
    y: center.y + (point.y - center.y) * factor
  };
}

function rotateLineToAnglePatch(line: DrillEditorObject, objects: DrillEditorObject[], targetAngle: number): Partial<DrillEditorObject> {
  const geometry = lineGeometry(line, objects);
  const currentAngle = (Math.atan2(geometry.end.y - geometry.start.y, geometry.end.x - geometry.start.x) * 180) / Math.PI;
  const delta = positiveRotation(targetAngle) - positiveRotation(currentAngle);
  return rotateLineAroundPointPatch(line, objects, lineCenter(geometry), delta);
}

function rotateLineAroundPointPatch(
  line: DrillEditorObject,
  objects: DrillEditorObject[],
  center: { x: number; y: number },
  degrees: number
): Partial<DrillEditorObject> {
  const geometry = lineGeometry(line, objects);
  const start = rotatePointAround(geometry.start, center, degrees);
  const end = rotatePointAround(geometry.end, center, degrees);
  const control = rotatePointAround(geometry.control, center, degrees);

  return {
    x: start.x,
    y: start.y,
    endX: end.x,
    endY: end.y,
    controlX: control.x,
    controlY: control.y,
    rotation: positiveRotation(line.rotation + degrees),
    startAnchorType: undefined,
    startAnchorObjectId: undefined,
    startAnchorEndpoint: undefined,
    startAnchorOffsetX: undefined,
    startAnchorOffsetY: undefined,
    endAnchorType: undefined,
    endAnchorObjectId: undefined,
    endAnchorEndpoint: undefined,
    endAnchorOffsetX: undefined,
    endAnchorOffsetY: undefined
  };
}

function lineGeometry(line: DrillEditorObject, objects: DrillEditorObject[]) {
  const resolved = resolveLineObject(line, objects);
  const start = { x: finiteNumber(resolved.x, 0), y: finiteNumber(resolved.y, 0) };
  const end = {
    x: finiteNumber(resolved.endX, start.x + 120),
    y: finiteNumber(resolved.endY, start.y)
  };
  const control = {
    x: finiteNumber(resolved.controlX, midpoint(start.x, end.x)),
    y: finiteNumber(resolved.controlY, midpoint(start.y, end.y))
  };
  return { start, end, control };
}

function lineCenter(geometry: ReturnType<typeof lineGeometry>) {
  return {
    x: midpoint(geometry.start.x, geometry.end.x),
    y: midpoint(geometry.start.y, geometry.end.y)
  };
}

function rotatePointAround(point: { x: number; y: number }, center: { x: number; y: number }, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians)
  };
}

function resolveLineObject(line: DrillEditorObject, objects: DrillEditorObject[]) {
  const freeStart = { x: finiteNumber(line.x, 0), y: finiteNumber(line.y, 0) };
  const freeEnd = { x: finiteNumber(line.endX, freeStart.x + 120), y: finiteNumber(line.endY, freeStart.y) };
  const startAnchor = anchorFromObject(line, "start", objects);
  const endAnchor = anchorFromObject(line, "end", objects);
  const startPoint = startAnchor ? resolveAnchorPoint(startAnchor, objects, new Set([line.id])) ?? freeStart : freeStart;
  const endPoint = endAnchor ? resolveAnchorPoint(endAnchor, objects, new Set([line.id])) ?? freeEnd : freeEnd;
  return {
    ...line,
    ...(startAnchor
      ? {
          x: startPoint.x,
          y: startPoint.y
        }
      : {}),
    ...(endAnchor
      ? {
          endX: endPoint.x,
          endY: endPoint.y
        }
      : {})
  };
}

function parseAnchorValue(value: string): LineAnchor | null {
  const [type, objectId, endpoint] = value.split(":");
  if (type === "marker" && objectId) return { type, objectId };
  if (type === "line" && objectId && (endpoint === "start" || endpoint === "end")) {
    return { type: "line-endpoint", objectId, endpoint };
  }
  return null;
}

function anchorFromObject(line: DrillEditorObject, endpoint: "start" | "end", objects: DrillEditorObject[]): LineAnchor | null {
  const type = endpoint === "start" ? line.startAnchorType : line.endAnchorType;
  const objectId = endpoint === "start" ? line.startAnchorObjectId : line.endAnchorObjectId;
  const anchorEndpoint = endpoint === "start" ? line.startAnchorEndpoint : line.endAnchorEndpoint;
  if (!objectId) return null;

  if (type === "marker") {
    const target = objects.find((object) => object.id === objectId);
    return target?.type === "marker" ? { type, objectId } : null;
  }

  if (type === "line-endpoint" && (anchorEndpoint === "start" || anchorEndpoint === "end")) {
    const target = objects.find((object) => object.id === objectId);
    return target?.type === "arrow" ? { type, objectId, endpoint: anchorEndpoint } : null;
  }

  // Legacy saved anchors did not record a type. Keep old marker anchors only; all other old object anchors become free endpoints.
  const legacyTarget = objects.find((object) => object.id === objectId);
  return legacyTarget?.type === "marker" ? { type: "marker", objectId } : null;
}

function resolveAnchorPoint(anchor: LineAnchor, objects: DrillEditorObject[], visiting = new Set<string>()): { x: number; y: number } | null {
  const target = objects.find((object) => object.id === anchor.objectId);
  if (!target) return null;
  if (anchor.type === "marker") return objectCenter(target);
  if (target.type !== "arrow" || visiting.has(target.id)) return null;

  visiting.add(target.id);
  const resolvedLine = resolveLineObjectWithVisited(target, objects, visiting);
  visiting.delete(target.id);
  return anchor.endpoint === "start"
    ? { x: resolvedLine.x, y: resolvedLine.y }
    : { x: resolvedLine.endX ?? resolvedLine.x + 120, y: resolvedLine.endY ?? resolvedLine.y };
}

function resolveLineObjectWithVisited(line: DrillEditorObject, objects: DrillEditorObject[], visiting: Set<string>) {
  const freeStart = { x: finiteNumber(line.x, 0), y: finiteNumber(line.y, 0) };
  const freeEnd = { x: finiteNumber(line.endX, freeStart.x + 120), y: finiteNumber(line.endY, freeStart.y) };
  const startAnchor = anchorFromObject(line, "start", objects);
  const endAnchor = anchorFromObject(line, "end", objects);
  const startPoint = startAnchor ? resolveAnchorPoint(startAnchor, objects, visiting) ?? freeStart : freeStart;
  const endPoint = endAnchor ? resolveAnchorPoint(endAnchor, objects, visiting) ?? freeEnd : freeEnd;
  return {
    ...line,
    ...(startAnchor ? { x: startPoint.x, y: startPoint.y } : {}),
    ...(endAnchor ? { endX: endPoint.x, endY: endPoint.y } : {})
  };
}

function wouldCreateAnchorCycle(lineId: string, _endpoint: "start" | "end", anchor: LineAnchor, objects: DrillEditorObject[]) {
  if (anchor.type !== "line-endpoint") return false;
  if (anchor.objectId === lineId) return true;
  return lineDependsOnLine(anchor.objectId, lineId, objects, new Set());
}

function lineDependsOnLine(sourceLineId: string, targetLineId: string, objects: DrillEditorObject[], visited: Set<string>): boolean {
  if (sourceLineId === targetLineId) return true;
  if (visited.has(sourceLineId)) return false;
  visited.add(sourceLineId);
  const sourceLine = objects.find((object) => object.id === sourceLineId);
  if (!sourceLine || sourceLine.type !== "arrow") return false;
  const anchors = [anchorFromObject(sourceLine, "start", objects), anchorFromObject(sourceLine, "end", objects)];
  return anchors.some((anchor) => anchor?.type === "line-endpoint" && lineDependsOnLine(anchor.objectId, targetLineId, objects, visited));
}

function detachAnchorsForDeletedTargets(objects: DrillEditorObject[], deletedIds: string[]) {
  return objects.map((object) => {
    if (object.type !== "arrow") return object;
    const resolved = resolveLineObject(object, objects);
    const startDeleted = object.startAnchorObjectId ? deletedIds.includes(object.startAnchorObjectId) : false;
    const endDeleted = object.endAnchorObjectId ? deletedIds.includes(object.endAnchorObjectId) : false;
    return {
      ...object,
      ...(startDeleted
        ? {
            x: resolved.x,
            y: resolved.y,
            startAnchorType: undefined,
            startAnchorObjectId: undefined,
            startAnchorEndpoint: undefined
          }
        : {}),
      ...(endDeleted
        ? {
            endX: resolved.endX ?? resolved.x + 120,
            endY: resolved.endY ?? resolved.y,
            endAnchorType: undefined,
            endAnchorObjectId: undefined,
            endAnchorEndpoint: undefined
          }
        : {})
    };
  });
}

function objectCenter(object: DrillEditorObject) {
  return {
    x: finiteNumber(object.x, 0),
    y: finiteNumber(object.y, 0)
  };
}

function normalizedSelectionRect(box: SelectionBox) {
  const x = Math.min(box.startX, box.endX);
  const y = Math.min(box.startY, box.endY);
  const width = Math.abs(box.endX - box.startX);
  const height = Math.abs(box.endY - box.startY);
  return { x, y, width, height };
}

function objectIntersectsRect(object: DrillEditorObject, rect: { x: number; y: number; width: number; height: number }) {
  const objectRect = objectSelectionBounds(object);
  return (
    objectRect.x <= rect.x + rect.width &&
    objectRect.x + objectRect.width >= rect.x &&
    objectRect.y <= rect.y + rect.height &&
    objectRect.y + objectRect.height >= rect.y
  );
}

function objectsSelectionBounds(objects: DrillEditorObject[], allObjects: DrillEditorObject[]) {
  const bounds = objects.map((object) => objectVisualBounds(object, allObjects));
  if (!bounds.length) return null;
  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    minY: Math.min(...bounds.map((bound) => bound.minY)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
    maxY: Math.max(...bounds.map((bound) => bound.maxY))
  };
}

function objectVisualBounds(object: DrillEditorObject, allObjects: DrillEditorObject[]): EditorBounds {
  if (object.type === "arrow") {
    const geometry = lineGeometry(object, allObjects);
    const xs = [geometry.start.x, geometry.end.x, geometry.control.x];
    const ys = [geometry.start.y, geometry.end.y, geometry.control.y];
    return {
      minX: Math.min(...xs) - 12,
      minY: Math.min(...ys) - 12,
      maxX: Math.max(...xs) + 12,
      maxY: Math.max(...ys) + 12
    };
  }

  const rect = objectSelectionBounds(object);
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height
  };
}

function boundsCenter(bounds: EditorBounds) {
  return {
    x: midpoint(bounds.minX, bounds.maxX),
    y: midpoint(bounds.minY, bounds.maxY)
  };
}

function groupRotationHandlePosition(bounds: EditorBounds) {
  const center = boundsCenter(bounds);
  const distance = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 24;
  const above = { x: center.x, y: center.y - distance };
  const below = { x: center.x, y: center.y + distance };
  if (isPointVisible(above)) return above;
  if (isPointVisible(below)) return below;
  return {
    x: clamp(above.x, 14, stageWidth - 14),
    y: clamp(above.y, 14, stageHeight - 14)
  };
}

function angleFromCenter(center: { x: number; y: number }, point: { x: number; y: number }) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
}

function objectSelectionBounds(object: DrillEditorObject) {
  if (object.type === "arrow") {
    const endX = object.endX ?? object.x + 120;
    const endY = object.endY ?? object.y;
    const controlX = object.controlX ?? midpoint(object.x, endX);
    const controlY = object.controlY ?? midpoint(object.y, endY);
    const xs = [object.x, endX, controlX];
    const ys = [object.y, endY, controlY];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { x: minX - 12, y: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24 };
  }

  const bounds = objectBounds(object);
  const scale = object.scale ?? 1;
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return { x: object.x - width / 2, y: object.y - height / 2, width, height };
}

function calculateAlignmentGuides(movedObject: DrillEditorObject, x: number, y: number, objects: DrillEditorObject[], alignmentThreshold = 1): AlignmentGuide[] {
  if (movedObject.type === "arrow") {
    const dx = finiteNumber(x, movedObject.x) - movedObject.x;
    const dy = finiteNumber(y, movedObject.y) - movedObject.y;
    return calculateLineAlignmentGuides({ ...movedObject, ...objectPositionPatch(movedObject, dx, dy) }, objects, alignmentThreshold);
  }

  if (!isSetupGuideObject(movedObject)) return [];
  const dragged = { ...movedObject, x: finiteNumber(x, movedObject.x), y: finiteNumber(y, movedObject.y) };
  const guides: AlignmentGuide[] = [];
  const spacingThreshold = 5;
  const draggedReference = setupReferencePoint(dragged);

  for (const object of objects) {
    if (object.id === movedObject.id || !isSetupGuideObject(object)) continue;
    const reference = setupReferencePoint(object);

    if (Math.abs(draggedReference.x - reference.x) <= alignmentThreshold) guides.push({ type: "vertical", x: reference.x, variant: "align" });
    if (Math.abs(draggedReference.y - reference.y) <= alignmentThreshold) guides.push({ type: "horizontal", y: reference.y, variant: "align" });
  }

  const distanceGuide = nearestDistanceGuide(dragged, objects);
  return [...dedupeAlignmentGuides(guides).slice(0, 4), ...equalSpacingGuides(dragged, objects, spacingThreshold), ...(distanceGuide ? [distanceGuide] : [])];
}

function calculateLineAlignmentGuides(line: DrillEditorObject, objects: DrillEditorObject[], alignmentThreshold = 1): AlignmentGuide[] {
  const geometry = lineGeometry(line, objects);
  const endpoints = [
    { id: `${line.id}:start`, x: geometry.start.x, y: geometry.start.y },
    { id: `${line.id}:end`, x: geometry.end.x, y: geometry.end.y }
  ];
  const references = alignmentReferencePoints(objects, line.id);
  const guides: AlignmentGuide[] = [];

  for (const endpoint of endpoints) {
    for (const reference of references) {
      if (Math.abs(endpoint.x - reference.x) <= alignmentThreshold) {
        guides.push({ type: "vertical", x: reference.x, variant: "align" });
      }
      if (Math.abs(endpoint.y - reference.y) <= alignmentThreshold) {
        guides.push({ type: "horizontal", y: reference.y, variant: "align" });
      }
    }
  }

  const distanceGuide = nearestPointDistanceGuide(endpoints, references);
  return [...dedupeAlignmentGuides(guides).slice(0, 4), ...(distanceGuide ? [distanceGuide] : [])];
}

function alignmentReferencePoints(objects: DrillEditorObject[], excludedLineId?: string) {
  return objects.flatMap((object) => {
    if (object.id === excludedLineId) return [];
    if (isSetupGuideObject(object)) {
      const reference = setupReferencePoint(object);
      return [{ id: object.id, x: reference.x, y: reference.y }];
    }
    if (object.type !== "arrow") return [];
    const geometry = lineGeometry(object, objects);
    return [
      { id: `${object.id}:start`, x: geometry.start.x, y: geometry.start.y },
      { id: `${object.id}:end`, x: geometry.end.x, y: geometry.end.y }
    ];
  });
}

function nearestPointDistanceGuide(
  points: Array<{ id: string; x: number; y: number }>,
  references: Array<{ id: string; x: number; y: number }>
): AlignmentGuide | null {
  const nearest = points
    .flatMap((point) =>
      references
        .filter((reference) => reference.id !== point.id)
        .map((reference) => ({
          point,
          reference,
          distance: Math.hypot(point.x - reference.x, point.y - reference.y)
        }))
    )
    .filter((candidate) => candidate.distance > 0.5)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearest) return null;

  return {
    type: "distance",
    points: [nearest.point.x, nearest.point.y, nearest.reference.x, nearest.reference.y],
    label: formatMeters(pixelDistanceToMeters(nearest.distance)),
    labelX: midpoint(nearest.point.x, nearest.reference.x),
    labelY: midpoint(nearest.point.y, nearest.reference.y) - 16
  };
}

function isSetupGuideObject(object: DrillEditorObject) {
  return object.type === "marker" || object.type === "cone" || object.type === "pole" || object.type === "mannequin" || object.type === "goal" || object.type === "mini_goal";
}

function snapSetupObject(movedObject: DrillEditorObject, x: number, y: number, objects: DrillEditorObject[]) {
  if (!isSetupGuideObject(movedObject)) return { x, y };
  const tolerance = 4;
  let snappedX = finiteNumber(x, movedObject.x);
  let snappedY = finiteNumber(y, movedObject.y);

  for (const object of objects) {
    if (object.id === movedObject.id || !isSetupGuideObject(object)) continue;
    const draggedReference = setupReferencePoint({ ...movedObject, x: snappedX, y: snappedY });
    const reference = setupReferencePoint(object);
    if (Math.abs(draggedReference.x - reference.x) <= tolerance) snappedX += reference.x - draggedReference.x;
    if (Math.abs(draggedReference.y - reference.y) <= tolerance) snappedY += reference.y - draggedReference.y;
  }

  return { x: snappedX, y: snappedY };
}

function setupReferencePoint(object: DrillEditorObject) {
  const bounds = practicalSetupBounds(object);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height
  };
}

function setupContactBounds(object: DrillEditorObject) {
  const bounds = practicalSetupBounds(object);
  return {
    x: bounds.x,
    y: bounds.y + bounds.height,
    width: bounds.width,
    height: 0
  };
}

function practicalSetupBounds(object: DrillEditorObject) {
  if (object.type === "goal") {
    const scale = (object.scale ?? 1) * objectBaseSizeFactor;
    const width = goalBaseWidth(object) * scale;
    const groundOffset = isYouthGoal(object) ? 0 : metersToCanvasPixels(normalGoalGroundOffsetM);
    const visibleHeight = goalBaseWidth(object) * 0.58 * scale;
    const height = Math.max(4, visibleHeight - groundOffset);
    return {
      x: object.x - width / 2,
      y: object.y - visibleHeight / 2,
      width,
      height
    };
  }

  if (object.type === "mini_goal") {
    const scale = (object.scale ?? 1) * objectBaseSizeFactor;
    const width = 34 * scale;
    const height = 22 * scale;
    return {
      x: object.x - width / 2,
      y: object.y - height / 2,
      width,
      height
    };
  }

  return objectSelectionBounds(object);
}

function dedupeAlignmentGuides(guides: AlignmentGuide[]) {
  const seen = new Set<string>();
  return guides.filter((guide) => {
    const key = guide.type === "vertical" ? `v:${Math.round(guide.x)}` : guide.type === "horizontal" ? `h:${Math.round(guide.y)}` : `${guide.type}:${guide.labelX}:${guide.labelY}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function equalSpacingGuides(movedObject: DrillEditorObject, objects: DrillEditorObject[], threshold: number): AlignmentGuide[] {
  if (!isSetupGuideObject(movedObject)) return [];
  const setupObjects = objects.filter((object) => object.type === movedObject.type && object.id !== movedObject.id);
  const horizontal = nearestSetupObjectsAround(movedObject, setupObjects, "horizontal", threshold);
  const vertical = nearestSetupObjectsAround(movedObject, setupObjects, "vertical", threshold);
  return [horizontal, vertical].filter((guide): guide is AlignmentGuide => Boolean(guide));
}

function nearestSetupObjectsAround(movedObject: DrillEditorObject, setupObjects: DrillEditorObject[], orientation: "horizontal" | "vertical", threshold: number): AlignmentGuide | null {
  const movedReference = setupReferencePoint(movedObject);
  const movedBounds = setupContactBounds(movedObject);
  const sameAxis = setupObjects.filter((object) => {
    const reference = setupReferencePoint(object);
    return Math.abs((orientation === "horizontal" ? reference.y - movedReference.y : reference.x - movedReference.x)) <= threshold * 2;
  });
  const before = sameAxis
    .filter((object) => {
      const reference = setupReferencePoint(object);
      return orientation === "horizontal" ? reference.x < movedReference.x : reference.y < movedReference.y;
    })
    .sort((a, b) => {
      const aReference = setupReferencePoint(a);
      const bReference = setupReferencePoint(b);
      return orientation === "horizontal" ? bReference.x - aReference.x : bReference.y - aReference.y;
    })[0];
  const after = sameAxis
    .filter((object) => {
      const reference = setupReferencePoint(object);
      return orientation === "horizontal" ? reference.x > movedReference.x : reference.y > movedReference.y;
    })
    .sort((a, b) => {
      const aReference = setupReferencePoint(a);
      const bReference = setupReferencePoint(b);
      return orientation === "horizontal" ? aReference.x - bReference.x : aReference.y - bReference.y;
    })[0];

  if (!before || !after) return null;
  const beforeBounds = setupContactBounds(before);
  const afterBounds = setupContactBounds(after);
  const beforeDistance = orientation === "horizontal" ? movedBounds.x - (beforeBounds.x + beforeBounds.width) : movedBounds.y - (beforeBounds.y + beforeBounds.height);
  const afterDistance = orientation === "horizontal" ? afterBounds.x - (movedBounds.x + movedBounds.width) : afterBounds.y - (movedBounds.y + movedBounds.height);
  if (beforeDistance < 0 || afterDistance < 0 || Math.abs(beforeDistance - afterDistance) > threshold) return null;

  const distanceMeters = formatMeters(pixelDistanceToMeters(Math.min(beforeDistance, afterDistance)));
  if (orientation === "horizontal") {
    return {
      type: "spacing",
      orientation,
      points: [beforeBounds.x + beforeBounds.width, movedReference.y, afterBounds.x, movedReference.y],
      label: `Equal spacing: ${distanceMeters}`,
      labelX: movedReference.x,
      labelY: movedReference.y - 24
    };
  }

  return {
    type: "spacing",
    orientation,
    points: [movedReference.x, beforeBounds.y + beforeBounds.height, movedReference.x, afterBounds.y],
    label: `Equal spacing: ${distanceMeters}`,
    labelX: movedReference.x + 30,
    labelY: movedReference.y
  };
}

function nearestDistanceGuide(movedObject: DrillEditorObject, objects: DrillEditorObject[]): AlignmentGuide | null {
  const movedBounds = setupContactBounds(movedObject);
  const candidates = objects.filter((object) => object.id !== movedObject.id && isSetupGuideObject(object));
  const nearest = candidates
    .map((object) => ({ object, gap: boundingBoxGap(movedBounds, setupContactBounds(object)) }))
    .sort((a, b) => a.gap.distance - b.gap.distance)[0];
  if (!nearest) return null;
  if (nearest.gap.distance <= 0) return null;

  return {
    type: "distance",
    points: [nearest.gap.fromX, nearest.gap.fromY, nearest.gap.toX, nearest.gap.toY],
    label: formatMeters(pixelDistanceToMeters(nearest.gap.distance)),
    labelX: midpoint(nearest.gap.fromX, nearest.gap.toX),
    labelY: midpoint(nearest.gap.fromY, nearest.gap.toY) - 16
  };
}

function boundingBoxGap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;
  const horizontalGap = aRight < b.x ? b.x - aRight : bRight < a.x ? a.x - bRight : 0;
  const verticalGap = aBottom < b.y ? b.y - aBottom : bBottom < a.y ? a.y - bBottom : 0;
  const fromX = aRight < b.x ? aRight : bRight < a.x ? a.x : midpoint(Math.max(a.x, b.x), Math.min(aRight, bRight));
  const toX = aRight < b.x ? b.x : bRight < a.x ? bRight : fromX;
  const fromY = aBottom < b.y ? aBottom : bBottom < a.y ? a.y : midpoint(Math.max(a.y, b.y), Math.min(aBottom, bBottom));
  const toY = aBottom < b.y ? b.y : bBottom < a.y ? bBottom : fromY;

  return {
    distance: Math.hypot(horizontalGap, verticalGap),
    fromX,
    fromY,
    toX,
    toY
  };
}

function pixelDistanceToMeters(distance: number) {
  const geometry = pitchGeometry("Full football pitch");
  if (!geometry) return 0;
  return Math.abs(distance) / geometry.scale;
}

function metersToCanvasPixels(distance: number) {
  const geometry = pitchGeometry("Full football pitch");
  if (!geometry) return 0;
  return Math.abs(distance) * geometry.scale;
}

function formatMeters(value: number) {
  return `${value.toFixed(1)} m`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeThicknessLevel(value: number | undefined) {
  return clamp(Math.round(finiteNumber(value, defaultLineThicknessLevel)), 1, 10);
}

function lineStrokeWidth(level: number) {
  return 0.25 + normalizeThicknessLevel(level) * 0.2;
}

function arrowheadSize(level: number) {
  return 2.2 + normalizeThicknessLevel(level) * 0.42;
}

function lineShowsArrow(line: DrillEditorObject) {
  return line.arrowHead ?? true;
}

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function midpoint(a: number, b: number) {
  return (a + b) / 2;
}

function positiveRotation(rotation: number) {
  if (!Number.isFinite(rotation)) return 0;
  return ((rotation % 360) + 360) % 360;
}

function nearestCardinalAngle(rotation: number, tolerance = 2) {
  const normalized = positiveRotation(rotation);
  const targets = [0, 90, 180, 270];
  return targets.find((angle) => Math.min(Math.abs(normalized - angle), 360 - Math.abs(normalized - angle)) <= tolerance) ?? null;
}

function rotationHandlePosition(object: DrillEditorObject) {
  const bounds = objectBounds(object);
  const distance = Math.max(bounds.width, bounds.height) * (object.scale ?? 1) * 0.5 + 18;
  const radians = (positiveRotation(object.rotation) * Math.PI) / 180;
  const localUp = { x: Math.sin(radians), y: -Math.cos(radians) };
  const above = { x: object.x + localUp.x * distance, y: object.y + localUp.y * distance };
  const below = { x: object.x - localUp.x * distance, y: object.y - localUp.y * distance };
  if (isPointVisible(above)) return above;
  if (isPointVisible(below)) return below;
  return {
    x: clamp(above.x, 14, stageWidth - 14),
    y: clamp(above.y, 14, stageHeight - 14)
  };
}

function isPointVisible(point: { x: number; y: number }) {
  return point.x >= 14 && point.x <= stageWidth - 14 && point.y >= 14 && point.y <= stageHeight - 14;
}

function objectBounds(object: DrillEditorObject) {
  const bounds = rawObjectBounds(object);
  return { width: bounds.width * objectBaseSizeFactor, height: bounds.height * objectBaseSizeFactor };
}

function rawObjectBounds(object: DrillEditorObject) {
  if (object.type === "goal") return { width: goalBaseWidth(object) + 46, height: goalBaseWidth(object) * 0.55 + 38 };
  if (object.type === "mini_goal") return { width: 52, height: 34 };
  if (object.type === "text") {
    const text = object.label || "Label";
    return { width: Math.max(84, text.length * 12 + 40), height: 54 };
  }
  if (object.type === "cone") return { width: 20, height: 22 };
  if (object.type === "marker") return { width: 18, height: 12 };
  if (object.type === "ring") return { width: 26, height: 16 };
  if (object.type === "ball") return { width: 28, height: 28 };
  if (object.type === "bib") return { width: 22, height: object.variant === "tall" ? 34 : 28 };
  if (object.type === "pole") return { width: 24, height: 48 };
  if (object.type === "mannequin") return { width: 22, height: 57 };
  if (object.type === "coach") return { width: 58, height: 72 };
  if (object.variant && object.variant !== "circle") return { width: 48, height: 66 };
  return { width: 34, height: 46 };
}

function goalBaseWidth(object: DrillEditorObject) {
  if (object.variant === "youth-front" || object.variant === "youth-angled") return 92;
  if (object.variant === "angled") return 109;
  if (object.variant === "right") return 343;
  return 156;
}

function isYouthGoal(object: DrillEditorObject) {
  return object.variant === "youth-front" || object.variant === "youth-angled";
}
