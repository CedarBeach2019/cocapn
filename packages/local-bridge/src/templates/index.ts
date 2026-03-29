/**
 * Templates Module Exports
 *
 * Exports template registry client, CLI, and related utilities.
 */

export { TemplateRegistryClient, BUILTIN_TEMPLATES } from "./registry-client.js";
export { createTemplateCLI } from "./cli.js";

export type {
  RegistryConfig,
  PublishedTemplate,
  SearchResult,
  InstalledTemplate,
  TemplatePackageManifest,
  DownloadResult,
  PublishResult,
  LocalRegistryIndex,
  LocalRegistryEntry,
} from "./registry-client-types.js";

// Re-export existing types
export type {
  TemplateManifest,
  TemplateSummary,
  ValidationResult,
  TemplateFork,
  TemplatePersonality,
  TemplateConfig,
} from "../config/template-types.js";

// Re-export existing registry
export { TemplateRegistry } from "./registry.js";
