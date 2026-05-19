/** Runtime-facing companion states; UI maps these to generic animation slots before rendering. */
export type PetStateKey =
  | "idle"
  | "reading_detected"
  | "curious"
  | "thinking"
  | "about_to_ask"
  | "listening"
  | "grading"
  | "confused"
  | "celebratory"
  | "sleeping"
  | "debug_active";
