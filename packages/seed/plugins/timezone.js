/**
 * Timezone plugin — /tz <from> <to>
 * Converts current time between timezones.
 * Hook: before-chat, detects timezone references.
 */

export default {
  name: 'timezone',
  version: '1.0.0',
  hooks: {
    command: {
      async tz(args) {
        const parts = args.trim().split(/\s+to\s+|\s+->\s*|\s+/i);
        if (parts.length < 2) return 'Usage: /tz <city> <city>  (e.g. /tz Seattle Tokyo)';
        const [from, to] = parts;
        try {
          const fromTime = cityTime(from);
          const toTime = cityTime(to);
          if (!fromTime || !toTime) return `Could not resolve timezone for ${!fromTime ? from : to}`;
          return `${from}: ${fromTime}  →  ${to}: ${toTime}`;
        } catch {
          return 'Could not convert timezone';
        }
      },
    },
    async 'before-chat'(message, context) {
      if (/\b(time|timezone|what time)\b/i.test(message)) {
        const cities = message.match(/\b(Seattle|Tokyo|London|Berlin|Sydney|NYC|Paris|Chicago|Denver|LA)\b/gi);
        if (cities && cities.length >= 2) {
          const fromTime = cityTime(cities[0]);
          const toTime = cityTime(cities[1]);
          if (fromTime && toTime) context._tzHint = `${cities[0]}: ${fromTime} → ${cities[1]}: ${toTime}`;
        }
      }
      return context;
    },
  },
};

const ZONES = {
  seattle: 'America/Los_Angeles', tokyo: 'Asia/Tokyo', london: 'Europe/London',
  berlin: 'Europe/Berlin', sydney: 'Australia/Sydney', nyc: 'America/New_York',
  paris: 'Europe/Paris', chicago: 'America/Chicago', denver: 'America/Denver',
  la: 'America/Los_Angeles',
};

function cityTime(city) {
  const tz = ZONES[city.toLowerCase()];
  if (!tz) return null;
  return new Date().toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true });
}
