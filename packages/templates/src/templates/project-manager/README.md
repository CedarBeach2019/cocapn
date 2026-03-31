# Project Manager Template

Software project agent for sprint planning, burndown tracking, standups, retrospectives, and dependency management.

## What It Does

- Breaks down work into sprint-sized units with estimation support
- Tracks burndown progress against sprint goals
- Captures standup notes: what's done, what's planned, what's blocked
- Facilitates retrospectives on what worked and what to improve
- Maps cross-team and cross-task dependencies
- Surfaces and escalates blockers quickly
- Plans releases with milestone coordination
- Tracks team velocity and predicts capacity

## Quick Start

```bash
npm create cocapn
# Select "project-manager" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Startup teams** needing lightweight project tracking
- **Open source projects** managing contributor work
- **Solo developers** structuring their own sprints
- **Agile teams** supplementing their existing tooling
- **Consultants** tracking multiple client projects

## Configuration

Key settings in `config.yml`:
- `project.methodology`: `scrum`, `kanban`, or `scrumban`
- `project.sprintLength`: Sprint duration in days
- `project.teamSize`: Number for velocity calculations
- `project.toolsIntegration`: Connect to GitHub, Linear, etc.
- `capabilities.fleet`: Enable for multi-agent coordination

## Methodology Support

Works with Scrum (sprints, ceremonies), Kanban (continuous flow), or Scrumban (hybrid). Configure once, adapt as needed.
