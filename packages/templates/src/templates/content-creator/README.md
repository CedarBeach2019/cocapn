# Content Creator Template

Social media and blog agent for content calendars, drafting, hashtag strategy, and analytics.

## What It Does

- Plans and manages content calendars across platforms
- Writes and refines posts, threads, articles, and newsletters
- Researches hashtags and monitors trending topics
- Tracks content performance with analytics insights
- Repurposes content across formats (blog to thread, video to carousel)
- Maintains consistent brand voice across all channels

## Quick Start

```bash
npm create cocapn
# Select "content-creator" template

cd your-brain
cocapn secret set DEEPSEEK_API_KEY
cocapn start
```

## Use Cases

- **Solo creators** managing multiple social platforms
- **Marketing teams** planning content campaigns
- **Newsletter writers** producing regular issues
- **Small businesses** building social media presence
- **Podcasters** repurposing episodes into written content

## Configuration

Key settings in `config.yml`:
- `llm.temperature`: Higher (0.7-0.9) for creative content generation
- `features.trendMonitoring`: Enable trend tracking and alerts
- `features.contentRepurposing`: Cross-format content transformation

## Platforms Supported

Twitter/X, Instagram, LinkedIn, TikTok (script), YouTube (description), Newsletters, Blogs
