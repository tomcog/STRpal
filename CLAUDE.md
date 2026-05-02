# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — serves the app on **port 5179** via `npx serve`. The script first reads `../ports.json` and aborts if `STRpal` isn't pinned to 5179, so the port is not negotiable. There is no build, lint, or test tooling.

## Architecture

STRpal is a vanilla-JS PWA (no bundler, no framework, no modules) for short-term-rental crew operations. `index.html` loads every script as a plain `<script>` tag in a fixed order; everything communicates through globals.

### Global object layout

Each file attaches one global. Load order in `index.html` matters — later files assume earlier ones exist:

1. Vendor CDNs: `supabase-js`, `lucide` (icons), `Sortable` (drag-reorder), `heic2any` (iOS photo conversion).
2. `js/supabase-client.js` → `sb` (the Supabase client) and `uploadPhoto(bucket, file)`. The anon key + URL are hardcoded here on purpose (public anon key).
3. Shared modules: `Notifications`, `PhotoPicker`, `OptionsList`, `StockStatus`.
4. `js/router.js` → `Router`.
5. View modules in `js/views/` → `Feed`, `TaskDetail`, `Report`, `Calendar`, `Inventory`, `Admin`, `SMS`, `Profile`. Each exposes a `load(param?)` that the router calls.
6. `js/app.js` → `App` and DOM-ready bootstrap. Also defines util globals: `toast`, `showModal` / `hideModal`, `formatDate`, `formatPhone`, `formatCurrency`, `escapeHtml`, `isPdfUrl`, `refreshIcons`.

### Routing

Hash-based, no library. `Router.show(viewName, param)` toggles `.view.active` on `<div id="view-X">` blocks already present in `index.html` and dispatches to the matching view module's `load()`. The hardcoded title map and view-load switch live in `router.js` — adding a new view means: new `<div id="view-X">` in `index.html`, new module global, new entry in both maps, and a new `<script>` tag.

### Modal pattern

`showModal(html)` parses the HTML, lifts `.modal-title` into the modal header and `.modal-actions` into the footer, then injects the rest. View code builds modals as HTML strings and wires up listeners by `getElementById` after calling `showModal` — there is no template system.

### Auth & permissions

There is **no real auth right now**. `App.init()` loads all rows from `users`, picks the first as the active profile, and force-sets every permission flag (`is_admin`, `can_view_calendar`, `can_manage_finances`, `can_assign_tasks`) to true. `App.can(perm)` and `App.isAdmin()` are the gating functions to call from views — keep using them so re-enabling auth is a one-file change.

### Backend (Supabase)

- Tables in use: `users`, `tasks`, `task_links`, `rentals`, `vendors`, `inventory_standards`.
- Storage bucket: `photos` (default for `PhotoPicker`). Files uploaded via `uploadPhoto()` go to a public URL.
- Edge Function: `/functions/v1/fetch-product` — called from `feed.js`'s "Fetch" button on the task-create modal to scrape title/price/description/image from a product URL. The function's source is not in this repo.

### Service worker / cache busting

`sw.js` uses a network-first, cache-fallback strategy keyed on `CACHE_NAME = 'strpal-v13'`. Every `<script>` and `<link>` in `index.html` carries a `?v=13` query string. **When you ship JS/CSS changes, bump the version in three places together:** the `?v=N` query strings in `index.html`, `CACHE_NAME` in `sw.js`, and (if you added/removed files) the `ASSETS` precache list in `sw.js`. Forgetting any of these leaves users on stale code.

### Mobile-only quirks

The app is mobile-first and disables zoom aggressively: viewport meta blocks scaling, and `app.js` swallows `gesturestart`/`gesturechange`/`gestureend` plus double-tap `touchend` to defeat iOS Safari's default zoom. If you add zoomable UI (image viewer, map), it has to opt out locally — don't unhook the global handlers.
