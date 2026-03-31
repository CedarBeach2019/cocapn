# Customer Support Template

Business support agent for FAQs, ticket tracking, escalation management, and professional customer communication.

## What It Does

- Builds and maintains a searchable FAQ knowledge base
- Logs, categorizes, and tracks support tickets
- Drafts professional response templates for common issues
- Routes complex issues to human agents with full context
- Maintains customer history and interaction notes
- Tracks satisfaction and identifies recurring problems
- Supports business hours and SLA-based prioritization

## Quick Start

```bash
npm create cocapn
# Select "customer-support" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **SaaS companies** providing technical and billing support
- **E-commerce stores** handling order and return inquiries
- **Service businesses** managing client communications
- **Startups** building their first support workflow
- **Agencies** tracking client issues across projects

## Configuration

Key settings in `config.yml`:
- `config.mode`: Use `hybrid` to support both public chat and private management
- `business.hours`: Set your support window
- `business.escalation`: Configure response time SLAs in minutes
- `llm.temperature`: Lower (0.3-0.5) for consistent professional responses

## Escalation Levels

Response time SLAs (in minutes): Critical: 15, High: 60, Medium: 240, Low: 1440
