---
name: claude-docs
description: Search the official Anthropic/Claude documentation. Use when the user asks how something works in Claude Code, the Claude API, or the Anthropic SDK. Always fetches from official docs URLs.
---

# claude-docs — Official Anthropic Docs Search

## Purpose

Fetch and answer questions using the official Anthropic documentation. Never guess or rely on training data alone — always verify against the live docs.

## Official documentation URLs

| Topic | URL |
|-------|-----|
| Claude Code overview | https://docs.anthropic.com/en/docs/claude-code/overview |
| Claude Code CLI reference | https://docs.anthropic.com/en/docs/claude-code/cli-reference |
| Claude Code settings | https://docs.anthropic.com/en/docs/claude-code/settings |
| Claude Code hooks | https://docs.anthropic.com/en/docs/claude-code/hooks |
| Claude Code slash commands | https://docs.anthropic.com/en/docs/claude-code/slash-commands |
| Claude Code MCP | https://docs.anthropic.com/en/docs/claude-code/mcp |
| Claude Code SDK (agent) | https://docs.anthropic.com/en/docs/claude-code/sdk |
| Claude Code skills | https://docs.anthropic.com/en/docs/claude-code/skills |
| Claude API overview | https://docs.anthropic.com/en/docs/overview |
| Claude API messages | https://docs.anthropic.com/en/api/messages |
| Claude API tool use | https://docs.anthropic.com/en/docs/build-with-claude/tool-use |
| Claude models list | https://docs.anthropic.com/en/docs/about-claude/models/overview |
| Claude API reference root | https://docs.anthropic.com/en/api |

## Behavior

1. Identify which doc section is relevant to the question
2. Fetch the URL using WebFetch
3. Answer based on what the page actually says
4. Quote or cite the relevant section
5. If the answer isn't on that page, check related URLs from the table above

Always prefer fetching over guessing. If you're not sure which URL applies, start with the overview page for that product area.
