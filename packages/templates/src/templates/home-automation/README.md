# Home Automation Template

Smart home agent for IoT device control, routine scheduling, energy monitoring, and alert management.

## What It Does

- Controls smart devices: lights, thermostats, locks, speakers, cameras
- Creates and optimizes daily automation routines
- Monitors energy usage and suggests efficiency improvements
- Sends alerts for unusual activity, device failures, and threshold breaches
- Builds multi-device scenes (morning, away, movie night)
- Tracks maintenance schedules for filters, batteries, and updates
- Manages temporary guest access for visitors

## Quick Start

```bash
npm create cocapn
# Select "home-automation" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Smart home enthusiasts** managing multiple device ecosystems
- **Energy-conscious households** tracking and reducing consumption
- **Families** automating routines for kids' schedules
- **Remote workers** optimizing home office lighting and climate
- **Airbnb hosts** managing guest access and between-stay routines

## Configuration

Key settings in `config.yml`:
- `sync.interval`: Shorter (10s) for responsive device control
- `home.rooms`: Define room names and groupings
- `home.devices`: Register device inventory
- `home.energyThreshold`: Set usage alerts (kWh)
- `llm.temperature`: Low (0.2-0.4) for precise automation logic

## Security

Device control commands require explicit confirmation. Security devices (locks, cameras) have additional safeguards.
