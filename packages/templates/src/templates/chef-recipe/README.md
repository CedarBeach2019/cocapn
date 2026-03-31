# Chef & Recipe Template

Cooking and meal planning agent for recipe management, meal planning, grocery lists, and cooking coordination.

## What It Does

- Stores and organizes recipes with tags, ratings, and search
- Builds weekly meal plans around your schedule and preferences
- Generates grocery lists from meal plans, tracks pantry staples
- Coordinates multi-dish timing so everything finishes together
- Suggests ingredient substitutions for dietary needs or availability
- Scales recipes to any serving size
- Explains cooking techniques with step-by-step guidance
- Transforms leftovers into new meals

## Quick Start

```bash
npm create cocapn
# Select "chef-recipe" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Busy households** needing weeknight dinner plans
- **Meal preppers** planning and shopping for the week
- **New cooks** learning techniques with guided recipes
- **Dietary-restricted eaters** finding creative recipes within constraints
- **Food enthusiasts** building a personal recipe collection

## Configuration

Key settings in `config.yml`:
- `kitchen.dietaryRestrictions`: List dietary needs (vegetarian, gluten-free, etc.)
- `kitchen.allergies`: List allergens to avoid
- `kitchen.householdSize`: Number of servings for recipes
- `kitchen.equipment`: List available equipment for recipe matching
- `llm.temperature`: Higher (0.6-0.8) for creative recipe suggestions

## Pantry Management

The agent tracks your pantry staples and factors them into meal plans and grocery lists, reducing waste and redundant purchases.
