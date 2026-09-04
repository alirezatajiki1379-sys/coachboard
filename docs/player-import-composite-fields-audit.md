# CoachBoard Player Import Composite Fields Audit

## 1. Existing Import Architecture Discovered

CoachBoard uses `components/squad/player-import-workflow.tsx` for the client workflow and `lib/squad/importer.ts` for mapping, normalization, preview row creation and duplicate detection. The server-side import is handled in `lib/squad/import-actions.ts`.

The previous architecture was mostly flat: each source column mapped to one destination field. This pass keeps the existing flow but adds stable destination IDs for composite concepts and grouped mapping/preview UI.

## 2. CSV Parsing Architecture

CSV parsing remains client-side before review. The parser supports quoted values, escaped quotes and file-level limits.

## 3. Delimiter Detection

Delimiter detection supports comma, semicolon and tab. Pasted table import now also uses delimiter detection instead of assuming tab-only input.

## 4. Encoding Handling

CSV upload first decodes as UTF-8. If replacement characters are found, it falls back to Windows-1252 so German headers such as `Straße` and `Größe` remain readable.

## 5. Composite Destination-Field Architecture

New stable import field IDs were added for grouped concepts:

- `address.street` equivalent: `addressStreet`
- `address.postalCode` equivalent: `addressPostalCode`
- `address.city` equivalent: `addressCity`
- dominant-foot marker sources: `dominantFootLeftMarker`, `dominantFootRightMarker`
- position-family marker sources: `positionFamilyDefensive`, `positionFamilyMidfield`, `positionFamilyAttacking`, `positionFamilyGoalkeeper`

The review data still stores normalized values per stable field key so language changes do not change the mapping IDs.

## 6. Address Implementation

Address is stored structured in `squad_players`:

- `address_street`
- `address_postal_code`
- `address_city`

The import mapping screen shows Address as one grouped destination card. Player Profile displays Address as one coherent block.

## 7. Postal-Code Handling

Postal code is imported and stored as text. Leading zeroes are preserved.

## 8. Spreadsheet Apostrophe Cleanup

Spreadsheet-protection apostrophes are removed from imported cell values:

- `'40789` becomes `40789`
- `'017657910844` becomes `017657910844`

Meaningful leading zeroes remain.

## 9. Player Name Grouping

`Vorname` and `Nachname` are displayed under the Player name mapping group and remain structured as `first_name` and `last_name`.

## 10. Contact Grouping

Contact is grouped in mapping and profile display:

- Phone
- Primary email
- Secondary email

`secondary_email` was added as a nullable player field.

## 11. Birth Date Mapping

`Geb.` and common German/English aliases map to Date of birth. German `DD.MM.YYYY` dates normalize to ISO database dates.

## 12. Current Club Mapping

`Verein` maps to Current club and is preserved as source text.

## 13. Dominant-Foot Multi-Column Mapping

`Links` and `Rechts` marker columns are interpreted together:

- left marked only: `left`
- right marked only: `right`
- both marked: `both`
- neither marked: empty

## 14. Position-Family Mapping

Broad marker columns are imported conservatively:

- `Abwehr` -> `Defensive`
- `Mittelfeld` -> `Midfield`
- `Angriff` -> `Attacking`
- `Torwart` -> `Goalkeeper`

Outfield families are stored as `position_families` and do not invent exact positions. `Torwart` may derive exact `GK`.

## 15. Exact-Position Alias Preservation

Existing exact-position normalization remains covered by regression tests, including `ZOM`, `ZDM`, `ZM`, `RF`, winger aliases and German role-number variants.

## 16. Team Membership Mapping

Team membership fields are stored without creating fake history:

- `joined_date`
- `exit_date`
- `exit_reason`

Blank exit data remains null.

## 17. Scouting/Source Mapping

New nullable fields:

- `scouting_source`
- `development_centre`
- `last_performance_review_date`

No rating records are fabricated from the last review date.

## 18. Physical Data Parsing

Height and weight are stored as numeric values. Distance is available as nullable `distance_km`.

## 19. German Decimal Handling

German decimal comma values are parsed only for numeric fields:

- `166,4` -> `166.4`
- `47,8` -> `47.8`

## 20. Unknown-Column Handling

Unknown columns remain visible in the mapping table and default to Ignore. The coach can manually map them.

## 21. Automatic Mapping Confidence

Mappings still use `high`, `possible`, `confirm` and `unmapped`. `Entfernung` maps to distance with confirmation required because the semantic meaning can vary.

## 22. Import Preview Implementation

The review step now shows a transformed player preview grouped by:

- Name
- Birth date
- Address
- Contact
- Football
- Physical

## 23. Duplicate Detection/Update Handling

Existing duplicate detection remains based on strong player identity signals such as external ID, name plus birth date, email and phone. Address alone is not used as an identity.

## 24. Blank-Value Overwrite Protection

Existing update behavior is preserved: blank import values do not erase existing player data by default.

## 25. German Localization

WARNING: German/English i18n key parity passes, but the wider import workflow still contains hardcoded English strings. Full bilingual import UI text remains follow-up work.

## 26. English Localization

English import UI remains available as before.

## 27. Mobile Import UX

Grouped mapping cards use responsive grids. The detailed mapping table remains horizontally scrollable for safety on small screens.

## 28. RLS/Security

No RLS policy changes were required. New columns live on `squad_players`, which is already user-scoped by `user_id` and squad ownership checks.

## 29. Schema Changes/Migrations

Migration required:

`supabase/migrations/20260904_player_import_composite_fields.sql`

## 30. Generated Type Changes

`types/database.ts`, `types/domain.ts` and `lib/squad/mappers.ts` were updated manually to match the new schema fields.

## 31. Tests Executed

Passed:

- `npm run test:import-composite`
- `npm run test:import-duplicates`
- `npm run test:positions`
- `npm run test:recurrence`
- `npm run test:calendar`
- `npm run db:check`
- `npm run typecheck`
- `npm run lint`
- `npm run i18n:check`
- `npm run build`

`npm run i18n:audit` exits successfully but reports remaining hardcoded strings across the app.

## 32. Remaining Unmapped Source Concepts

`Entfernung` is mapped to `distance_km` with manual confirmation because the source spreadsheet does not prove whether it is distance from home, training ground or club.

## 33. Production Actions

Apply the new Supabase migration before deploying code that references the new columns.

## REAL CSV HEADER SUPPORT

| Source header | Status | Destination |
| --- | --- | --- |
| Nachname | AUTO-MAPPED | Player name / Last name |
| Vorname | AUTO-MAPPED | Player name / First name |
| Straße | AUTO-MAPPED | Address / Street |
| PLZ | AUTO-MAPPED | Address / Postal code |
| Ort | AUTO-MAPPED | Address / City |
| Geb. | AUTO-MAPPED | Birth date |
| Verein | AUTO-MAPPED | Current club |
| Telefon privat | AUTO-MAPPED | Contact / Phone |
| E-Mail | AUTO-MAPPED | Contact / Primary email |
| 2. E-Mail | AUTO-MAPPED | Contact / Secondary email |
| Eintritt ins TFP | AUTO-MAPPED | Team membership / Joined date |
| Gesichtet bei | AUTO-MAPPED | Scouting source |
| Stützpunkt | AUTO-MAPPED | Development centre |
| Austritt | AUTO-MAPPED | Team membership / Exit date |
| Austrittsgrund | AUTO-MAPPED | Team membership / Exit reason |
| Datum letzte Leistungsbewertung | AUTO-MAPPED | Last performance review date |
| Links | AUTO-MAPPED | Dominant foot / Left marker |
| Rechts | AUTO-MAPPED | Dominant foot / Right marker |
| Abwehr | AUTO-MAPPED | Position family / Defensive |
| Mittelfeld | AUTO-MAPPED | Position family / Midfield |
| Angriff | AUTO-MAPPED | Position family / Attacking |
| Torwart | AUTO-MAPPED | Position family / Goalkeeper, derives GK when marked |
| Größe | AUTO-MAPPED | Physical / Height |
| Gewicht | AUTO-MAPPED | Physical / Weight |
| Entfernung | MANUAL REVIEW | Distance km |

## ADDRESS COMPOSITE TEST

Expected:

`Straße + PLZ + Ort -> one Address mapping group -> structured street/postalCode/city storage -> one coherent Address display`

Result: PASS

## PRODUCTION ACTION REQUIRED

- Database migration required: yes
- Apply: `supabase/migrations/20260904_player_import_composite_fields.sql`
- Generated Supabase types: updated in `types/database.ts`
- Existing player data: preserved by nullable columns and non-destructive numeric conversion
- Vercel deployment: safe after the Supabase migration is applied
