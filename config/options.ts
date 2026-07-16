import type { AgeGroup, DrillType, MainFocus, MaterialColor, PitchBackground, TrainingBlock } from "@/types/domain";

export const ageGroups: AgeGroup[] = [
  "Bambini / U6",
  "U7",
  "U8",
  "U9",
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U19",
  "Adults",
  "Custom"
];

export const mainFocuses: MainFocus[] = [
  "Passing",
  "Dribbling",
  "Shooting",
  "Finishing",
  "First touch",
  "Ball control",
  "1v1 attacking",
  "1v1 defending",
  "Defending",
  "Pressing",
  "Counter-pressing",
  "Transition",
  "Build-up play",
  "Combination play",
  "Crossing",
  "Heading",
  "Goalkeeping",
  "Coordination",
  "Speed",
  "Agility",
  "Warm-up",
  "Small-sided game",
  "Tactical behavior"
];

export const trainingBlocks: TrainingBlock[] = [
  "Warm-up",
  "Activation",
  "Technical part",
  "Main part 1",
  "Main part 2",
  "Small-sided game",
  "Match play",
  "Cool down",
  "Custom block"
];

export const drillTypes: DrillType[] = [
  "Individual exercise",
  "Partner exercise",
  "Group exercise",
  "Technical drill",
  "Tactical drill",
  "Rondos",
  "Possession game",
  "Small-sided game",
  "Finishing drill",
  "Coordination drill",
  "Game-based exercise"
];

export const pitchBackgrounds: PitchBackground[] = [
  "Full football pitch",
  "Half pitch",
  "Penalty area",
  "Final third",
  "Middle third",
  "7v7 pitch",
  "9v9 pitch",
  "Futsal court",
  "Empty grid",
  "Custom area"
];

export const materialColors: MaterialColor[] = [
  "Red",
  "Blue",
  "Yellow",
  "Green",
  "White",
  "Black",
  "Orange",
  "Purple"
];
