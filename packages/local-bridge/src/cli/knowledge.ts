/**
 * `cocapn knowledge` sub-commands.
 *
 * Usage (via cocapn-bridge binary):
 *   cocapn-bridge knowledge export <file> [--repo <path>] [--min-confidence <n>] [--tags <tags>]
 *   cocapn-bridge knowledge import <file> [--repo <path>] [--merge <strategy>] [--tag-prefix <prefix>]
 *   cocapn-bridge knowledge preview <file> [--repo <path>]
 */

import { Command } from "commander";
import { resolve } from "path";
import { Brain } from "../brain/index.js";
import { loadConfig } from "../config/loader.js";
import { GitSync } from "../git/sync.js";
import { KnowledgePackExporter, KnowledgePackImporter } from "../brain/knowledge-pack.js";
import type { BridgeConfig } from "./../config/types.js";

export function buildKnowledgeCommand(): Command {
  const cmd = new Command("knowledge").description("Export and import knowledge packs");

  // ── export ────────────────────────────────────────────────────────────────

  cmd
    .command("export <file>")
    .description("Export memories as a knowledge pack JSON file")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--min-confidence <n>", "Minimum confidence threshold (0-1)", parseFloat, 0.5)
    .option("--tags <tags>", "Comma-separated list of tags to filter")
    .option("--types <types>", "Comma-separated list of types to filter")
    .option("--no-auto", "Exclude auto-generated memories")
    .action(async (file: string, opts: {
      repo: string;
      minConfidence: number;
      tags?: string;
      types?: string;
      auto?: boolean;
    }) => {
      const { brain } = makeBrainWithDeps(opts.repo);

      try {
        const exporter = new KnowledgePackExporter(brain, brain.memoryManager || undefined);

        const exportOpts = {
          minConfidence: opts.minConfidence,
          tags: opts.tags ? opts.tags.split(",").map(t => t.trim()) : undefined,
          types: opts.types ? opts.types.split(",").map(t => t.trim()) : undefined,
          includeAuto: opts.auto !== false,
        };

        await exporter.exportToFile(resolve(file), exportOpts);
        console.log(`✓ Exported knowledge pack to: ${file}`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── import ────────────────────────────────────────────────────────────────

  cmd
    .command("import <file>")
    .description("Import a knowledge pack JSON file")
    .option("--repo <path>", "Private repo root", process.cwd())
    .option("--merge <strategy>", "Merge strategy: skip, overwrite, merge", "skip")
    .option("--tag-prefix <prefix>", "Add prefix to all imported memory tags")
    .action(async (file: string, opts: {
      repo: string;
      merge: 'skip' | 'overwrite' | 'merge';
      tagPrefix?: string;
    }) => {
      const { brain } = makeBrainWithDeps(opts.repo);

      try {
        const importer = new KnowledgePackImporter(brain, brain.memoryManager || undefined);
        const result = await importer.importFromFile(resolve(file), {
          deduplicate: true,
          mergeStrategy: opts.merge,
          tagPrefix: opts.tagPrefix,
        });

        console.log(`✓ Imported knowledge pack from: ${file}`);
        console.log(`  Imported: ${result.imported}`);
        console.log(`  Skipped: ${result.skipped}`);
        console.log(`  Errors: ${result.errors}`);

        if (result.conflicts.length > 0) {
          console.log(`  Conflicts: ${result.conflicts.join(", ")}`);
        }
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── preview ───────────────────────────────────────────────────────────────

  cmd
    .command("preview <file>")
    .description("Preview what would be imported from a knowledge pack")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (file: string, opts: { repo: string }) => {
      const { brain } = makeBrainWithDeps(opts.repo);

      try {
        const importer = new KnowledgePackImporter(brain, brain.memoryManager || undefined);
        const preview = await importer.previewFromFile(resolve(file));

        console.log(`Knowledge pack preview: ${file}`);
        console.log(`  Total memories: ${preview.memories}`);
        console.log(`  Conflicts: ${preview.conflicts}`);

        if (preview.conflictKeys.length > 0) {
          console.log(`  Conflict keys: ${preview.conflictKeys.join(", ")}`);
        }
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

// ---------------------------------------------------------------------------
// Entry point for standalone `cocapn-knowledge` binary
// ---------------------------------------------------------------------------

export function runKnowledgeCli(): void {
  const program = new Command();
  program
    .name("cocapn-knowledge")
    .description("Cocapn knowledge pack management")
    .version("0.1.0");

  // Re-register sub-commands at root level for the standalone binary
  const knowledge = buildKnowledgeCommand();
  for (const sub of knowledge.commands) {
    program.addCommand(sub.copyInheritedSettings(program));
  }

  program.parse();
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeBrainWithDeps(repoPath: string): {
  brain: Brain;
  config: BridgeConfig;
  sync: GitSync;
} {
  const repoRoot = resolve(repoPath);
  const config = loadConfig(repoRoot);
  // For CLI usage, auto-push is disabled — we only commit locally
  const sync = new GitSync(repoRoot, {
    ...config,
    sync: { ...config.sync, autoPush: false },
  });
  const brain = new Brain(repoRoot, config, sync);
  return { brain, config, sync };
}
