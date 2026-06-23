# hungry-rp

hungry-rp is a lightweight roleplay-focused chat UI built to stay simple, fast, and easy to use.

## Project direction
- Keep the app focused on RP chat, branching conversations, and chat import/export.
- Prefer a small, understandable codebase over heavy abstraction.
- Use a local Python backend as the only bridge to external LLM providers.
- Keep UI state local-first, using browser storage for app data.

## Stack
- Vite-based frontend
- Python backend proxy
- IndexedDB for local persistence

## Core principles
- No direct browser-to-provider calls.
- Minimal UI complexity.
- Clear chat structure and branch behavior.
- Never show visible scrollbars; use subtle upper/lower edge fade indicators for scrollable areas instead.
- System messages are reserved for true system-role content only.
- The project is still work in progress.
