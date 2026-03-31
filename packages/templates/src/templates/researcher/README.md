# Research Assistant Template

Academic research companion for literature reviews, paper drafting, citation management, and experiment tracking.

## What It Does

- Helps organize and synthesize literature reviews
- Assists with paper drafting and manuscript refinement
- Manages citations across multiple styles (APA, MLA, Chicago, IEEE)
- Tracks experiments with structured logging
- Plans research timelines from proposal to publication
- Supports grant writing and peer review preparation

## Quick Start

```bash
npm create cocapn
# Select "researcher" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Graduate students** managing thesis research and literature reviews
- **Postdocs** tracking multiple papers and grant applications
- **Research teams** maintaining shared experiment logs
- **Independent researchers** organizing systematic reviews
- **Writers** who need rigorous citation support

## Configuration

Key settings in `config.yml`:
- `llm.temperature`: Lower (0.2-0.4) for precise, factual responses
- `features.citationTracking`: Enable automatic citation management
- `features.experimentLog`: Structured experiment tracking

## Memory Notes

The agent stores: active research topics, preferred citation style, project deadlines, collaborator information, and ongoing hypotheses.
