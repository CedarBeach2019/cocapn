# Wiki

This is your agent's internal knowledge base. Add Markdown files here
to give your agent long-form knowledge about projects, domains, or
anything you want it to remember.

## How It Works

- Each `.md` file becomes a searchable wiki page
- The agent reads wiki pages when building context
- Changes are tracked in Git — full history

## Getting Started

Create new files for different topics:

```
wiki/
  projects.md      — Active projects and their status
  architecture.md  — System design decisions
  preferences.md   — How you like things done
  glossary.md      — Domain-specific terms
```
