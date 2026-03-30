import { AnalyticsCollector } from "./src/analytics/collector.js";
import { MetricsCalculator } from "./src/analytics/metrics.js";

const collector = new AnalyticsCollector();
const metrics = new MetricsCalculator(collector);

// Add 5 chat events with latencies
const latencies = [100, 200, 300, 400, 500];
for (const latency of latencies) {
  collector.trackChat({
    messageLength: 100,
    responseLength: 200,
    model: "claude-3-5-sonnet-20241022",
    success: true,
    latency,
  });
}

// Check events
const allEvents = collector.getEvents();
console.log("Total events:", allEvents.length);
const chatEvents = collector.getEventsByType("chat");
console.log("Chat events:", chatEvents.length);

// Check latencies extracted
const period = { start: Date.now() - 10000, end: Date.now() + 1000 };
const events = collector.getEventsInPeriod(period);
console.log("Events in period:", events.length);

const extractedLatencies: number[] = [];
for (const event of events) {
  const latency = event.data.latency as number | undefined;
  if (latency !== undefined) {
    extractedLatencies.push(latency);
  }
}
console.log("Extracted latencies:", extractedLatencies);

// Calculate percentiles
const p50 = metrics.latencyPercentile(50);
const p95 = metrics.latencyPercentile(95);
const p99 = metrics.latencyPercentile(99);

console.log("p50:", p50);
console.log("p95:", p95);
console.log("p99:", p99);

collector.close();
