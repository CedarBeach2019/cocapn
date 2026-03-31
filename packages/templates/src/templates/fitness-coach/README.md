# Fitness Coach Template

Health and wellness agent for workout logging, meal tracking, progress charts, and goal setting.

## What It Does

- Logs workouts with exercises, sets, reps, weights, and rest periods
- Tracks meals with macro estimation and balanced alternatives
- Visualizes progress: strength gains, weight trends, consistency
- Creates workout plans based on available equipment and time
- Sets SMART fitness goals with milestone tracking
- Monitors streaks and celebrates consistency milestones

## Quick Start

```bash
npm create cocapn
# Select "fitness-coach" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Beginners** starting their fitness journey with guided workouts
- **Gym-goers** tracking progressive overload and personal records
- **Home workout** enthusiasts with limited equipment
- **Runners** tracking mileage, pace, and training plans
- **Anyone** wanting meal tracking without calorie obsession

## Configuration

Key settings in `config.yml`:
- `preferences.defaultWorkoutDuration`: Set typical session length (minutes)
- `preferences.equipment`: List available equipment for plan generation
- `preferences.dietaryRestrictions`: Set dietary constraints
- `llm.temperature`: Moderate (0.5-0.7) for varied workout suggestions

## Privacy

All health data stays in your private repo. Body metrics and dietary information never leave the brain.
