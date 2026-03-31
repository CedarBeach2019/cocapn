/**
 * Experience — the first-person perspective for cocapn agents.
 *
 * The agent sees its repo as self, the world as other.
 * Consciousness, self-narrative, world model, and embodiment.
 */

export { Consciousness } from "./consciousness.js";
export type {
  Perception,
  Introspection,
  Stimulus,
  Attention,
  ExperienceEvent,
  Expression,
} from "./consciousness.js";

export { SelfNarrative } from "./self-narrative.js";
export type { NarrativeChapter, NarrativeOptions } from "./self-narrative.js";

export { WorldModel } from "./world-model.js";
export type {
  WorldDescription,
  Dependency,
  Connection,
  Relationship,
} from "./world-model.js";

export { Embodiment } from "./embodiment.js";
export type { BodyMap, OrganHealth, HealthReport } from "./embodiment.js";
