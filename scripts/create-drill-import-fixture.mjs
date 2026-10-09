import { File as NodeFile } from "node:buffer";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";

if (!globalThis.File) globalThis.File = NodeFile;
const output = resolve(process.argv[2] ?? "/tmp/coachboard-drill-import-fixture.zip");
const zip = new JSZip();
const source = { title: "Synthetic coaching notes", publisher: "CoachBoard QA" };
zip.file("drills.json", JSON.stringify({
  schemaVersion: 1,
  batch: { name: "Synthetic five Drill fixture", source },
  drills: [
    drill("fixture-001", "Synthetic passing diamond", "Passing", "Technical drill", "images/001.jpg"),
    drill("fixture-002", "Synthetic dribbling gate", "Dribbling", "Individual exercise", "images/002.png"),
    drill("fixture-003", "Synthetic transition game", "Transition", "Small-sided game", "images/003.webp"),
    drill("fixture-duplicate", "Synthetic passing diamond", "Passing", "Technical drill"),
    { externalId: "fixture-invalid", title: "Synthetic incomplete Drill", durationMinutes: 8, minPlayers: 4, maxPlayers: 8, source }
  ]
}, null, 2));
zip.file("images/001.jpg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
zip.file("images/002.png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
zip.file("images/003.webp", new TextEncoder().encode("RIFF0000WEBP"));
await writeFile(output, await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
console.log(`Created ${output}`);

function drill(externalId, title, mainFocus, drillType, image) {
  return { externalId, title, shortDescription: "Fictional regression content.", organization: "Set up a safe training area.", coachingPoints: ["Scan", "Communicate"], durationMinutes: 10, minPlayers: 4, maxPlayers: 8, mainFocus, drillType, trainingBlocks: ["Main part 1"], tags: ["synthetic"], image, source };
}
