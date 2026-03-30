/**
 * `cocapn telemetry` — manage privacy-first telemetry.
 *
 * Usage:
 *   cocapn telemetry status   — show if enabled
 *   cocapn telemetry on       — enable telemetry
 *   cocapn telemetry off      — disable telemetry
 */

import { Command } from "commander";

export function createTelemetryCommand(): Command {
  const cmd = new Command("telemetry").description(
    "Manage anonymous usage telemetry (privacy-first, off by default)"
  );

  cmd
    .command("status")
    .description("Show telemetry status")
    .action(() => {
      const { Telemetry } = awaitImportTelemetry();
      if (!Telemetry) {
        console.log("Telemetry: status unavailable (local-bridge not installed)");
        return;
      }
      const telemetry = new Telemetry();
      if (telemetry.isEnabled()) {
        console.log("Telemetry: enabled");
        console.log(`  Queue: ${telemetry.getQueueLength()} events pending`);
      } else {
        const reason = process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true"
          ? "DO_NOT_TRACK is set"
          : "not enabled";
        console.log(`Telemetry: disabled (${reason})`);
      }
      console.log("");
      console.log("Telemetry is anonymous and contains no personal data.");
    });

  cmd
    .command("on")
    .description("Enable telemetry")
    .action(() => {
      if (process.env.DO_NOT_TRACK === "1" || process.env.DO_NOT_TRACK === "true") {
        console.log("Cannot enable: DO_NOT_TRACK is set in environment.");
        process.exit(1);
        return;
      }
      const { Telemetry } = awaitImportTelemetry();
      if (!Telemetry) {
        console.log("Cannot enable: local-bridge package not installed locally.");
        process.exit(1);
        return;
      }
      const telemetry = new Telemetry();
      telemetry.enable();
      console.log("Telemetry enabled. Thank you for helping improve cocapn!");
      console.log("To disable: cocapn telemetry off");
    });

  cmd
    .command("off")
    .description("Disable telemetry and flush pending events")
    .action(async () => {
      const { Telemetry } = awaitImportTelemetry();
      if (!Telemetry) {
        console.log("Telemetry is not available (local-bridge not installed).");
        return;
      }
      const telemetry = new Telemetry();
      if (!telemetry.isEnabled()) {
        console.log("Telemetry is already disabled.");
        return;
      }
      await telemetry.disable();
      console.log("Telemetry disabled. No further data will be collected.");
    });

  return cmd;
}

/**
 * Dynamic import helper — telemetry lives in local-bridge which may not be available
 * when running from the top-level CLI package.
 */
function awaitImportTelemetry(): { Telemetry: any } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@cocapn/local-bridge/dist/telemetry/index.js");
    return { Telemetry: mod.Telemetry };
  } catch {
    return { Telemetry: undefined };
  }
}
