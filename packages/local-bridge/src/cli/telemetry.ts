/**
 * `cocapn telemetry` CLI — manage privacy-first telemetry.
 *
 * Usage:
 *   cocapn-bridge telemetry status   — show if enabled
 *   cocapn-bridge telemetry on       — enable telemetry
 *   cocapn-bridge telemetry off      — disable telemetry
 */

import { Command } from "commander";
import { Telemetry } from "../telemetry/index.js";

export function buildTelemetryCommand(): Command {
  const cmd = new Command("telemetry").description(
    "Manage anonymous usage telemetry (privacy-first, off by default)"
  );

  cmd
    .command("status")
    .description("Show telemetry status")
    .action(() => {
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
      console.log("Learn more: https://cocapn.dev/docs/telemetry");
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
      const telemetry = new Telemetry();
      telemetry.enable();
      console.log("Telemetry enabled. Thank you for helping improve cocapn!");
      console.log("To disable: cocapn telemetry off");
    });

  cmd
    .command("off")
    .description("Disable telemetry and flush pending events")
    .action(async () => {
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
