import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const allowedIconFiles = new Set(["Football.svg", "Tennis Ball.svg", "Basketball.svg", "Cone Simple.svg", "Goal.svg"]);

function isHexColor(value: string | null) {
  return Boolean(value?.match(/^#[0-9a-fA-F]{6}$/));
}

function shadeHex(hex: string, amount: number) {
  const numeric = Number.parseInt(hex.slice(1), 16);
  const red = Math.min(255, Math.max(0, (numeric >> 16) + amount));
  const green = Math.min(255, Math.max(0, ((numeric >> 8) & 255) + amount));
  const blue = Math.min(255, Math.max(0, (numeric & 255) + amount));
  return `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
}

function recolorCone(svg: string, color: string) {
  const light = shadeHex(color, 42);
  const dark = shadeHex(color, -48);
  return svg
    .replaceAll("#ffaa71", light)
    .replaceAll("#ff9b58", color)
    .replaceAll("#c34102", dark)
    .replace(/stop-color="rgb\((?:9[1-9]|100)%,\s*(?:3[8-9]|4[0-9]|5[0-6])(?:\.\d+)?%,\s*(?:0|[1-9]|1[0-9]|2[0-4])(?:\.\d+)?%\)"/g, `stop-color="${color}"`);
}

export async function GET(_: Request, { params }: { params: Promise<{ filename: string }> }) {
  const requestUrl = new URL(_.url);
  const { filename } = await params;
  const decodedFilename = decodeURIComponent(filename);

  if (!allowedIconFiles.has(decodedFilename)) {
    return new NextResponse("Icon not found", { status: 404 });
  }

  const iconPath = path.join(process.cwd(), "Icons", decodedFilename);
  const rawIcon = await readFile(iconPath, "utf8");
  const color = requestUrl.searchParams.get("color");
  const icon = decodedFilename === "Cone Simple.svg" && isHexColor(color) ? recolorCone(rawIcon, color as string) : rawIcon;

  return new NextResponse(icon, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8"
    }
  });
}
