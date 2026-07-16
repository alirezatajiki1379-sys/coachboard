"use client";

import { useEffect, useRef, useState } from "react";
import { Arrow, Circle as KonvaCircle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import { SvgIcon } from "@/components/drills/svg-icon";
import { parseEditorJsonString } from "@/lib/drills/editor";
import type { SvgIconKey } from "@/lib/editor/svg-icons";
import type { DrillEditorObject, DrillEditorState } from "@/types/editor";

const sourceWidth = 820;
const sourceHeight = 520;
const width = 640;
const height = 400;
const scaleX = width / sourceWidth;
const scaleY = height / sourceHeight;
const objectScale = (scaleX + scaleY) / 2;
const pitchOverviewPadding = 14;
const defaultLineThicknessLevel = 5;
const slalomWaveAmplitude = 5;
const objectBaseSizeFactor = 0.7;

export function DrillGraphicPreview({
  graphicJson,
  autoFitContent = false,
  autoFit = false,
  className = "",
  previewMode = "detail"
}: {
  graphicJson: string;
  autoFitContent?: boolean;
  autoFit?: boolean;
  className?: string;
  previewMode?: "thumbnail" | "detail" | "print";
}) {
  const state = parseEditorJsonString(graphicJson);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(width);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const updateWidth = () => setContainerWidth(Math.max(1, node.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!state.objects.length) {
    return null;
  }

  const baseTransform = previewViewTransform(state.pitch);
  const baseClipProps = previewViewClipProps(state.pitch);
  const previewViewport = autoFitContent || autoFit ? getPreviewViewport(state, previewMode) : null;
  const autoFitTransform = previewViewport ? previewViewportTransform(previewViewport, baseTransform) : { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const responsiveScale = containerWidth / width;

  return (
    <div ref={containerRef} className={`aspect-[16/10] w-full overflow-hidden rounded-lg border border-board-line bg-slate-100 ${className}`}>
      <div style={{ width, height, transform: `scale(${responsiveScale})`, transformOrigin: "top left" }}>
        <Stage width={width} height={height}>
          <Layer>
            <Group {...autoFitTransform}>
              <Group {...baseTransform} {...baseClipProps}>
                <PreviewPitch
                  pitch={state.pitch === "Half pitch" ? "Full football pitch" : state.pitch}
                  pitchStyle={state.pitchStyle}
                  previewMode={previewMode}
                />
                {state.objects.map((object) => (
                  <PreviewObject key={object.id} object={object} objects={state.objects} />
                ))}
              </Group>
            </Group>
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

type PreviewTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

type PreviewBox = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function getPreviewViewport(state: DrillEditorState, previewMode: "thumbnail" | "detail" | "print"): PreviewBox | null {
  const contentBox = getGraphicContentBounds(state.objects);
  if (!contentBox) return null;

  const contentWidth = contentBox.maxX - contentBox.minX;
  const contentHeight = contentBox.maxY - contentBox.minY;
  if (contentWidth <= 0 || contentHeight <= 0) return null;
  if (contentWidth > sourceWidth * 0.9 || contentHeight > sourceHeight * 0.9) return null;

  const isThumbnail = previewMode === "thumbnail";
  const paddingRatio = isThumbnail ? 0.06 : 0.1;
  const paddingX = clamp(contentWidth * paddingRatio, isThumbnail ? 8 : 16, isThumbnail ? 34 : 64);
  const paddingY = clamp(contentHeight * paddingRatio, isThumbnail ? 7 : 14, isThumbnail ? 28 : 52);
  const minViewportWidth = state.objects.length === 1
    ? sourceWidth * ((isThumbnail ? 20 : 18) / pitchLengthM)
    : sourceWidth * ((isThumbnail ? 8 : 10) / pitchLengthM);
  const minViewportHeight = state.objects.length === 1
    ? sourceHeight * ((isThumbnail ? 12.5 : 11) / pitchWidthM)
    : sourceHeight * ((isThumbnail ? 5.5 : 7) / pitchWidthM);
  const centerX = (contentBox.minX + contentBox.maxX) / 2;
  const centerY = (contentBox.minY + contentBox.maxY) / 2;
  const paddedWidth = Math.max(contentWidth + paddingX * 2, minViewportWidth);
  const paddedHeight = Math.max(contentHeight + paddingY * 2, minViewportHeight);
  const viewportSize = fitViewportToAspect(paddedWidth, paddedHeight);
  const viewportWidth = Math.min(sourceWidth, viewportSize.width);
  const viewportHeight = Math.min(sourceHeight, viewportSize.height);
  const left = clamp(centerX - viewportWidth / 2, 0, Math.max(0, sourceWidth - viewportWidth));
  const top = clamp(centerY - viewportHeight / 2, 0, Math.max(0, sourceHeight - viewportHeight));

  return {
    minX: left,
    minY: top,
    maxX: left + viewportWidth,
    maxY: top + viewportHeight
  };
}

function fitViewportToAspect(widthValue: number, heightValue: number) {
  const targetAspect = width / height;
  const currentAspect = widthValue / heightValue;
  if (currentAspect > targetAspect) {
    return { width: widthValue, height: widthValue / targetAspect };
  }
  return { width: heightValue * targetAspect, height: heightValue };
}

function previewViewportTransform(viewport: PreviewBox, baseTransform: PreviewTransform): PreviewTransform {
  const minX = viewport.minX * scaleX * baseTransform.scaleX + baseTransform.x;
  const minY = viewport.minY * scaleY * baseTransform.scaleY + baseTransform.y;
  const maxX = viewport.maxX * scaleX * baseTransform.scaleX + baseTransform.x;
  const maxY = viewport.maxY * scaleY * baseTransform.scaleY + baseTransform.y;
  const viewportWidth = maxX - minX;
  const viewportHeight = maxY - minY;
  if (viewportWidth <= 0 || viewportHeight <= 0) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };

  const scale = Math.min(8, width / viewportWidth, height / viewportHeight);
  if (scale <= 1.04) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    x: width / 2 - centerX * scale,
    y: height / 2 - centerY * scale,
    scaleX: scale,
    scaleY: scale
  };
}

function getGraphicContentBounds(objects: DrillEditorObject[]): PreviewBox | null {
  let box: PreviewBox | null = null;
  for (const object of objects) {
    const objectBox = object.type === "arrow" ? previewLineContentBox(object, objects) : previewObjectContentBox(object);
    if (!objectBox) continue;
    box = mergePreviewBox(box, objectBox);
  }
  return box;
}

function mergePreviewBox(current: PreviewBox | null, next: PreviewBox): PreviewBox {
  if (!current) return next;
  return {
    minX: Math.min(current.minX, next.minX),
    minY: Math.min(current.minY, next.minY),
    maxX: Math.max(current.maxX, next.maxX),
    maxY: Math.max(current.maxY, next.maxY)
  };
}

function previewObjectContentBox(object: DrillEditorObject): PreviewBox | null {
  const x = finiteNumber(object.x, Number.NaN);
  const y = finiteNumber(object.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const radius = previewObjectRadiusInSource(object);
  return {
    minX: x - radius,
    minY: y - radius,
    maxX: x + radius,
    maxY: y + radius
  };
}

function previewLineContentBox(object: DrillEditorObject, objects: DrillEditorObject[]): PreviewBox | null {
  const line = resolvePreviewLineObject(object, objects);
  const points =
    line.curveEdited || line.lineStyle === "slalom"
      ? curvedLineSourcePoints(line)
      : [
          finiteNumber(line.x, Number.NaN),
          finiteNumber(line.y, Number.NaN),
          finiteNumber(line.endX, Number.NaN),
          finiteNumber(line.endY, Number.NaN)
        ];
  if (line.controlX !== undefined && line.controlY !== undefined) {
    points.push(finiteNumber(line.controlX, Number.NaN), finiteNumber(line.controlY, Number.NaN));
  }

  const finitePoints = points.filter(Number.isFinite);
  if (finitePoints.length < 4) return null;
  const xs = finitePoints.filter((_, index) => index % 2 === 0);
  const ys = finitePoints.filter((_, index) => index % 2 === 1);
  const pad = 22;
  return {
    minX: Math.min(...xs) - pad,
    minY: Math.min(...ys) - pad,
    maxX: Math.max(...xs) + pad,
    maxY: Math.max(...ys) + pad
  };
}

function curvedLineSourcePoints(object: DrillEditorObject) {
  const startX = finiteNumber(object.x, 0);
  const startY = finiteNumber(object.y, 0);
  const endX = finiteNumber(object.endX, object.x + 120);
  const endY = finiteNumber(object.endY, object.y);
  const controlX = finiteNumber(object.controlX, midpoint(object.x, object.endX ?? object.x + 120));
  const controlY = finiteNumber(object.controlY, midpoint(object.y, object.endY ?? object.y));
  const points: number[] = [];
  const steps = 24;

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

function previewObjectRadiusInSource(object: DrillEditorObject) {
  const scale = finiteNumber(object.scale, 1) * objectBaseSizeFactor;
  const base =
    object.type === "goal"
      ? 170
      : object.type === "mini_goal"
      ? 70
      : object.type === "text"
      ? 110
      : object.type === "player" || object.type === "goalkeeper" || object.type === "coach" || object.type === "mannequin"
      ? 76
      : object.type === "pole"
      ? 58
      : object.type === "ball" || object.type === "marker"
      ? 36
      : 52;
  return Math.max(14, base * scale);
}

function PreviewPitch({
  pitch,
  pitchStyle,
  previewMode
}: {
  pitch: DrillEditorState["pitch"];
  pitchStyle: DrillEditorState["pitchStyle"];
  previewMode: "thumbnail" | "detail" | "print";
}) {
  const line = previewMode === "thumbnail" ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.9)";
  const surface = pitch === "Empty field / blank" ? "#2f7a50" : "#28764A";
  const geometry = previewPitchGeometry(pitch);
  return (
    <Group listening={false}>
      <Rect x={0} y={0} width={width} height={height} fill={surface} />
      {pitch === "Empty grid" ? (
        Array.from({ length: 24 }).map((_, index) => (
          <Line
            key={index}
            points={index % 2 === 0 ? [index * 28, 0, index * 28, height] : [0, index * 18, width, index * 18]}
            stroke="rgba(255,255,255,0.16)"
            strokeWidth={1}
          />
        ))
      ) : pitch === "Empty field / blank" || !geometry ? null : (
        <>
          {pitchStyle === "Striped green" ? <PreviewPitchStripes geometry={geometry} /> : null}
          <PreviewPitchLines pitch={pitch} geometry={geometry} line={line} />
        </>
      )}
    </Group>
  );
}

type PreviewPitchGeometry = {
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

function previewViewTransform(pitch: DrillEditorState["pitch"]) {
  if (pitch === "Half pitch") {
    const fullGeometry = previewPitchGeometry("Full football pitch");
    if (!fullGeometry) return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const clip = previewHalfPitchClip(fullGeometry);
    const cameraScale = Math.min(width / clip.width, height / clip.height);
    return {
      x: (width - clip.width * cameraScale) / 2 - clip.x * cameraScale,
      y: (height - clip.height * cameraScale) / 2 - clip.y * cameraScale,
      scaleX: cameraScale,
      scaleY: cameraScale
    };
  }

  return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
}

function previewHalfPitchClip(geometry: PreviewPitchGeometry) {
  return {
    x: geometry.offsetX - pitchOverviewPadding,
    y: geometry.offsetY - pitchOverviewPadding,
    width: (pitchLengthM / 2) * geometry.scale + pitchOverviewPadding * 2,
    height: pitchWidthM * geometry.scale + pitchOverviewPadding * 2
  };
}

function previewViewClipProps(pitch: DrillEditorState["pitch"]) {
  if (pitch !== "Half pitch") return {};
  const geometry = previewPitchGeometry("Full football pitch");
  if (!geometry) return {};
  const clip = previewHalfPitchClip(geometry);
  return {
    clipX: clip.x,
    clipY: clip.y,
    clipWidth: clip.width,
    clipHeight: clip.height
  };
}

function previewPitchGeometry(pitch: DrillEditorState["pitch"]): PreviewPitchGeometry | null {
  if (pitch === "Empty grid" || pitch === "Empty field / blank") return null;
  const view =
    pitch === "Full football pitch"
      ? { minX: 0, maxX: pitchLengthM, minY: 0, maxY: pitchWidthM }
      : { minX: 0, maxX: pitchLengthM / 2, minY: 0, maxY: pitchWidthM };
  const margin = 16;
  const scale = Math.min((width - margin * 2) / (view.maxX - view.minX), (height - margin * 2) / (view.maxY - view.minY));
  const drawWidth = (view.maxX - view.minX) * scale;
  const drawHeight = (view.maxY - view.minY) * scale;

  return {
    ...view,
    offsetX: (width - drawWidth) / 2,
    offsetY: (height - drawHeight) / 2,
    scale
  };
}

function previewProjectPoint(geometry: PreviewPitchGeometry, x: number, y: number) {
  return {
    x: geometry.offsetX + (x - geometry.minX) * geometry.scale,
    y: geometry.offsetY + (y - geometry.minY) * geometry.scale
  };
}

function PreviewPitchStripes({ geometry }: { geometry: PreviewPitchGeometry }) {
  const stripeMeters = 5.5;
  const firstStripe = Math.floor(geometry.minX / stripeMeters) * stripeMeters;
  return (
    <>
      {Array.from({ length: Math.ceil((geometry.maxX - firstStripe) / stripeMeters) }).map((_, index) => {
        const stripeStart = firstStripe + index * stripeMeters;
        const stripeEnd = stripeStart + stripeMeters;
        const visibleStart = Math.max(stripeStart, geometry.minX);
        const visibleEnd = Math.min(stripeEnd, geometry.maxX);
        const topLeft = previewProjectPoint(geometry, visibleStart, geometry.minY);
        const bottomRight = previewProjectPoint(geometry, visibleEnd, geometry.maxY);
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

function PreviewPitchLines({ pitch, geometry, line }: { pitch: DrillEditorState["pitch"]; geometry: PreviewPitchGeometry; line: string }) {
  const showRight = pitch === "Full football pitch";
  const showCenter = pitch === "Full football pitch" || pitch === "Half pitch";
  const fieldTopLeft = previewProjectPoint(geometry, 0, 0);
  const fieldBottomRight = previewProjectPoint(geometry, pitchLengthM, pitchWidthM);
  const visibleFieldLeft = Math.max(fieldTopLeft.x, geometry.offsetX);
  const visibleFieldRight = Math.min(fieldBottomRight.x, geometry.offsetX + (geometry.maxX - geometry.minX) * geometry.scale);
  const visibleFieldTop = Math.max(fieldTopLeft.y, geometry.offsetY);
  const visibleFieldBottom = Math.min(fieldBottomRight.y, geometry.offsetY + (geometry.maxY - geometry.minY) * geometry.scale);

  return (
    <>
      <Rect x={visibleFieldLeft} y={visibleFieldTop} width={visibleFieldRight - visibleFieldLeft} height={visibleFieldBottom - visibleFieldTop} stroke={line} strokeWidth={2} />
      {showCenter ? <PreviewMeterLine geometry={geometry} points={[pitchLengthM / 2, 0, pitchLengthM / 2, pitchWidthM]} stroke={line} strokeWidth={1.5} /> : null}
      {showCenter ? (
        <>
          <PreviewMeterCircle geometry={geometry} x={pitchLengthM / 2} y={pitchWidthM / 2} radius={centerCircleRadiusM} stroke={line} strokeWidth={1.5} />
          <PreviewMeterCircle geometry={geometry} x={pitchLengthM / 2} y={pitchWidthM / 2} radius={0.45} fill={line} />
        </>
      ) : null}
      <PreviewPenaltyMarkings geometry={geometry} side="left" line={line} />
      {showRight ? <PreviewPenaltyMarkings geometry={geometry} side="right" line={line} /> : null}
    </>
  );
}

function PreviewMeterLine({ geometry, points, stroke, strokeWidth }: { geometry: PreviewPitchGeometry; points: [number, number, number, number]; stroke: string; strokeWidth: number }) {
  const start = previewProjectPoint(geometry, points[0], points[1]);
  const end = previewProjectPoint(geometry, points[2], points[3]);
  return <Line points={[start.x, start.y, end.x, end.y]} stroke={stroke} strokeWidth={strokeWidth} />;
}

function PreviewMeterCircle({
  geometry,
  x,
  y,
  radius,
  stroke,
  strokeWidth,
  fill
}: {
  geometry: PreviewPitchGeometry;
  x: number;
  y: number;
  radius: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const center = previewProjectPoint(geometry, x, y);
  return <KonvaCircle x={center.x} y={center.y} radius={radius * geometry.scale} stroke={stroke} strokeWidth={strokeWidth} fill={fill} />;
}

function PreviewMeterRect({ geometry, x, y, width, height, stroke }: { geometry: PreviewPitchGeometry; x: number; y: number; width: number; height: number; stroke: string }) {
  const topLeft = previewProjectPoint(geometry, x, y);
  return <Rect x={topLeft.x} y={topLeft.y} width={width * geometry.scale} height={height * geometry.scale} stroke={stroke} strokeWidth={1.5} />;
}

function PreviewPenaltyMarkings({ geometry, side, line }: { geometry: PreviewPitchGeometry; side: "left" | "right"; line: string }) {
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
      <PreviewMeterRect geometry={geometry} x={penaltyX} y={penaltyY} width={penaltyDepthM} height={penaltyWidthM} stroke={line} />
      <PreviewMeterRect geometry={geometry} x={goalAreaX} y={goalAreaY} width={goalAreaDepthM} height={goalAreaWidthM} stroke={line} />
      <PreviewMeterCircle geometry={geometry} x={spotX} y={pitchWidthM / 2} radius={0.45} fill={line} />
      <PreviewPenaltyArc geometry={geometry} spotX={spotX} spotY={pitchWidthM / 2} side={side} line={line} />
    </>
  );
}

function PreviewPenaltyArc({ geometry, spotX, spotY, side, line }: { geometry: PreviewPitchGeometry; spotX: number; spotY: number; side: "left" | "right"; line: string }) {
  const points: number[] = [];
  const startDeg = side === "left" ? -52 : 128;
  const endDeg = side === "left" ? 52 : 232;
  for (let degree = startDeg; degree <= endDeg; degree += 3) {
    const radians = (degree * Math.PI) / 180;
    const point = previewProjectPoint(geometry, spotX + Math.cos(radians) * centerCircleRadiusM, spotY + Math.sin(radians) * centerCircleRadiusM);
    points.push(point.x, point.y);
  }
  return <Line points={points} stroke={line} strokeWidth={1.5} lineCap="round" lineJoin="round" />;
}

function BackgroundGoal({ geometry, goalLine, centerY, side }: { geometry: PreviewPitchGeometry; goalLine: number; centerY: number; side: "left" | "right" }) {
  const direction = side === "left" ? -1 : 1;
  const x = previewProjectPoint(geometry, goalLine, centerY).x;
  const top = previewProjectPoint(geometry, goalLine, centerY - goalWidthM / 2).y;
  const bottom = previewProjectPoint(geometry, goalLine, centerY + goalWidthM / 2).y;
  const depth = 2.2 * geometry.scale;
  return (
    <>
      <Rect x={side === "left" ? x - depth : x} y={top} width={depth} height={bottom - top} stroke="rgba(255,255,255,0.88)" strokeWidth={1.6} />
      <Line points={[x, top, x + direction * depth, top + depth * 0.45, x + direction * depth, bottom - depth * 0.45, x, bottom]} stroke="rgba(255,255,255,0.58)" strokeWidth={1.2} />
      <Line points={[x + direction * depth * 0.5, top + 2, x + direction * depth * 0.5, bottom - 2]} stroke="rgba(255,255,255,0.34)" strokeWidth={1} />
    </>
  );
}

function PreviewObject({ object, objects }: { object: DrillEditorObject; objects: DrillEditorObject[] }) {
  if (object.type === "arrow") {
    return <PreviewLine object={object} objects={objects} />;
  }

  const scale = (object.scale ?? 1) * objectScale * objectBaseSizeFactor;
  const x = object.x * scaleX;
  const y = object.y * scaleY;

  return (
    <Group x={x} y={y} rotation={object.rotation} scaleX={scale} scaleY={scale}>
      {object.type === "goal" ? <NormalGoal object={object} /> : null}
      {object.type === "mini_goal" ? <MiniGoal object={object} /> : null}
      {object.type === "text" ? <LabelObject object={object} /> : null}
      {object.type === "cone" ? <ConeObject object={object} /> : null}
      {object.type === "marker" ? <MarkerObject object={object} /> : null}
      {object.type === "ring" ? <RingObject object={object} /> : null}
      {object.type === "ball" ? <BallObject object={object} /> : null}
      {object.type === "bib" ? <BibObject object={object} /> : null}
      {object.type === "pole" ? <PoleObject object={object} /> : null}
      {object.type === "mannequin" ? <MannequinObject object={object} /> : null}
      {object.type === "player" || object.type === "goalkeeper" || object.type === "coach" ? <PlayerObject object={object} /> : null}
    </Group>
  );
}

function PlayerObject({ object }: { object: DrillEditorObject }) {
  const label = object.name ?? "";
  const variant = object.type === "coach" ? object.variant ?? "pointing" : object.variant ?? "circle";

  if (variant !== "circle") {
    return <BodyPlayerObject object={object} variant={variant} />;
  }

  return (
    <>
      <Group scaleX={object.mirrored ? -1 : 1}>
        <KonvaCircle radius={12} fill={object.color} stroke="#ffffff" strokeWidth={2} shadowColor="rgba(15,23,42,0.25)" shadowBlur={4} shadowOffsetY={1} />
        {object.type === "goalkeeper" ? <Rect x={-8} y={-4} width={16} height={8} fill="rgba(255,255,255,0.22)" cornerRadius={2} /> : null}
      </Group>
      {object.number ? <Text text={object.number} fill="#ffffff" fontStyle="bold" align="center" width={24} offsetX={12} offsetY={6} fontSize={10.5} /> : null}
      {label ? (
        <>
          <Rect x={-28} y={13} width={56} height={14} fill="rgba(255,255,255,0.9)" cornerRadius={4} />
          <Text text={label} x={-26} y={15} width={52} align="center" fill="#111827" fontSize={8.5} fontStyle="bold" />
        </>
      ) : null}
    </>
  );
}

function BodyPlayerObject({ object, variant }: { object: DrillEditorObject; variant: string }) {
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
      {object.number ? <Text text={object.number} x={-17} y={-13} width={34} align="center" fill="#ffffff" fontSize={13} fontStyle="bold" /> : null}
      {object.name ? <Text text={object.name} x={-34} y={25} width={68} align="center" fill="#111827" fontSize={11} fontStyle="bold" /> : null}
    </>
  );
}

function playerIconFor(type: DrillEditorObject["type"], variant: string): SvgIconKey {
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
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      {object.variant === "stripe" ? (
        <SvgIcon icon="coneStripe" color={object.color} colorize targetHeight={13} />
      ) : (
        <SvgAssetIcon filename="Cone Simple.svg" width={18} height={18} color={object.color} />
      )}
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

  return image ? (
    <KonvaImage image={image} x={-displayWidth / 2} y={-displayHeight / 2} width={displayWidth} height={displayHeight} />
  ) : null;
}

function BibObject({ object }: { object: DrillEditorObject }) {
  const bibHeight = object.variant === "tall" ? 70 : 58;
  return (
    <Group scaleX={0.29} scaleY={0.29}>
      <Group scaleX={object.mirrored ? -1 : 1}>
        <Line
          points={[-24, -bibHeight / 2 + 5, -10, -bibHeight / 2, -4, -20, 4, -20, 10, -bibHeight / 2, 24, -bibHeight / 2 + 5, 18, bibHeight / 2, -18, bibHeight / 2]}
          closed
          fill={object.color}
          stroke="#111827"
          strokeWidth={2}
          lineJoin="round"
        />
        <Line points={[-7, -bibHeight / 2 + 4, 7, -bibHeight / 2 + 4]} stroke="#e5e7eb" strokeWidth={5} lineCap="round" />
      </Group>
      {object.number ? <Text text={object.number} x={-18} y={-3} width={36} align="center" fill="#ffffff" fontSize={25} fontStyle="bold" /> : null}
    </Group>
  );
}

function PoleObject({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
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
  if (variant === "youth-front" || variant === "youth-angled") {
    return (
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon icon="youthGoal" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
      </Group>
    );
  }
  if (variant === "right") {
    return (
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon icon="goalRight" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
      </Group>
    );
  }
  if (variant === "angled") {
    return (
      <Group scaleX={object.mirrored ? -1 : 1}>
        <SvgIcon icon="goalLeft" color={object.color} colorize targetWidth={goalBaseWidth(object)} />
      </Group>
    );
  }
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <SvgAssetIcon filename="Goal.svg" width={goalBaseWidth(object)} height={goalBaseWidth(object) * 0.58} />
    </Group>
  );
}

function MiniGoal({ object }: { object: DrillEditorObject }) {
  return (
    <Group scaleX={object.mirrored ? -1 : 1}>
      <SvgIcon icon="miniGoal" color={object.color} colorize targetWidth={34} />
    </Group>
  );
}

function LabelObject({ object }: { object: DrillEditorObject }) {
  const text = object.label || "Label";
  const labelWidth = Math.max(76, text.length * 11 + 24);
  const showBackground = object.showBackground ?? false;
  return (
    <>
      {showBackground ? (
        <Rect width={labelWidth} height={32} offsetX={labelWidth / 2} offsetY={16} fill="rgba(255,255,255,0.96)" stroke="rgba(15,23,42,0.22)" strokeWidth={1.5} cornerRadius={7} shadowColor="rgba(15,23,42,0.16)" shadowBlur={6} shadowOffsetY={2} />
      ) : null}
      <Text text={text} width={labelWidth} offsetX={labelWidth / 2} offsetY={9} align="center" fill={object.color} fontSize={17} fontStyle="bold" />
    </>
  );
}

function PreviewLine({ object, objects }: { object: DrillEditorObject; objects: DrillEditorObject[] }) {
  const line = resolvePreviewLineObject(object, objects);
  const points = line.lineStyle === "slalom" ? slalomPoints(line) : linePoints(line);
  const thicknessLevel = normalizeThicknessLevel(object.thickness);
  const thickness = lineStrokeWidth(thicknessLevel) * objectScale;
  const arrowSize = arrowheadSize(thicknessLevel) * objectScale;
  const dash = object.lineStyle === "dashed" ? [18 * objectScale, 12 * objectScale] : undefined;
  const controlX = (line.controlX ?? midpoint(line.x, line.endX ?? line.x + 120)) * scaleX;
  const controlY = (line.controlY ?? midpoint(line.y, line.endY ?? line.y)) * scaleY;

  return (
    <Group>
      {object.lineStyle === "slalom" ? (
        <>
          <Line points={points} stroke={object.color} strokeWidth={thickness} lineCap="round" lineJoin="round" tension={0.35} />
          {object.arrowHead ?? true ? <Arrow points={lastSegment(points)} stroke={object.color} fill={object.color} strokeWidth={thickness} pointerLength={arrowSize} pointerWidth={arrowSize} /> : null}
        </>
      ) : (
        <>
          <Line points={points} stroke={object.color} strokeWidth={thickness} dash={dash} lineCap="round" lineJoin="round" tension={0.5} />
          {object.arrowHead ?? true ? <Arrow points={lastSegment(points)} stroke={object.color} fill={object.color} strokeWidth={thickness} pointerLength={arrowSize} pointerWidth={arrowSize} dash={dash} /> : null}
        </>
      )}
      {object.label ? (
        <Text text={object.label} x={controlX - 36} y={controlY - 24} width={72} align="center" fill={object.color} fontStyle="bold" />
      ) : null}
    </Group>
  );
}

function linePoints(object: DrillEditorObject) {
  if (!object.curveEdited) {
    const startX = finiteNumber(object.x, 0) * scaleX;
    const startY = finiteNumber(object.y, 0) * scaleY;
    const endX = finiteNumber(object.endX, object.x + 120) * scaleX;
    const endY = finiteNumber(object.endY, object.y) * scaleY;
    return [startX, startY, endX, endY];
  }

  return curvedLinePoints(object);
}

function curvedLinePoints(object: DrillEditorObject) {
  const startX = finiteNumber(object.x, 0) * scaleX;
  const startY = finiteNumber(object.y, 0) * scaleY;
  const endX = finiteNumber(object.endX, object.x + 120) * scaleX;
  const endY = finiteNumber(object.endY, object.y) * scaleY;
  const controlX = finiteNumber(object.controlX, midpoint(object.x, object.endX ?? object.x + 120)) * scaleX;
  const controlY = finiteNumber(object.controlY, midpoint(object.y, object.endY ?? object.y)) * scaleY;
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
  const startX = finiteNumber(object.x, 0) * scaleX;
  const startY = finiteNumber(object.y, 0) * scaleY;
  const endX = finiteNumber(object.endX, object.x + 120) * scaleX;
  const endY = finiteNumber(object.endY, object.y) * scaleY;
  const controlX = finiteNumber(object.controlX, midpoint(object.x, object.endX ?? object.x + 120)) * scaleX;
  const controlY = finiteNumber(object.controlY, midpoint(object.y, object.endY ?? object.y)) * scaleY;
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
    const wave = index === 0 || index === steps ? 0 : Math.sin(t * Math.PI * 9) * slalomWaveAmplitude * objectScale;
    points.push(baseX + normalX * wave, baseY + normalY * wave);
  }

  return points;
}

function lastSegment(points: number[]) {
  if (points.length < 4) return points;
  return points.slice(points.length - 4);
}

function midpoint(a: number, b: number) {
  return (a + b) / 2;
}

function finiteNumber(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function resolvePreviewLineObject(line: DrillEditorObject, objects: DrillEditorObject[]) {
  const freeStart = { x: finiteNumber(line.x, 0), y: finiteNumber(line.y, 0) };
  const freeEnd = { x: finiteNumber(line.endX, freeStart.x + 120), y: finiteNumber(line.endY, freeStart.y) };
  const startAnchor = previewAnchorFromObject(line, "start", objects);
  const endAnchor = previewAnchorFromObject(line, "end", objects);
  const startPoint = startAnchor ? previewResolveAnchorPoint(startAnchor, objects, new Set([line.id])) ?? freeStart : freeStart;
  const endPoint = endAnchor ? previewResolveAnchorPoint(endAnchor, objects, new Set([line.id])) ?? freeEnd : freeEnd;
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

type PreviewAnchor =
  | { type: "marker"; objectId: string }
  | { type: "line-endpoint"; objectId: string; endpoint: "start" | "end" };

function previewAnchorFromObject(line: DrillEditorObject, endpoint: "start" | "end", objects: DrillEditorObject[]): PreviewAnchor | null {
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
  const legacyTarget = objects.find((object) => object.id === objectId);
  return legacyTarget?.type === "marker" ? { type: "marker", objectId } : null;
}

function previewResolveAnchorPoint(anchor: PreviewAnchor, objects: DrillEditorObject[], visiting: Set<string>): { x: number; y: number } | null {
  const target = objects.find((object) => object.id === anchor.objectId);
  if (!target) return null;
  if (anchor.type === "marker") return previewObjectCenter(target);
  if (target.type !== "arrow" || visiting.has(target.id)) return null;
  visiting.add(target.id);
  const resolvedLine = previewResolveLineObjectWithVisited(target, objects, visiting);
  visiting.delete(target.id);
  return anchor.endpoint === "start"
    ? { x: resolvedLine.x, y: resolvedLine.y }
    : { x: resolvedLine.endX ?? resolvedLine.x + 120, y: resolvedLine.endY ?? resolvedLine.y };
}

function previewResolveLineObjectWithVisited(line: DrillEditorObject, objects: DrillEditorObject[], visiting: Set<string>) {
  const freeStart = { x: finiteNumber(line.x, 0), y: finiteNumber(line.y, 0) };
  const freeEnd = { x: finiteNumber(line.endX, freeStart.x + 120), y: finiteNumber(line.endY, freeStart.y) };
  const startAnchor = previewAnchorFromObject(line, "start", objects);
  const endAnchor = previewAnchorFromObject(line, "end", objects);
  const startPoint = startAnchor ? previewResolveAnchorPoint(startAnchor, objects, visiting) ?? freeStart : freeStart;
  const endPoint = endAnchor ? previewResolveAnchorPoint(endAnchor, objects, visiting) ?? freeEnd : freeEnd;
  return {
    ...line,
    ...(startAnchor ? { x: startPoint.x, y: startPoint.y } : {}),
    ...(endAnchor ? { endX: endPoint.x, endY: endPoint.y } : {})
  };
}

function previewObjectCenter(object: DrillEditorObject) {
  return {
    x: finiteNumber(object.x, 0),
    y: finiteNumber(object.y, 0)
  };
}

function goalBaseWidth(object: DrillEditorObject) {
  if (object.variant === "youth-front" || object.variant === "youth-angled") return 92;
  if (object.variant === "angled") return 109;
  if (object.variant === "right") return 343;
  return 156;
}
