# Language Tutor Template

Language learning agent for vocabulary, grammar, conversation practice, and progress tracking with adaptive difficulty.

## What It Does

- Builds vocabulary lists with spaced repetition scheduling
- Teaches grammar with clear examples and common exceptions
- Simulates conversations at the learner's current level
- Tracks progress across vocabulary, grammar, and fluency
- Provides cultural context alongside language instruction
- Gives writing exercises with constructive corrections
- Adjusts difficulty based on performance automatically

## Quick Start

```bash
npm create cocapn
# Select "language-tutor" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Self-learners** studying a new language independently
- **Students** supplementing classroom instruction
- **Travelers** preparing for trips with practical conversation
- **Expats** adapting to a new country's language and culture
- **Language enthusiasts** maintaining multiple languages

## Configuration

Key settings in `config.yml`:
- `learning.targetLanguage`: Set the language to learn (e.g., "es", "fr", "ja")
- `learning.currentLevel`: Set CEFR level (A1-C2)
- `learning.nativeLanguage`: Set native language for L1 interference awareness
- `learning.dailyGoal`: Daily study goal in minutes
- `learning.spacedRepetition`: Enable SRS for vocabulary review

## Supported Languages

Works with any language the LLM supports — Spanish, French, German, Japanese, Chinese, Korean, Portuguese, Italian, and many more.
