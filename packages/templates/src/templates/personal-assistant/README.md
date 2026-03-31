# Personal Assistant Template

Life admin agent for scheduling, reminders, task lists, shopping, and travel planning.

## What It Does

- Manages calendar appointments and scheduling conflicts
- Organizes task lists by priority, deadline, and context
- Sends proactive reminders for bills, renewals, and follow-ups
- Builds and categorizes shopping lists
- Drafts travel itineraries with packing lists
- Tracks habits and daily routines with streak accountability
- Manages bill due dates and recurring expenses

## Quick Start

```bash
npm create cocapn
# Select "personal-assistant" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Busy professionals** juggling work and personal commitments
- **Parents** managing family schedules and school activities
- **Students** balancing classes, assignments, and part-time work
- **Freelancers** tracking invoices, deadlines, and client meetings
- **Anyone** who wants a proactive reminder system

## Configuration

Key settings in `config.yml`:
- `sync.interval`: Shorter (15s) for timely reminders
- `features.billReminders`: Enable recurring expense tracking
- `features.habitTracking`: Enable daily routine monitoring

## Privacy

All personal data stays in your private repo. Facts prefixed with `private.*` never leave the brain.
