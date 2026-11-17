# Scouting 2.0 Phase 1: Audit und Umsetzung

Arbeitsverzeichnis: `/private/tmp/coachboard-scouting-2-phase-1`

Branch: `feature/scouting-2-phase-1`, urspruenglicher Ausgangspunkt `c38c434`.
Release-Basis: `origin/main` (`7d7bdf8d5c673fa1e7e1bc5feee546b93a7fb067`).
Die Integration erfolgte konfliktfrei; Trial-Uebernahme, Archiv/Reaktivierung und
Attendance-Aenderungen aus `c761a86`, `47c218e` und `7d7bdf8` bleiben erhalten.

Keine Production-Spielerdaten wurden gelesen oder veraendert. Die zehn neuen
Spalten wurden am 17.11.2026 per REST-SELECT mit `limit=0` im Projekt
`oofieiclxdznvjqjodke` erfolgreich geprueft (beide Tabellen HTTP 200).
Andere Arbeitsverzeichnisse wurden nicht bearbeitet.

## 1. Bestehende Architektur

Der vorhandene Next.js-Workspace verwendet `scouting_players`,
`scouting_observations`, `scouting_targets`, `scouting_target_players` und
`scouting_history`. `lib/scouting/actions.ts` enthält die bestehenden Server
Actions; `queries.ts` enthält benutzergebundene Lesezugriffe. Die originalen
RLS-Policies verwenden `auth.uid() = user_id`; zusammengesetzte Fremdschlüssel
verhindern Verknüpfungen zwischen verschiedenen Eigentümern.

Spieler besitzen bereits Namen, Geburtsdatum, Positionen, Fuß, Verein/Mannschaft,
Quelle, Priorität, Notizen, Körperdaten, Pipeline-Status, nächste Aktion und Datum.
Nur eine Identifikation im bisherigen `first_name`-Feld ist erforderlich.

Beobachtungen besitzen bereits Datum, Kontext, Ereignis, Position, beobachtete
Minuten, Beobachter, Zusammenfassung, Stärken, Entwicklungsfelder, freie nächste
Aktion und optionale Einzelbewertungen 1–5 (Technik, Taktik, Physis, Mentalität).
Datum und kurze Zusammenfassung bleiben Pflicht; keine weiteren Pflichtfelder.

## 2. Bereits erfüllte Anforderungen

Spieler anlegen/bearbeiten, mögliche Duplikate prüfen, Beobachtungen hinzufügen
und bearbeiten, chronologische Ansicht, Stärken/Entwicklungsfelder, Einzelnoten,
Pipeline, Suchprofile, Zielzuordnungen, History und Trial-Verknüpfung waren vorhanden.
Diese Architektur wurde weiterverwendet, nicht ersetzt.

## 3. Gefundene Schwächen

- Erstaufnahme zeigte sämtliche Detailfelder auf einmal.
- Rückennummer und nur bekannter Jahrgang hatten keine eigenen Felder.
- Offene Fragen, nächster Beobachtungsfokus, historische Empfehlung und
  Beobachtungs-Wiedervorlage fehlten.
- Mannschaft/Gegner/Wettbewerb und konkrete Szenen waren nicht getrennt erfassbar.
- Duplikatprüfung berücksichtigte keinen Jahrgang und normalisierte Binnenabstände nicht.
- Formulare nutzten automatische Action-Resets, auch bei zurückgegebenen Fehlern
  oder Duplikatwarnungen. Das konnte eingegebene Texte zurücksetzen.
- Texte wurden serverseitig still abgeschnitten.
- Fälligkeiten berücksichtigten nur die Spieler-Aktion, nicht die Beobachtung.
- Reihenfolge mehrerer Beobachtungen am selben Tag war nicht eindeutig.

## 4. Umsetzung

Die Erstaufnahme zeigt Identifikation, optionalen Nachnamen, Geburtsdatum/Jahrgang,
Rückennummer, Verein, Position und kurze Notiz. Weitere Angaben sind beim Anlegen
eingeklappt und beim Bearbeiten geöffnet. Bei unbekanntem Namen kann der Coach
eine vorläufige Bezeichnung wie `Nr. 7` verwenden; es wird kein Name erfunden.
Vor einem Trial sollte die Bezeichnung im bestehenden Profil vervollständigt werden.

Die vorhandene Duplikatwarnung bleibt nicht blockierend: bestehendes Profil öffnen
oder die separate Anlage ausdrücklich bestätigen. Namen werden nach Unicode,
Groß-/Kleinschreibung und Abständen normalisiert. Bekanntes Geburtsdatum hat Vorrang;
danach Jahrgang, sonst Verein. Widersprüchliche bekannte Geburtsdaten/-jahre werden
nicht als gleicher Spieler behandelt. Es erfolgt keine automatische Zusammenführung.

Spieler- und Beobachtungsformulare behalten Eingaben nach Fehlern und Warnungen.
Während des Speicherns ist der Submit deaktiviert. Zu lange Texte werden mit einem
Fehler abgewiesen statt unbemerkt gekürzt. Jahrgang/Geburtsdatum werden abgeglichen.

## 5. Dateien

Geändert:

- `app/(app)/scouting/page.tsx`
- `app/(app)/scouting/players/page.tsx`
- `app/(app)/scouting/players/[id]/page.tsx`
- `app/(app)/scouting/players/[id]/observations/new/page.tsx`
- `components/scouting/forms.tsx`
- `lib/scouting/actions.ts`
- `lib/scouting/copy.ts`
- `lib/scouting/queries.ts`
- `lib/scouting/validation.ts`
- `supabase/schema.sql`
- `types/database.ts`

Neu:

- `lib/scouting/workflow.ts`
- `supabase/migrations/20261117_scouting_observation_workflow.sql`
- `scripts/scouting-workflow-regression.mjs`
- `scripts/scouting-workflow-migration.mjs`
- `scripts/scouting-workflow-browser.mjs`
- `docs/scouting-2-phase-1-report.md`

## 6. Datenmodell

Nur nullable Spalten an vorhandenen Tabellen:

| Tabelle | Neue Spalten |
| --- | --- |
| `scouting_players` | `shirt_number` (Text), `birth_year` (Integer 1900–2100) |
| `scouting_observations` | `player_team`, `opponent`, `competition`, `situations`, `open_questions`, `next_focus`, `recommendation` (Text), `follow_up_date` (Datum) |

Keine neuen Tabellen, kein Score, keine Änderung der Squad-Datenstruktur.
`types/database.ts` wurde entsprechend angepasst. Die Typen wurden lokal gepflegt,
nicht aus einer bereits migrierten Production-Datenbank generiert.

## 7. Migration und Production

**Production-Migration bereits angewendet (vom Auftraggeber bestaetigt):**

`supabase/migrations/20261117_scouting_observation_workflow.sql`

Die Migration wurde zuerst angelegt. Sie ist transaktional und verwendet
`ADD COLUMN IF NOT EXISTS`. Vorhandene Daten erhalten nur NULL für neue Felder;
kein Backfill, kein UPDATE/DELETE, keine Änderung bestehender Policies/Trigger.
Der vorhandene `set_updated_at`-Trigger und die Owner-Fremdschlüssel gelten weiter.

Die Migration wurde lokal gegen das ursprüngliche Scouting-Schema in PGlite
zweimal ausgeführt. Altdaten, Zeitstempel, Policies, RLS-Sichtbarkeit und
Cross-Owner-Fremdschlüssel wurden geprüft. Die neuen Production-Spalten wurden
zusaetzlich lesend per REST verifiziert. Die Production-Constraints wurden laut
Auftraggeber separat erfolgreich verifiziert; hier erfolgte keine schreibende
Production-Pruefung und keine erneute Ausfuehrung der Migration.

Die Migration bleibt byte-identisch zum Branch `scouting-2-migration` und wird im
Scouting-Release auf `main` mitgefuehrt. Fuer diesen Release ist keine weitere
Production-Migration erforderlich. Die Spielerarchiv-Migration ist bereits Teil
der aktuellen `main`-Basis; auch sie wurde hier nicht erneut ausgefuehrt.

## 8. Konkrete Spielsituationen

`scouting_observations.situations` ist ein optionaler Freitext mit bis zu 12.000
Zeichen. Mehrere Szenen passen in einen Bericht, getrennt durch Absätze. Der
lokalisierte Tooltip nennt Minute, Kontext, Wahrnehmung/Entscheidung, Ausführung
und Wirkung. Es gibt bewusst keine Event-Tabelle, keine Szenen-Scores und kein Tracking.

## 9. Stärken

Weiterhin das bestehende Freitextfeld `strengths`. Keine Duplizierung, keine Bewertung
aus dem Text abgeleitet.

## 10. Entwicklungsfelder

Weiterhin `development_considerations`. Der Tooltip berücksichtigt körperliche
Entwicklung, Erfahrung und Kontext; es wird kein Talentdefizit errechnet.

## 11. Offene Fragen

Optionales `open_questions` pro Beobachtung. Sichtbar im chronologischen Bericht
und für die neueste Beobachtung auf der Profilübersicht.

## 12. Nächster Beobachtungsfokus

Optionales `next_focus` pro Beobachtung. Die neueste Beobachtung nach Datum,
Erstellungszeit und ID liefert den Profilfokus sowie den sichtbaren Hinweis beim
Start der nächsten Beobachtung. Der Hinweis wird nicht still in neue Felder kopiert.
Ein leerer Fokus im neuesten Bericht bedeutet keinen neuen Fokus; ältere Werte
werden nicht heimlich wieder hervorgeholt.

## 13. Nächster Schritt und Wiedervorlage

Der vorhandene Beobachtungs-Freitext `next_action` bleibt erhalten. Dazu kommt
`follow_up_date`. Spielerprofil und Beobachtungsverlauf zeigen beide.
Die bestehende Scouting-Übersicht und der Fälligkeitsfilter berücksichtigen nun
auch das Datum der neuesten Beobachtung, selbst wenn deren Aktionstext leer ist.
Die unabhängige bisherige Spieler-Aktion bleibt erhalten. Bei zwei Terminen gilt
für die Fälligkeitsanzeige der frühere. Archivierte und übernommene Spieler sind
nicht mehr im Follow-up-Fälligkeitsfilter. Keine automatische Erledigung aller
Spieler-Aktionen beim Schreiben einer Beobachtung.

## 14. Beobachtung und Pipeline

Empfehlungen speichern bestehendes Pipeline-Vokabular: `monitoring`, `shortlist`,
`trial`, `archived`, `identified`. Im Empfehlungskontext heißen `archived`
„Aktuell nicht weiter verfolgen“ und `identified` „Weiterer interner Schritt“.
Der aktuelle Pipeline-Status wird weiterhin ausdrücklich unter „Spieler bearbeiten“
geändert. Ein Bericht löst keinen Trial und keine Kaderübernahme automatisch aus.

## 15. Historische Einschätzungen

Jeder Bericht besitzt seine eigene Empfehlung, Aktion, Fragen und Fokus. Spätere
Pipeline-Wechsel verändern keine alten Berichte. Ein bewusstes Bearbeiten eines
alten Berichts bleibt erlaubt. Die vorhandene `scouting_history` dokumentiert
weiterhin Anlage, Statuswechsel, Beobachtungsanlage, Zielverknüpfungen und Trial/
Kader-Verknüpfungen; sie ist keine vollständige Versionierung jedes Texteingriffs.

## 16. Trial-/Kader-Verbindung

Bestehender Ablauf unverändert: `inviteScoutingPlayerToTrial` legt den Kaderspieler
einmal als `trial` an und verknüpft ihn über `linked_squad_player_id`.
Die vorhandene Übernahmefunktion aktualisiert denselben Squad-Spieler zu `roster`,
setzt den verknüpften Scouting-Status auf `added_to_squad` und protokolliert dies.
Die Scouting-Spieler-ID und ihre Beobachtungen bleiben erhalten. Die inzwischen
veroeffentlichte Uebernahme-UX aus `c761a86` ist unveraendert enthalten und wird
mit ihren vorhandenen Regressions- und Browserchecks erneut validiert.

## 17. Mobile und Sprache

DE/EN bleiben in der vorhandenen, typisierten `scoutingCopy`-Architektur.
Neue Labels und Tooltips liegen dort. Quelltexte des Coaches werden nicht übersetzt.
Große Eingabefelder/Submit-/Bearbeiten-Ziele, einspaltige mobile Formulare,
`min-w-0`, sichere Umbrüche und einklappbare Zusatzangaben/Einzelbewertungen.
Keine bewegungsbasierten Hover-Effekte ergänzt. Beobachtungsstatus und historische
Empfehlung sind unterschiedlich beschriftet.

## 18. Tests und Grenzen

Lokale Regressionen prüfen echte Parser, Server Actions und Queries gegen eine
In-Memory-Datenbankgrenze: Anlegen, Duplikatwarnung, Ownership, zwei Beobachtungen,
Bearbeiten, History, Pipeline-Unabhängigkeit, Fehler, Datumsvalidierung, optionale
Noten, Fokus und Fälligkeiten. Die bestehende Trial-Verknüpfung wurde im Code
geprüft; es wurde kein echter Probespieler in Production angelegt/übernommen.

Browsercheck: echte Formulare und Profilkomponente mit fiktiven Daten und simulierten
Serverantworten; DE/EN bei 320, 768, 1440 und 1920 px. Anlegen, Duplikatbestätigung,
Fehlersimulation ohne Textverlust, Wiedervorlage, Wiederöffnen nach Reload,
zwei Berichte, Bearbeiten und Pipeline-/History-Anzeige. Keine horizontalen
Überläufe oder Page-JavaScript-Fehler. Screenshots unter `/private/tmp/scouting-2-*`.
Dies ist kein authentifizierter Supabase-/Production-E2E-Nachweis.

## 19. Ausgeführte Prüfungen

```bash
npm run typecheck
npm run lint
npm run i18n:check
npm run db:check
npm run test:server-actions
npm run test:trial-sync
node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/trial-promotion-regression.mjs
node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/player-archive-absence-regression.mjs
node --experimental-strip-types --experimental-loader ./scripts/ts-alias-loader.mjs scripts/scouting-workflow-regression.mjs
COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa node scripts/scouting-workflow-migration.mjs
npm run build
COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa node scripts/scouting-workflow-browser.mjs
COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa node scripts/trial-promotion-browser.mjs
COACHBOARD_QA_DEPS=/private/tmp/coachboard-archive-qa node scripts/player-archive-browser.mjs
git diff --check
```

Alle oben genannten Prüfungen bestanden. Die SQL-Tests benötigen `@electric-sql/pglite`,
Browserchecks `esbuild`, `playwright` und Chrome im externen QA-Verzeichnis.
Keine neuen App-Abhängigkeiten. Nicht blockierende bekannte Build-Warnungen:
veralteter Browserslist-Datenbestand und große Webpack-Cache-Strings.

## 20. Sinnvolle nächste Schritte und bewusste Grenzen

- Authentifizierter Production-Smoke-Test mit dediziertem Testkonto bleibt erforderlich;
  lokale Browserchecks mit simulierten Serverantworten ersetzen diesen nicht.
- Optional: gemeinsamer Review-Workflow und gezielte Such-/Filterverbesserung, ohne Rankings.
- Bestehende Query-Limits bleiben: 1.000 Spieler, 5.000 Beobachtungs-Metadaten in
  der Übersicht, 300 Berichte und 200 History-Einträge je Profil. Größere Bestände
  benötigen später Pagination und serverseitige Duplikat-/Latest-Abfragen.
- Bestehende History-Zusatzwrites sind nicht transaktional mit der Hauptänderung.
  Diese Architektur wurde nicht großflächig umgebaut; ein Ausfall nur des History-
  Inserts kann weiterhin einen zusätzlichen Logeintrag verhindern.
- Keine Offline-Synchronisierung, Versionshistorie jeder Textänderung, neue Analytics,
  Talentprognose, automatisches Ranking oder neues Match-/Task-Management.

## Deployment-Checkliste

1. Production-Migration ist bestaetigt und Spalten sind lesend geprueft. Nicht erneut ausfuehren.
2. Aktuellen `origin/main` vor Push erneut abgleichen.
3. Ausschliesslich die oben aufgefuehrten 17 Scouting-Dateien veroeffentlichen.
4. Vercel-Status fuer den exakten Release-Commit pruefen.
5. Nicht-destruktiver Production-Smoke-Test soweit Authentifizierung verfuegbar ist;
   einen fehlenden angemeldeten Testzugriff ausdruecklich als Pruefluecke melden.
