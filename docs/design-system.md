# Kodeks UI Design System

This file defines the baseline UI token model for Kodeks so all future UI
work stays consistent with the committed desktop design direction.

Implementation baseline:
- Tailwind v4 utilities for component styling in `src/App.tsx`
- Token source of truth in `src/index.css` via `@theme`

## Token Layers

- `Typography`
  - Families: `--font-body`, `--font-display`, `--font-mono`
  - Scale: `--text-xs`, `--text-sm`, `--text-md`, `--text-lg`
  - Weights: `--weight-medium`, `--weight-semibold`
- `Spacing`
  - `--space-1` through `--space-8` for all paddings/gaps
- `Radius`
  - `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-window`, `--radius-pill`
- `Color`
  - Text: `--text-strong`, `--text-base`, `--text-muted`, `--text-faint`
  - Border: `--border-soft`, `--border-strong`
  - Surfaces: `--surface-window`, `--surface-sidebar`, `--surface-work`,
    `--surface-inspector`, `--surface-elev-0/1/2`
  - Semantic states: `--state-success`, `--state-warning`, `--state-danger`,
    `--state-info`
  - Action accent: `--accent-primary`
- `Motion and depth`
  - `--ease-out`, `--shadow-window`

## Layout Contract

- Root shell is a single rounded desktop window over a blurred blue wallpaper.
- Content hierarchy:
  - Left: utility/thread rail
  - Center: main work canvas and composer
  - Right: contextual inspector (review or diagnostics)
- Inspector is collapsible and must auto-open on high-priority attention states
  (pending approvals, active diff, runtime warnings).

## Component Rules

- Buttons
  - Primary actions use `--accent-primary`
  - Secondary/icon controls use `--surface-elev-1` + soft border
- Cards and panels
  - Default panel surface: `--surface-elev-1`
  - Nested/code/detail areas: `--surface-elev-0`
- Status pills
  - Semantic state coloring must use `--state-*` tokens
- Lists
  - Thread and timeline lists must remain virtualized for large histories

## Non-Goals

- No glassmorphism-heavy effects
- No neon/purple accent style
- No ad-hoc per-component colors outside token layers
