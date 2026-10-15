export type ReviewCarryForwardResult = {
  mainFocus: string;
  notes: string;
  destination: "focus" | "notes" | "already";
};

export function includesReviewCarryForward(mainFocus: string, notes: string, note: string) {
  const normalizedNote = note.trim();
  return Boolean(normalizedNote && (mainFocus.includes(normalizedNote) || notes.includes(normalizedNote)));
}

export function applyReviewCarryForward(mainFocus: string, notes: string, note: string, notesPrefix: string): ReviewCarryForwardResult {
  const normalizedNote = note.trim();
  if (!normalizedNote || includesReviewCarryForward(mainFocus, notes, normalizedNote)) {
    return { mainFocus, notes, destination: "already" };
  }
  if (!mainFocus.trim()) {
    return { mainFocus: normalizedNote, notes, destination: "focus" };
  }
  const paragraph = `${notesPrefix}\n${normalizedNote}`;
  return {
    mainFocus,
    notes: notes.trim() ? `${notes.trim()}\n\n${paragraph}` : paragraph,
    destination: "notes"
  };
}
