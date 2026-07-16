"use client";

import { Group, Path } from "react-konva";
import { svgIcons, type SvgIconKey } from "@/lib/editor/svg-icons";

type SvgIconProps = {
  icon: SvgIconKey;
  color: string;
  colorize?: boolean;
  jerseyColorize?: boolean;
  targetWidth?: number;
  targetHeight?: number;
};

export function SvgIcon({ icon, color, colorize = false, jerseyColorize = false, targetWidth, targetHeight }: SvgIconProps) {
  const data = svgIcons[icon];
  const paths = data.paths as ReadonlyArray<{
    d: string;
    x: number;
    y: number;
    fill?: string;
    stroke?: string;
    opacity?: string;
    fillRule?: string;
  }>;
  const width = Math.max(data.bbox.maxX - data.bbox.minX, 1);
  const height = Math.max(data.bbox.maxY - data.bbox.minY, 1);
  const scale = targetWidth ? targetWidth / width : targetHeight ? targetHeight / height : 1;
  const centerX = (data.bbox.minX + data.bbox.maxX) / 2;
  const centerY = (data.bbox.minY + data.bbox.maxY) / 2;

  return (
    <Group x={-centerX * scale} y={-centerY * scale} scaleX={scale} scaleY={scale}>
      {paths.map((path, index) => (
        <Path
          key={`${icon}-${index}`}
          data={path.d}
          x={path.x}
          y={path.y}
          fill={jerseyColorize ? recolorJersey(path.fill, color) : colorize ? recolor(path.fill, color) : path.fill}
          stroke={jerseyColorize ? recolorJersey(path.stroke, color) : colorize ? recolor(path.stroke, color) : path.stroke}
          opacity={path.opacity ? Number(path.opacity) : undefined}
          fillRule={path.fillRule === "evenodd" ? "evenodd" : undefined}
        />
      ))}
    </Group>
  );
}

function recolorJersey(value: string | undefined, color: string) {
  if (!value || value === "none") return value;
  const normalized = value.trim().toLowerCase();

  if (normalized === "#004aad" || normalized === "#80ff00") return color;
  return value;
}

function recolor(value: string | undefined, color: string) {
  if (!value || value === "none") return value;
  if (value.startsWith("url(")) return color;

  const normalized = value.trim().toLowerCase();
  if (normalized === "#000000" || normalized === "#111827" || normalized === "black") return value;
  if (normalized === "#ffffff" || normalized === "#fff" || normalized === "white") return value;
  if (normalized.includes("rgb(0") || normalized.includes("rgb(255")) return value;
  if (normalized === "#e0e0e0" || normalized === "#d1d5db" || normalized === "#f9f9f8") return value;

  return color;
}
