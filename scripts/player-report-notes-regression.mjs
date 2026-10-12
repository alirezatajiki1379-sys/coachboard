import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  absenceReason,
  absenceReasonLabel,
  relevantMedicalPeriods,
  selectedConversationNotes,
  selectableConversationNotes
} from "../lib/squad/player-report.ts";

const range = { from: "2026-09-01", to: "2026-09-30" };
const injury = {
  id: "injury-1", userId: "user-1", playerId: "player-1", type: "injured",
  startDate: "2026-09-03", endDate: "2026-09-19", expectedReturnDate: "2026-09-20",
  actualReturnDate: "2026-09-20", description: "Ankle injury", status: "completed",
  createdAt: "2026-09-03T10:00:00Z", updatedAt: "2026-09-20T10:00:00Z"
};
const relevantInjuries = relevantMedicalPeriods([injury], range);
assert.equal(relevantInjuries.length, 1, "1. Injury appears in Player Conversation period");
assert.equal(relevantInjuries[0].startDate, "2026-09-03", "2. Injury start date is preserved");
assert.equal(relevantInjuries[0].expectedReturnDate, "2026-09-20", "3. Expected return is preserved");

const reportPage = readFileSync(new URL("../app/(app)/squad/players/[id]/report/page.tsx", import.meta.url), "utf8");
const reportComponent = readFileSync(new URL("../components/squad/player-conversation-report.tsx", import.meta.url), "utf8");
const notesComponent = readFileSync(new URL("../components/squad/player-notes.tsx", import.meta.url), "utf8");
const noteActions = readFileSync(new URL("../lib/squad/player-note-actions.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const globalStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const medicalSelect = reportPage.match(/player_medical_periods"\)\.select\("([^"]+)/)?.[1] ?? "";
assert.equal(medicalSelect.includes("medication"), false, "4. Medication is not queried for the report");
assert.equal(medicalSelect.includes("allergies"), false, "5. Allergies are not queried for the report");
assert.equal(medicalSelect.includes("notes"), false, "6. Private medical notes are not queried for the report");

const absentRecord = { finalStatus: "absent", actualAbsenceReason: "school" };
assert.equal(absenceReason(absentRecord), "school", "7. Canonical missed Training reason is used");
assert.equal(absenceReasonLabel("private", "en"), "Private", "8. Private reason is label-only");
assert.equal(reportComponent.includes("plannedReasonNote"), false, "8b. Private free-text reason is not rendered");
assert.equal(absenceReason({ finalStatus: "absent" }), "not_recorded", "9. Missing reason is not guessed");
assert.equal(absenceReasonLabel("not_recorded", "de"), "Grund nicht erfasst", "9b. Missing reason has the required German label");

const notes = [
  { id: "internal", playerId: "player-1", squadId: "squad-1", userId: "user-1", note: "Internal", noteDate: "2026-09-10", visibility: "internal", pinned: false, createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-09-10T10:00:00Z" },
  { id: "eligible", playerId: "player-1", squadId: "squad-1", userId: "user-1", note: "Suitable", noteDate: "2026-09-11", visibility: "conversation_eligible", pinned: false, createdAt: "2026-09-11T10:00:00Z", updatedAt: "2026-09-11T10:00:00Z" }
];
assert.deepEqual(selectableConversationNotes(notes, range).map((note) => note.id), ["eligible"], "10. Internal note is never selectable");
assert.deepEqual(selectedConversationNotes(notes, ["eligible"], range).map((note) => note.id), ["eligible"], "11. Eligible note can be selected");
assert.equal(selectedConversationNotes(notes, [], range).length, 0, "12. Unselected eligible note is not printed");

assert.match(notesComponent, /action=\{action\}/, "13. Quick Note saves inline through a Server Action");
assert.doesNotMatch(notesComponent, /router\.push|window\.location/, "13b. Quick Note does not navigate away");
assert.match(notesComponent, /noteTimestamp\(note, locale\)/, "14. Quick Note displays a timestamp");
assert.match(schema, /create table if not exists public\.player_notes[\s\S]*created_at timestamptz[\s\S]*updated_at timestamptz/, "15. General note history keeps timestamps");
assert.match(noteActions, /from\("player_notes"\)\.delete/, "16. General note delete targets only player_notes");
assert.doesNotMatch(noteActions, /from\("squad_attendance_records"\)|from\("player_observations"\)/, "16b. General note edits do not affect Training notes or observations");
assert.doesNotMatch(noteActions, /from\("squad_players"\)\.update/, "17. Legacy squad_players.notes is preserved");
assert.match(reportComponent, /Injuries & availability/); assert.match(reportComponent, /Verletzungen & Verfügbarkeit/, "18. Report copy exists in EN and DE");
assert.match(notesComponent, /Quick note/); assert.match(notesComponent, /Schnelle Notiz/, "18b. Note copy exists in EN and DE");
assert.match(notesComponent, /md:grid-cols|lg:col-span/, "19. Notes UI includes responsive layouts");
assert.match(reportComponent, /print:hidden/); assert.match(reportComponent, /player-report-sheet/, "20. Composer is hidden and report uses the canonical printable sheet");
assert.match(globalStyles, /@page player-report\s*\{[\s\S]*size:\s*A4 portrait;[\s\S]*margin:\s*10mm 12mm;/, "20b. Player Reports use the canonical A4 page definition");

console.log("Player Report 2.0 notes/privacy regression: PASS (21 checks)");
