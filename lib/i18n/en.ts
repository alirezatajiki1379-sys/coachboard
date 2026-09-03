import enMessages from "@/messages/en.json";

export const en = {
  ...enMessages,
  appName: enMessages.app.name,
  nav: {
    dashboard: enMessages.navigation.dashboard,
    trainings: enMessages.navigation.trainings,
    trainingPlans: enMessages.navigation.trainingPlans,
    drills: enMessages.navigation.drills,
    squad: enMessages.navigation.squad,
    sessions: enMessages.navigation.trainingPlans,
    settings: enMessages.navigation.settings
  },
  actions: {
    createDrill: enMessages.dashboard.actions.createDrill,
    createSession: "Create new training plan",
    openLibrary: enMessages.dashboard.actions.openLibrary
  }
} as const;
