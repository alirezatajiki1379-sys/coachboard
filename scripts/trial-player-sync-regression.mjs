import assert from "node:assert/strict";
import { currentEligibleSquadPlayerIds } from "../lib/squad/participant-sync.ts";

const players = [
  player("roster-a", "roster", "team-a"),
  player("trial-a", "trial", "team-a", { trial_start_date: "2026-09-01", trial_duration_mode: "end_date", trial_end_date: "2026-09-30" }),
  player("trial-before", "trial", "team-a", { trial_start_date: "2026-10-01", trial_duration_mode: "end_date", trial_end_date: "2026-10-31" }),
  player("trial-expired", "trial", "team-a", { trial_start_date: "2026-08-01", trial_duration_mode: "end_date", trial_end_date: "2026-08-31" }),
  player("trial-count", "trial", "team-a", { trial_start_date: "2026-09-01", trial_duration_mode: "training_count", trial_training_limit: 2 }),
  player("trial-converted", "trial", "team-a", { converted_at: "2026-09-10T10:00:00Z" }),
  player("roster-other-team", "roster", "team-b"),
  player("trial-deleted", "trial", "team-a", { deleted_at: "2026-09-10T10:00:00Z" })
];

const events = [
  trainingEvent("event-1", "2026-09-02", "team-a"),
  trainingEvent("event-2", "2026-09-09", "team-a"),
  trainingEvent("event-3", "2026-09-16", "team-a"),
  trainingEvent("event-other-team", "2026-09-09", "team-b"),
  { ...trainingEvent("event-custom", "2026-09-09", "team-a"), participant_source_mode: "custom_selection" },
  { ...trainingEvent("event-deleted", "2026-09-09", "team-a"), deleted_at: "2026-09-01T10:00:00Z" }
];

const db = fakeDb({ squad_players: players, squad_training_events: events });

function player(id, player_type, squad_id, overrides = {}) {
  return {
    id,
    user_id: "user-a",
    squad_id,
    player_type,
    converted_at: null,
    trial_start_date: null,
    trial_duration_mode: null,
    trial_training_limit: null,
    trial_end_date: null,
    archived_at: null,
    deleted_at: null,
    ...overrides
  };
}

function trainingEvent(id, date, squad_id) {
  return {
    id,
    user_id: "user-a",
    squad_id,
    date,
    start_time: "18:00",
    participant_source_mode: "current_squad_sync",
    deleted_at: null
  };
}

function fakeDb(tables) {
  return {
    from(table) {
      return new Query(tables[table] ?? []);
    }
  };
}

class Query {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.sorts = [];
  }

  select() {
    return this;
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column, value) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column, value) {
    this.filters.push((row) => row[column] >= value);
    return this;
  }

  lte(column, value) {
    this.filters.push((row) => row[column] <= value);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.sorts.push({ column, ascending });
    return this;
  }

  then(resolve, reject) {
    try {
      let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
      for (const sort of this.sorts.toReversed()) {
        data = data.toSorted((left, right) => {
          if (left[sort.column] === right[sort.column]) return 0;
          const direction = left[sort.column] > right[sort.column] ? 1 : -1;
          return sort.ascending ? direction : -direction;
        });
      }
      resolve({ data, error: null });
    } catch (error) {
      reject(error);
    }
  }
}

assert.deepEqual(
  await currentEligibleSquadPlayerIds(db, "user-a", "2026-09-09", "team-a"),
  ["roster-a", "trial-a", "trial-count"],
  "current-squad sync should include active roster and eligible trial players"
);

assert.deepEqual(
  await currentEligibleSquadPlayerIds(db, "user-a", "2026-09-16", "team-a"),
  ["roster-a", "trial-a"],
  "training-count trials should drop out after their eligible event limit"
);

assert.deepEqual(
  await currentEligibleSquadPlayerIds(db, "user-a", "2026-10-02", "team-a"),
  ["roster-a", "trial-before"],
  "end-date trials should respect start/end windows"
);

assert.deepEqual(
  await currentEligibleSquadPlayerIds(db, "user-a", "2026-09-09", "team-b"),
  ["roster-other-team"],
  "sync must stay scoped to the active event team"
);

console.log("Trial player auto-sync regression checks passed.");
