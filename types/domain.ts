export type AgeGroup =
  | "Bambini / U6"
  | "U7"
  | "U8"
  | "U9"
  | "U10"
  | "U11"
  | "U12"
  | "U13"
  | "U14"
  | "U15"
  | "U16"
  | "U17"
  | "U19"
  | "Adults"
  | "Custom";

export type MainFocus =
  | "Passing"
  | "Dribbling"
  | "Shooting"
  | "Finishing"
  | "First touch"
  | "Ball control"
  | "1v1 attacking"
  | "1v1 defending"
  | "Defending"
  | "Pressing"
  | "Counter-pressing"
  | "Transition"
  | "Build-up play"
  | "Combination play"
  | "Crossing"
  | "Heading"
  | "Goalkeeping"
  | "Coordination"
  | "Speed"
  | "Agility"
  | "Warm-up"
  | "Small-sided game"
  | "Tactical behavior";

export type TrainingBlock =
  | "Warm-up"
  | "Activation"
  | "Technical part"
  | "Main part 1"
  | "Main part 2"
  | "Small-sided game"
  | "Match play"
  | "Cool down"
  | "Custom block";

export type DrillType =
  | "Individual exercise"
  | "Partner exercise"
  | "Group exercise"
  | "Technical drill"
  | "Tactical drill"
  | "Rondos"
  | "Possession game"
  | "Small-sided game"
  | "Finishing drill"
  | "Coordination drill"
  | "Game-based exercise";

export type PitchBackground =
  | "Full football pitch"
  | "Half pitch"
  | "Penalty area"
  | "Final third"
  | "Middle third"
  | "7v7 pitch"
  | "9v9 pitch"
  | "Futsal court"
  | "Empty grid"
  | "Custom area";

export type MaterialColor =
  | "Red"
  | "Blue"
  | "Yellow"
  | "Green"
  | "White"
  | "Black"
  | "Orange"
  | "Purple";

export type MaterialType =
  | "balls"
  | "cones"
  | "flat_markers"
  | "bibs"
  | "rings"
  | "goals"
  | "mini_goals"
  | "poles"
  | "mannequins"
  | "other";

export type MaterialItem = {
  type: MaterialType;
  color?: MaterialColor;
  label?: string;
  variant?: string;
  source?: "graphic" | "manual";
  quantity: number;
};

export type Drill = {
  id: string;
  userId: string;
  title: string;
  shortDescription?: string;
  organization?: string;
  coachingPoints?: string;
  variations?: string;
  easierVersion?: string;
  harderVersion?: string;
  ageGroups: AgeGroup[];
  mainFocus: MainFocus;
  subFocus?: string;
  trainingBlocks: TrainingBlock[];
  drillType: DrillType;
  durationMinutes: number;
  minPlayers: number;
  maxPlayers: number;
  materials: MaterialItem[];
  pitchArea?: string;
  difficultyLevel: 1 | 2 | 3 | 4 | 5;
  intensityLevel: 1 | 2 | 3 | 4 | 5;
  isFavorite: boolean;
  tags: string[];
  previewImageUrl?: string;
  archivedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type TrainingSessionDrill = {
  id: string;
  drillId: string;
  block: TrainingBlock;
  orderIndex: number;
  plannedDurationMinutes: number;
  coachNotes?: string;
  timingMode: "sequential" | "simultaneous";
  simultaneousGroup?: string;
  participatingGroups?: string[];
  startingGroup?: string;
};

export type SessionPlayerGroup = {
  id: string;
  name: string;
  notes?: string;
};

export type TrainingSession = {
  id: string;
  userId: string;
  title: string;
  date?: string;
  startTime?: string;
  teamAgeGroup?: AgeGroup;
  mainFocus?: MainFocus;
  secondaryFocus?: string;
  expectedPlayers?: number;
  durationTargetMinutes?: number;
  location?: string;
  notes?: string;
  playerGroups: SessionPlayerGroup[];
  drills: TrainingSessionDrill[];
  archivedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SquadPlayer = {
  id: string;
  userId: string;
  playerType: "roster" | "trial";
  firstName: string;
  lastName?: string;
  dateOfBirth?: string;
  position?: string;
  strongFoot?: string;
  club?: string;
  parentPhone?: string;
  playerPhone?: string;
  parentEmail?: string;
  hobbies?: string;
  developmentGoal?: string;
  workOn?: string;
  notes?: string;
  convertedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SquadTrainingEventStatus = "draft" | "prepared" | "in_progress" | "rating_open" | "completed";
export type SquadPlannedAttendanceStatus = "expected" | "unavailable" | "unclear";
export type SquadAttendanceReason = "V" | "K" | "E" | "P" | "S" | "Z" | "U";
export type SquadFinalAttendanceStatus = "present" | "absent" | "Z" | "V" | "K" | "E" | "P" | "S" | "U";

export type SquadTrialPlayer = {
  id: string;
  userId: string;
  displayName: string;
  contact?: string;
  notes?: string;
  convertedPlayerId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SquadAttendanceEntry = {
  id: string;
  userId: string;
  eventId: string;
  playerId: string;
  plannedStatus?: SquadPlannedAttendanceStatus;
  plannedReason?: SquadAttendanceReason;
  plannedReasonNote?: string;
  finalStatus?: SquadFinalAttendanceStatus;
  lateMinutes?: number;
  latePenaltyApplied: boolean;
  overallRating?: number;
  ratingTechnique?: number;
  ratingGameUnderstanding?: number;
  ratingIntensity?: number;
  ratingBehavior?: number;
  ratingAutoSuggestion?: number;
  coachNote?: string;
  sensitiveNote: boolean;
  player?: SquadPlayer;
  createdAt: string;
  updatedAt: string;
};

export type SquadTrainingEvent = {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime?: string;
  label?: string;
  location?: string;
  focus?: string;
  seasonLabel?: string;
  linkedTrainingSessionId?: string;
  linkedTrainingSessionTitle?: string;
  linkedTrainingSessionDuration?: number;
  status: SquadTrainingEventStatus;
  generalNotes?: string;
  completedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SquadTrainingEventDetail = SquadTrainingEvent & {
  attendance: SquadAttendanceEntry[];
};

export type PlayerCoachAssessmentValue =
  | "decision_open"
  | "continue_observing"
  | "positive_development"
  | "prospect_player"
  | "squad_candidate"
  | "below_required_level";

export type PlayerCoachAssessment = {
  id: string;
  userId: string;
  playerId: string;
  assessment: PlayerCoachAssessmentValue;
  reason?: string;
  assessmentDate: string;
  reviewDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerDevelopmentGoalCategory =
  | "technique"
  | "tactical_understanding"
  | "decision_making"
  | "physical"
  | "mental"
  | "communication"
  | "leadership"
  | "goalkeeping"
  | "behaviour"
  | "individual";

export type PlayerDevelopmentGoalPriority = "low" | "medium" | "high";
export type PlayerDevelopmentGoalStatus = "active" | "completed" | "paused" | "cancelled";
export type PlayerDevelopmentProgress = "not_started" | "in_progress" | "almost_there" | "completed";

export type PlayerDevelopmentGoal = {
  id: string;
  userId: string;
  playerId: string;
  title: string;
  description?: string;
  category: PlayerDevelopmentGoalCategory;
  priority: PlayerDevelopmentGoalPriority;
  status: PlayerDevelopmentGoalStatus;
  progress: PlayerDevelopmentProgress;
  startDate: string;
  targetDate?: string;
  reviewDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  actions: PlayerGoalAction[];
  observations: PlayerObservation[];
};

export type PlayerGoalAction = {
  id: string;
  userId: string;
  goalId: string;
  description: string;
  completed: boolean;
  dueDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type PlayerObservation = {
  id: string;
  userId: string;
  playerId: string;
  goalId?: string;
  eventId?: string;
  observationDate: string;
  category?: PlayerDevelopmentGoalCategory;
  note: string;
  createdAt: string;
  updatedAt: string;
};
