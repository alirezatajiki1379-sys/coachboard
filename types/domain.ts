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
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};
