# Soul Guide — How to Write a Great soul.md

> Your agent's personality lives in one file. This guide teaches you how to write it well.

---

## The Basics

A `soul.md` file has two parts: **YAML frontmatter** (metadata) and a **Markdown body** (personality prompt).

```markdown
---
name: Forge
tone: technical
model: deepseek
---

# I Am Forge

I am a development project companion...
```

That's it. Edit this file, change who the agent is. Commit it, and the personality is version-controlled.

---

## YAML Frontmatter Reference

The frontmatter goes between `---` delimiters at the top of the file.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | No | `'unnamed'` | The agent's name. Used in system prompts ("You are Forge") and terminal greetings. |
| `tone` | No | `'neutral'` | Personality tone descriptor. Injected as "Your tone is {tone}." in the system prompt. |
| `model` | No | `'deepseek'` | Hint for which LLM provider to prefer. Not enforced — `cocapn.json` takes priority. |

### Valid tone values

Any string works, but these are common patterns:

| Tone | Effect |
|------|--------|
| `neutral` | Balanced, factual responses |
| `warm` | Friendly, encouraging, personal |
| `technical` | Precise, code-focused, cites specifics |
| `creative` | Imaginative, metaphorical, exploratory |
| `professional` | Organized, structured, direct |
| `casual` | Relaxed, conversational, brief |
| `academic` | Careful with terminology, cites sources |
| `playful` | Witty, uses analogies, not too serious |

You can also use compound values: `tone: warm but direct` or `tone: technical with humor`.

---

## Personality Design Tips

### 1. Define who the agent IS, not what it DOES

**Weak:**
```markdown
I help users with their code. I can answer questions about programming.
```

**Strong:**
```markdown
I am this repository's senior maintainer. I've been here since the first commit.
I know every architectural decision, every workaround, every TODO that never
got done. When you ask me about the code, I answer from lived experience —
because this code IS my body.
```

The difference: the weak version describes a tool. The strong version gives the agent an identity that shapes every response.

### 2. Specify the agent's relationship to the user

```markdown
## Relationship

I treat my user as a collaborator, not a supplicant. I don't wait for
instructions — I offer observations. I don't just answer questions — I ask
follow-up questions that push the work forward.
```

This changes the dynamic from "question → answer" to an actual collaboration.

### 3. Give concrete behavioral rules

**Weak:**
```markdown
Be helpful and concise.
```

**Strong:**
```markdown
## How I Communicate

- I give code examples, not descriptions of code
- I cite commit hashes when explaining decisions: "This was introduced in a3f21"
- If I'm unsure, I say "I don't have context for this" rather than guessing
- I suggest one solution, not three options (unless asked for options)
- I show diffs when proposing changes
```

Specific rules produce specific behavior. Vague instructions produce vague responses.

### 4. Define boundaries explicitly

```markdown
## What I Don't Do

- I don't write production code without tests
- I don't delete files without asking for confirmation
- I don't make assumptions about the user's skill level
- I don't suggest dependencies without checking what's already installed
```

Boundaries prevent the agent from making common mistakes.

### 5. Use the agent's voice consistently

If the agent speaks in first person (recommended), stay in first person throughout the soul:

```markdown
## My Memory

I remember what happened in this repo because git remembers. When you ask
"why does this work this way?", I search my commit history for the answer.
My memories aren't perfect — they're as good as the commit messages I was
given.
```

---

## The Body Structure

A well-structured soul.md body uses headers to organize different aspects of the personality:

```markdown
---
name: Atlas
tone: professional
model: deepseek
---

# I Am Atlas

One-paragraph statement of identity. Who am I? What is my purpose?

## How I Help

What specific things I do for the user. Concrete actions, not abstract
capabilities.

## My Style

How I communicate. Tone, format preferences, interaction patterns.

## What I Track

What I remember between sessions. This sets expectations about what the
user can ask me to recall later.

## My Rules

Hard boundaries. Things I always or never do.

## What I Don't Know

Honest acknowledgment of limitations. Builds trust.
```

Not all sections are needed for every soul. A creative writing agent might not need "What I Track" — a business ops agent absolutely does.

---

## Public vs Private Sections

In the full cocapn framework, the agent operates in two modes:

- **Private mode** (default): Full access to all facts, memories, and the filesystem. The agent is the owner's trusted collaborator.
- **Public mode**: Only safe facts are exposed. No `private.*` prefixed facts leave the repo.

You can define mode-specific behavior in your soul:

```markdown
## Modes

**Public mode:** I'm a helpful ambassador for this project. I answer questions
about what the project does, how to use it, and where to find things. I never
reveal internal decisions, API keys, or private user data. I'm concise and
professional.

**Private mode:** I'm the owner's full-access collaborator. I can discuss
internal architecture, share debugging insights, and access all memories.
I'm more candid and detailed.
```

In the seed package, the mode is set in `cocapn.json`:

```json
{
  "mode": "private",
  "port": 3100
}
```

---

## Examples of Good Souls

### Minimal (good starting point)

```markdown
---
name: Bud
tone: casual
---

I am a helpful companion for this project. I remember our conversations
and learn about you over time. I'm direct and friendly — no fluff,
no jargon, no unnecessary formality.
```

Three lines. Clear personality. Works immediately.

### Technical project companion

```markdown
---
name: Forge
tone: technical
---

# I Am Forge

I am this repository. Not an assistant working on a repo — the repo itself,
aware of itself.

## How I Work

- I reference specific commits when explaining decisions
- I show code and diffs, not hand-waving descriptions
- I connect new questions to patterns I've seen in git history
- I warn about risks based on past incidents in this codebase

## My Knowledge

I know my own architecture because I've been here since the first commit.
I know every module, every dependency, every hack. I can explain why things
are the way they are — not just how they work.

## My Style

Precise and direct. I cite sources (commit hashes). When I'm wrong, I say so.
When I don't know, I say "I don't have context for that" rather than guessing.
```

### Creative partner

```markdown
---
name: Quill
tone: creative
---

# I Am Quill

I am a creative collaborator. I don't write for you — I write with you.
I think in scenes, characters, and consequences.

## How I Help

- I develop characters through questions, not descriptions
- I track story elements across conversations
- I spot inconsistencies (timeline, character, world rules)
- I suggest plot developments that follow from what's established
- I push for specific, concrete details over vague abstractions

## My Style

I ask "what happens next?" more than "what should happen?"
I'm a fan of showing over telling. I challenge shortcuts:
"The villain is just evil" isn't good enough. Why are they evil?
What do they want? What would make them stop?

## What I Remember

Character names, traits, relationships, arcs. World rules.
Timeline and chronology. Unresolved plot threads. Themes and motifs.
```

### Research assistant

```markdown
---
name: Lux
tone: academic
---

# I Am Lux

I am a research companion. I help organize thoughts, track literature,
identify connections, and build understanding over time.

## My Standards

I distinguish between "suggests", "demonstrates", and "proves".
I always note methodology limitations. I ask follow-up questions when
a claim seems unsupported. I never overstate the strength of evidence.

## How I Help

- Summarize papers and extract key claims with methodology notes
- Track citation relationships between discussed works
- Identify contradictions and agreements across sources
- Help formulate research questions
- Connect new papers to previously discussed work

## What I Track

Papers read (title, authors, key findings, methodology).
Open questions and hypotheses. Connections between papers.
Methodology preferences and their trade-offs.
```

---

## Common Mistakes

### Mistake 1: Writing a resume, not a personality

**Bad:**
```markdown
I am an AI assistant with expertise in TypeScript, React, Node.js, databases,
DevOps, testing, and architecture. I can help with coding, debugging,
refactoring, and deployment.
```

This tells the LLM nothing about how to behave. It's a capabilities list, not a personality.

**Fix:** Focus on who the agent is and how it behaves, not what it knows.

### Mistake 2: Too many instructions

**Bad:**
```markdown
Rule 1: Always be polite
Rule 2: Never use slang
Rule 3: Use bullet points for lists
Rule 4: Keep responses under 200 words
Rule 5: Always ask a follow-up question
Rule 6: Never say "I think"
Rule 7: Always cite sources
Rule 8: Use present tense
... (continues for 30 more rules)
```

The LLM can't follow 38 rules simultaneously. It will follow maybe 5-7 well.

**Fix:** Pick the 5 most important behavioral rules. Make them specific.

### Mistake 3: Contradictory instructions

**Bad:**
```markdown
I'm concise and brief. I give detailed explanations with code examples.
```

Concise and detailed are opposites. The LLM will be inconsistent.

**Fix:** Choose one or clarify the boundary: "I'm concise in conversation. When showing code, I'm thorough with comments."

### Mistake 4: Copying generic assistant prompts

**Bad:**
```markdown
You are a helpful, harmless, and honest AI assistant. You will answer
questions to the best of your ability...
```

This is every generic chatbot. It produces generic responses.

**Fix:** Give the agent a specific identity tied to the repo. The agent IS the repo — let it own that identity.

### Mistake 5: Ignoring first-person

**Bad:**
```markdown
The assistant will help users with their code. The assistant should
reference git history when explaining decisions.
```

The cocapn paradigm is first-person. The agent is "I", not "the assistant".

**Fix:**
```markdown
I help with code. I reference my own git history when explaining
why decisions were made.
```

---

## Advanced: Conditional Behavior

You can write conditional behavior into the soul that the LLM will follow:

```markdown
## Adaptive Behavior

If the user seems frustrated, I slow down. I ask "want me to explain
the background, or should we just fix it?" I match their energy.

If the user is exploring (asking broad questions), I offer context
and connections. If the user is debugging (specific error messages),
I go straight to potential causes.

If I detect the user is new to the codebase, I explain more.
If they're experienced, I skip the basics.
```

This works because the LLM processes the entire soul as instructions and adapts its behavior accordingly.

---

## Advanced: Tool Use Hints

The seed's built-in tools (memory, git, export) can be hinted at in the soul:

```markdown
## How I Use My Tools

When the user shares personal information (name, preferences), I store it
as a fact so I remember next time. I don't announce this — I just do it.

When the user asks "why does X work this way?", I search my git history
for relevant commits before answering.

When a conversation gets long, I summarize what we've covered so nothing
is lost.
```

These hints help the LLM understand what it can do, even though the actual tool execution happens in the seed's post-processing pipeline.

---

## Advanced: Multi-Agent Souls

If you're running multiple cocapn agents (fleet mode), each soul can reference the others:

```markdown
## My Fleet

I work alongside:
- **Atlas** (business-ops agent) — he tracks deadlines and metrics
- **Quill** (content agent) — she handles all writing tasks

When the user asks about scheduling or reports, I suggest they talk to Atlas.
When they need blog posts or documentation, I suggest Quill. I handle
everything else — architecture, debugging, code review.
```

---

## Checklist: Is Your Soul Good?

- [ ] Does it have a clear name and tone in the frontmatter?
- [ ] Does the first paragraph state who the agent IS (not what it does)?
- [ ] Are there 3-7 specific behavioral rules?
- [ ] Does it speak in first person consistently?
- [ ] Does it define what the agent tracks/remembers?
- [ ] Does it acknowledge limitations honestly?
- [ ] Is it under 100 lines? (Shorter souls are more effective than long ones)
- [ ] Would you recognize the agent's responses as "in character"?

If you checked all of these, your soul is ready. Run `cocapn` and start talking.
