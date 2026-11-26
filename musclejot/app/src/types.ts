export const APP_NAME = 'MuscleJot'

export const SAFETY_FOOTER =
  'A workout log, not medical advice. Stop if pain is sharp, sudden, or lingering.'

export const SAFETY_REMINDER = 'Informational only. Never push through pain.'

export const SAFETY_POINTS = [
  'MuscleJot is a workout log. It is not medical, injury, or diet advice.',
  'Talk with a doctor before you start or change a program.',
  'Lift with caution and good form. On a heavy bench or squat, or any set near failure, use a spotter.',
  'Pay attention to your body. A healthy burn and pain are not the same. Sharp, sudden, joint, or lingering pain means stop.',
  'Rest and recover. A workout does not need to be torture.',
]

export const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'traps',
] as const

export type Muscle = (typeof MUSCLES)[number]

export const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const

export type Equipment = (typeof EQUIPMENT)[number]

export type Unit = 'lb' | 'kg'

export const CHIMES = [
  { id: 'bell', label: 'Bell' },
  { id: 'soft', label: 'Soft' },
  { id: 'ding', label: 'Ding' },
  { id: 'glass', label: 'Glass' },
] as const

export type ChimeId = (typeof CHIMES)[number]['id']

export const REST_PRESETS = [60, 90, 120, 180] as const

export type Exercise = {
  id: string
  name: string
  equipment: Equipment
  primary: Muscle
  secondary: Muscle[]
  custom: boolean
  archived: boolean
  createdAt: number
}

export type Workout = {
  id: string
  name: string
  startedAt: number
  finishedAt: number | null
  routineId: string | null
  plannedExerciseIds: string[]
  restEndsAt: number | null
  setStartedAt: number | null
  pendingSetSec: number | null
  pausedAt: number | null
  pausedMs: number
  updatedAt: number
}

export type LiftSet = {
  id: string
  workoutId: string
  exerciseId: string
  weight: number
  unit: Unit
  reps: number
  createdAt: number
  order: number
  durationSec: number | null
}

export type Routine = {
  id: string
  name: string
  exerciseIds: string[]
  createdAt: number
  updatedAt: number
}

export type SetupNote = {
  exerciseId: string
  text: string
  updatedAt: number
}

export type Settings = {
  unit: Unit
  plateStepLb: number
  dumbbellStepLb: number
  plateStepKg: number
  dumbbellStepKg: number
  restSeconds: number
  restAutoStart: boolean
  chime: ChimeId
  muted: boolean
  vibrate: boolean
  setMilestoneChime: boolean
  stallSessions: number
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'lb',
  plateStepLb: 5,
  dumbbellStepLb: 5,
  plateStepKg: 2.5,
  dumbbellStepKg: 2.5,
  restSeconds: 90,
  restAutoStart: true,
  chime: 'bell',
  muted: false,
  vibrate: true,
  setMilestoneChime: false,
  stallSessions: 4,
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  forearms: 'Forearms',
  traps: 'Traps',
}

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  other: 'Other',
}

export function muscleLabel(id: string): string {
  return MUSCLE_LABEL[id as Muscle] ?? id
}

export function equipmentLabel(id: string): string {
  return EQUIPMENT_LABEL[id as Equipment] ?? id
}
