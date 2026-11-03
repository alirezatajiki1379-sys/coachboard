import type { AnalyticsPlayerTypeFilter, AnalyticsSortKey, AnalyticsSortDirection } from "@/lib/squad/analytics";

export const analyticsPlayerTypeOptions: Record<"en" | "de", Array<{ id: AnalyticsPlayerTypeFilter; label: string; compact: string }>> = {
  en: [
    { id: "all", label: "All players", compact: "All" },
    { id: "roster", label: "Roster players", compact: "Roster" },
    { id: "trial", label: "Trial players", compact: "Trial" }
  ],
  de: [
    { id: "all", label: "Alle Spieler", compact: "Alle Spieler" },
    { id: "roster", label: "Kaderspieler", compact: "Kader" },
    { id: "trial", label: "Probespieler", compact: "Probe" }
  ]
};

export const analyticsSortOptions: Record<"en" | "de", Array<{ id: AnalyticsSortKey; label: string }>> = {
  en: [
    { id: "name", label: "Name" },
    { id: "position", label: "Position" },
    { id: "status", label: "Status" },
    { id: "trainings", label: "Trainings" },
    { id: "rated", label: "Saved ratings" },
    { id: "ratingCoverage", label: "Rating coverage" },
    { id: "attendance", label: "Attendance (opportunities)" },
    { id: "average", label: "Average rating" },
    { id: "latestFive", label: "Latest 5" },
    { id: "trend", label: "Trend" },
    { id: "reliability", label: "Reliability" },
    { id: "lastTraining", label: "Last training" },
    { id: "evidence", label: "Evidence" },
    { id: "coachAssessment", label: "Coach assessment" }
  ],
  de: [
    { id: "name", label: "Name" },
    { id: "position", label: "Position" },
    { id: "status", label: "Status" },
    { id: "trainings", label: "Trainingseinheiten" },
    { id: "rated", label: "Gespeicherte Bewertungen" },
    { id: "ratingCoverage", label: "Bewertungsabdeckung" },
    { id: "attendance", label: "Anwesenheit (Teilnahmegelegenheiten)" },
    { id: "average", label: "Durchschnittsbewertung" },
    { id: "latestFive", label: "Letzte 5" },
    { id: "trend", label: "Trend" },
    { id: "reliability", label: "Zuverlässigkeit" },
    { id: "lastTraining", label: "Letztes Training" },
    { id: "evidence", label: "Datenbasis" },
    { id: "coachAssessment", label: "Trainereinschätzung" }
  ]
};

export const analyticsCopy = {
  en: {
    eyebrow: "Squad",
    title: "Analytics",
    description: "Compare player availability, performance ratings, reliability and manual coach assessments without mixing observations with automatic decisions.",
    helpTitle: "How analytics are calculated",
    filters: "Filters",
    players: "Players",
    position: "Position",
    allPositions: "All positions",
    period: "Period",
    training: "Training session",
    allTrainings: "All trainings in period",
    applyTraining: "Apply training",
    unnamedTraining: "Training",
    customFrom: "Custom period from date",
    customTo: "Custom period to date",
    datePlaceholder: "dd.mm.yyyy",
    apply: "Apply",
    showing: "Showing",
    all: "All",
    sortedBy: (label: string, direction: AnalyticsSortDirection) => `Sorted by ${label} ${direction === "asc" ? "ascending" : "descending"}`,
    resetFilters: "Reset filters",
    activeTeam: "Active team",
    attended: (count: number) => `${count} participated`,
    noDataTitle: "No analytics data for this view.",
    noDataDescription: "Adjust the filters or open your trainings.",
    createTraining: "Create training",
    noTrainingData: "No training data in this period",
    availableTrainings: (count: number) => `${count} training${count === 1 ? "" : "s"} available`,
    periods: {
      last5: "Last 5 trainings",
      last10: "Last 10 trainings",
      "30d": "Last 30 days",
      "90d": "Last 90 days",
      season: "This season",
      all: "All time",
      custom: "Custom range"
    },
    sections: {
      overview: "Overview",
      training: "Training",
      attendance: "Attendance",
      development: "Development",
      drills: "Drill Usage",
      players: "Players"
    },
    metrics: {
      players: "Players",
      trainings: "Trainings",
      attendanceWhenExpected: "Attendance when expected",
      ratingCoverage: "Rating coverage",
      averageRating: "Average performance rating"
    },
    headers: {
      player: "Player",
      position: "Position",
      status: "Status",
      trainings: "Trainings",
      attendance: "Participation",
      average: "Average",
      latestFive: "Latest 5",
      trend: "Trend",
      reliability: "Reliability",
      evidence: "Evidence",
      coachAssessment: "Coach assessment"
    },
    helpItems: [
      { title: "Average rating", text: "only final overall ratings intentionally entered by the coach. Unrated trainings are not counted as 3." },
      { title: "Trend", text: "latest five rated trainings compared with the five rated trainings before them, inside the selected period." },
      { title: "Attendance when expected", text: "Present, Late and Left early divided by expected trainings with a recorded actual outcome. Not expected trainings are excluded." },
      { title: "Rating coverage", text: "saved overall ratings for expected players who were Present or Late, divided by those eligible performances. Ratings are optional; coverage describes available evidence, not outstanding work." },
      { title: "Data coverage", text: "recorded actual attendance divided by all Player-training combinations in the selected view." },
      { title: "Planning and actual outcome", text: "Expected and Not expected describe planning. Participated and Absent describe what actually happened." },
      { title: "Reliability", text: "existing malus rules; late only counts when the penalty is active." },
      { title: "Evidence", text: "shows how many rated trainings support the performance view." },
      { title: "Coach assessment", text: "manual coach marker, separate from automatic summaries." },
      { title: "Drill usage", text: "scoped to the active team and selected historical training period." }
    ]
  },
  de: {
    eyebrow: "Kader",
    title: "Analysen",
    description: "Vergleiche Verfügbarkeit, Leistungsbewertungen, Zuverlässigkeit und manuelle Trainereinschätzungen, ohne Beobachtungen mit automatischen Hinweisen zu vermischen.",
    helpTitle: "So werden die Analysen berechnet",
    filters: "Filter",
    players: "Spieler",
    position: "Position",
    allPositions: "Alle Positionen",
    period: "Zeitraum",
    training: "Trainingseinheit",
    allTrainings: "Alle Trainings im Zeitraum",
    applyTraining: "Training anwenden",
    unnamedTraining: "Training",
    customFrom: "Zeitraum von Datum",
    customTo: "Zeitraum bis Datum",
    datePlaceholder: "TT.MM.JJJJ",
    apply: "Anwenden",
    showing: "Anzeige",
    all: "Alle Spieler",
    sortedBy: (label: string, direction: AnalyticsSortDirection) => `Nach ${label} ${direction === "asc" ? "aufsteigend" : "absteigend"} sortiert`,
    resetFilters: "Filter zurücksetzen",
    activeTeam: "Aktive Mannschaft",
    attended: (count: number) => `${count} teilgenommen`,
    noDataTitle: "Keine Analysedaten für diese Ansicht.",
    noDataDescription: "Passe die Filter an oder öffne deine Trainings.",
    createTraining: "Training erstellen",
    noTrainingData: "Keine Trainingsdaten in diesem Zeitraum",
    availableTrainings: (count: number) => `${count} Trainingseinheit${count === 1 ? "" : "en"} verfügbar`,
    periods: {
      last5: "Letzte 5 Trainingseinheiten",
      last10: "Letzte 10 Trainingseinheiten",
      "30d": "Letzte 30 Tage",
      "90d": "Letzte 90 Tage",
      season: "Diese Saison",
      all: "Gesamter Zeitraum",
      custom: "Benutzerdefinierter Zeitraum"
    },
    sections: {
      overview: "Übersicht",
      training: "Training",
      attendance: "Anwesenheit",
      development: "Entwicklung",
      drills: "Übungsnutzung",
      players: "Spieler"
    },
    metrics: {
      players: "Spieler",
      trainings: "Trainingseinheiten",
      attendanceWhenExpected: "Anwesenheit bei Einplanung",
      ratingCoverage: "Bewertungsabdeckung",
      averageRating: "Ø Leistungsbewertung"
    },
    headers: {
      player: "Spieler",
      position: "Position",
      status: "Status",
      trainings: "Trainingseinheiten",
      attendance: "Teilnahmequote",
      average: "Durchschnitt",
      latestFive: "Letzte 5",
      trend: "Trend",
      reliability: "Zuverlässigkeit",
      evidence: "Datenbasis",
      coachAssessment: "Trainereinschätzung"
    },
    helpItems: [
      { title: "Durchschnittsbewertung", text: "nur abschließende Gesamtbewertungen, die der Trainer bewusst eingetragen hat. Nicht bewertete Trainings zählen nicht als 3." },
      { title: "Trend", text: "die letzten fünf bewerteten Trainings im Vergleich zu den fünf bewerteten Trainings davor, innerhalb des gewählten Zeitraums." },
      { title: "Anwesenheit bei Einplanung", text: "Anwesend, Verspätet und Training abgebrochen geteilt durch eingeplante Trainings mit erfasstem tatsächlichem Ergebnis. Nicht eingeplante Trainings sind ausgeschlossen." },
      { title: "Bewertungsabdeckung", text: "Gespeicherte Gesamtbewertungen für eingeplante Spieler, die anwesend oder verspätet waren, geteilt durch diese bewertbaren Teilnahmen. Bewertungen sind optional; die Abdeckung beschreibt die Datenbasis, keine offenen Aufgaben." },
      { title: "Datenvollständigkeit", text: "erfasste tatsächliche Anwesenheiten geteilt durch alle Spieler-Training-Kombinationen der gewählten Ansicht." },
      { title: "Planung und tatsächliches Ergebnis", text: "Eingeplant und Nicht eingeplant beschreiben die Planung. Teilgenommen und Abwesend beschreiben das tatsächliche Ergebnis." },
      { title: "Zuverlässigkeit", text: "bestehende Malus-Regeln; Verspätung zählt nur, wenn der Abzug aktiv ist." },
      { title: "Datenbasis", text: "zeigt, wie viele bewertete Trainings die Leistungsansicht stützen." },
      { title: "Trainereinschätzung", text: "manuelle Einschätzung des Trainers, getrennt von automatischen Zusammenfassungen." },
      { title: "Übungsnutzung", text: "bezogen auf die aktive Mannschaft und den gewählten historischen Trainingszeitraum." }
    ]
  }
} as const;
