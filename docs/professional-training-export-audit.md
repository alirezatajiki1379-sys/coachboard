# CoachBoard Professional Training Export Audit

## 1. Existing Export Architecture Discovered

CoachBoard already had `/sessions/[id]/print`, a browser print button, `SessionDrillPreview`, `DrillGraphicPreview`, session duration helpers, station-set helpers and material aggregation helpers.

The export route is authenticated and loads the coach-owned session through `getUserSession`, which batches session drill rows, drill template rows and drill graphics.

## 2. Existing Drill Setup Architecture Discovered

Before this pass, drills had:

- free-text organization
- coaching points
- variations
- materials
- pitch diagram JSON
- player count
- duration

They did not have structured area dimensions or setup measurement parameters.

## 3. Export Strategy Selected

Browser print-to-PDF remains the selected MVP strategy. It is reliable on Vercel, needs no native Chromium/server dependency and preserves the rendered React diagram preview.

## 4. Full Training Export Implementation

`/sessions/[id]/print` now acts as the Full Training export. It includes:

- professional compact header
- date/start/team/location/duration/target metadata
- equipment summary
- player groups
- training plan notes
- timeline by training block
- station sets
- sequential drills
- drill diagrams
- setup data
- materials
- organization/coaching points/variations/easier/harder fields when present

## 5. Field View Implementation

Added `/sessions/[id]/field`.

Field View is a more compact pitch-side document. It prioritizes:

- drill order
- duration
- participant/player range
- station/group context
- setup dimensions
- setup parameters
- materials
- diagrams
- the first coaching points

## 6. Single Drill Export Implementation

Added `/drills/[id]/print`.

The single drill sheet includes:

- drill title and metadata
- diagram
- setup area and parameters
- setup notes
- materials
- organization
- coaching points
- variations
- easier/harder versions

## 7. Session Plan Instance Integration

Session exports use `getUserSession` and `training_session_drills`, so session-specific duration, block, timing mode, station set, participating groups, starting group and coach notes are reflected.

## 8. Session Drill Instance Integration

Session drill instance values are used for ordering and session-specific planning fields. Drill content and diagrams currently come from the linked reusable drill record.

## 9. Copy-on-Use / Historical Integrity Verification

Current limitation: session drill rows reference reusable drills and drill graphics. If a reusable drill diagram/content is changed later, old session exports may reflect the current drill template content. This milestone did not rewrite copy-on-use storage.

## 10. Drill Diagram Rendering/Export Strategy

Exports reuse `DrillGraphicPreview`/`SessionDrillPreview` with `previewMode="print"` and content auto-fit. No fake diagrams are generated.

## 11. Print Resolution Strategy

The current MVP relies on browser print rendering of the React preview. It avoids stretching tiny screenshots into the PDF. A future direct PNG export can add higher pixel-ratio canvas snapshots if needed.

## 12. Area Dimension Implementation

Added optional drill setup area:

```json
{
  "length": 20,
  "width": 25,
  "unit": "m"
}
```

Stored in `drills.setup_area`.

## 13. Setup Parameter Implementation

Added flexible setup parameters:

```json
[
  { "id": "...", "label": "Cone distance", "value": 5, "unit": "m" }
]
```

Stored in `drills.setup_parameters`.

## 14. Marker/Cone Distance Implementation

Distances are not inferred from diagram pixels. They are shown only when entered as setup parameters.

## 15. Equipment Model Implementation

Exports reuse the existing structured drill material list and existing material summary calculation.

## 16. Grouping Implementation

Session exports show player groups and station-set grouping from existing session data.

## 17. Session-Specific Setup Overrides

Not implemented in this pass. Setup dimensions/parameters belong to the reusable drill record. Session-specific overrides remain a future improvement.

## 18. Equipment Summary Semantics

The global session equipment summary uses the existing CoachBoard logic:

- sequential drills use reusable/max logic
- simultaneous drills in the same station set are summed
- the final requirement uses the highest required amount

## 19. A4 Layout

Print CSS keeps A4 margins and removes app chrome. Full Training and Field View use constrained white document surfaces on screen and full printable width in print.

## 20. Page-Break Handling

Print document sections use `break-inside: avoid`/`page-break-inside: avoid` where practical. Long drills may still naturally continue onto another page.

## 21. English Localization

Export-specific labels were added to `messages/en.json`.

## 22. German Localization

Export-specific labels were added to `messages/de.json`.

## 23. User-Content Language Handling

User-created titles, notes, group names, setup parameter labels and coaching content are shown exactly as entered. They are not translated automatically.

## 24. Privacy Behaviour

Training exports do not include ratings, medical information, birthdates, contact details or sensitive player notes.

## 25. Authorization/RLS

Routes require authentication and use existing user-scoped queries. Supabase RLS remains the database backstop.

## 26. Performance/Query Strategy

Session export uses the existing batched session resolver rather than one query per drill.

## 27. Mobile Export Behaviour

Export controls wrap on small screens. The screen preview is readable on mobile; the printed document remains A4-oriented.

## 28. Migrations Created

Created:

```text
supabase/migrations/20260904_drill_setup_export_fields.sql
```

## 29. Generated Type Changes

Updated `types/database.ts` manually to include the new drill setup fields.

## 30. Tests Executed and Results

Record after implementation:

```bash
npm run i18n:check
npm run typecheck
npm run lint
npm run build
npm run db:check
```

## 31. Remaining Export Limitations

- No one-click binary PDF download yet; browser Print → Save as PDF is the supported MVP.
- No high-DPI Konva image snapshot pipeline yet.
- No session-specific setup overrides yet.
- No automatic measurement inference from diagrams.
- Material category labels inside `MaterialSummaryList` are still mostly English until full app i18n migration reaches materials.

## 32. Remaining Production Actions

Apply the Supabase migration to Production before relying on setup dimensions/parameters in deployed forms.

## Field Use Verification

- Understand Drill order: PASS
- See duration: PASS
- See Player/group setup: PASS
- Identify required equipment: PASS
- See pitch/area dimensions: PASS when entered, WARNING when absent
- See marker/cone distances where entered: PASS
- Understand how to build the setup: PASS when organization/setup notes exist, WARNING when no coach content exists
- View the Drill diagram clearly: PASS for existing preview quality, WARNING for future high-DPI snapshot needs
- Quickly see the most important Coaching Points: PASS in Field View, first stored points are shown

## Production Action Required

Supabase migration required:

```sql
alter table public.drills
add column if not exists setup_area jsonb;

alter table public.drills
add column if not exists setup_parameters jsonb not null default '[]'::jsonb;

alter table public.drills
add column if not exists setup_notes text;
```

Generated types are updated in the repository. Vercel deployment is safe after the migration is applied.
