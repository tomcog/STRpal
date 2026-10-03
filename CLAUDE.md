# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on **port 5179**. It first reads `../ports.json` and aborts if `STRpal` isn't pinned to 5179, so the port is not negotiable (`--strictPort`).
- `npm run build` — production build to `dist/` (Vercel runs this on deploy). `npm run preview` serves the build on 5179.
- There is no lint or test tooling.

## Architecture

STRpal is a React 18 + Vite PWA for short-term-rental crew operations, built on the **`@tomcoggia/ui`** component library (`github:tomcog/component-library#vX.Y.Z`, source in `~/Sites/component-library`). Plain JS/JSX, no TypeScript.

### Layout of `src/`

- `main.jsx` — entry. Imports `styles/index.css` **before** `@tomcoggia/ui/styles.css` (see Styling), mounts `<AppProvider><App/></AppProvider>`, installs the iOS zoom blockers and registers the service worker.
- `app/App.jsx` — the shell: `LeftRail` + `NavRail`/`NavSlat` at ≥48rem, `BottomNav` below it, the header (page title, notifications bell, profile), and the view switch. Also mounts the global hosts (`Toaster`, `ConfirmHost`, `ImageViewerHost`).
- `app/AppContext.jsx` — `useApp()` → `profile`, `users`, `setUsers`, `refreshUsers`, `updateProfile`, `can(perm)`, `isAdmin()`.
- `lib/` — `supabase.js` (`sb`, `uploadPhoto`, `SUPABASE_URL`; the anon key is hardcoded on purpose), `format.js` (`formatDate`, `formatCurrency`, `formatPhone`, `isPdfUrl`, `todayStr`, `timeAgo`), `router.js` (hash router: `useRoute()`, `navigate(view, param)`, `back()`, `TITLES`).
- `components/` — app-level shared pieces: `Sheet` (form sheet), `ConfirmDialog` (`await confirmDialog({...})`, built on the library `Modal`), `Toast` (`toast(msg)`), `ImageViewer` (`openImageViewer(url)`), `PhotoPicker` (ref API `resolve()/clear()/setUrl()/getValue()`), `Notifications`, `OptionsList`, `StockStatus`, `VendorForm` (`VendorSheet`).
- `views/` — one default-export component per route, each with an optional `<Name>.css`.

### Routing

Hash-based, same URLs as the old app: `#feed`, `#task-detail/<id>`, `#report[/invoice|/issue]`, `#calendar`, `#inventory`, `#admin`, `#profile`, `#sms`. Adding a view = a component in `views/`, a case in `renderView()` and (if it's a section) an entry in `SECTIONS` in `App.jsx`, plus a title in `TITLES`.

### Auth & permissions

There is **no real auth right now**. `AppProvider` loads `users`, picks the first as the active profile, and forces every permission flag on. Views gate through `can(perm)` / `isAdmin()` — keep using them so re-enabling auth is a one-file change.

### Backend (Supabase)

- Tables: `users`, `tasks`, `task_links`, `rentals`, `vendors`, `inventory_standards`, `shortlist_options`, `notifications`.
- Storage bucket `photos` (PhotoPicker's default); uploads are public URLs. Images are re-encoded to JPEG ≤1000px before upload.
- Edge Function `/functions/v1/fetch-product` scrapes title/price/description/image from a product URL (source not in this repo).
- **The project is live data.** Don't insert/update/delete while testing unless the user says to.

### Styling

- Use library components first (`Button`, `ButtonRound`, `InputText`, `InputSelect`, `InputTextarea`, `Checkbox`, `Tabs`, `SegmentedControl`, `Pill`, `Tag`, `Card`, `Modal`, `Spinner`, nav components). Prop types: `node_modules/@tomcoggia/ui/dist/index.d.ts`; docs: `~/Sites/component-library/docs/components/`.
- **Cascade layers:** the library ships inside `@layer ui`. `styles/index.css` declares `@layer base, ui;` first and puts the reset in `base`; if `ui` were named first, the reset's `button` rules would strip library button backgrounds. App CSS is unlayered and wins over both — so **never target library classes** (they're hashed anyway); size/position them from a wrapper or `className`.
- **Theme:** `styles/theme.css` overrides only library *semantic* tokens (`--ui-action`, `--ui-brand` — STRpal's blue). Never override primitives (`--ui-tc-red`, `--ui-neutral-*`). App-only tokens are `--app-*`.
- Use `--ui-*` tokens for colour, type, radius, shadow and motion. Shared layout classes live in `styles/app.css` (`page`, `stack`, `row-between`, `form`, `form-row`, `card-body`, `status-badge`, `fab-stack`, `action-bar`, …). View CSS is prefixed with the view name.
- `Card` has no padding by design — wrap content in `.card-body`. `Tag` is neutral; coloured states use `.status-badge <tone>`.
- The library `Modal` is a 350px confirmation dialog; long create/edit forms use the app `Sheet`.
- **Upgrading the library:** bump the tag in `package.json`, `npm install`, and read the library's `CHANGELOG.md` — renamed tokens fail silently. The `allowScripts` entry for `@tomcoggia/ui@x.y.z` must match the new version or its `prepare` build won't run on install.

### PWA / service worker

`vite-plugin-pwa` generates the service worker (`registerType: 'autoUpdate'`); hashed asset names replace the old `?v=N` cache busting, so there is nothing to bump by hand. Supabase REST reads are cached network-first and storage images cache-first (see `vite.config.js`). `public/manifest.json` is linked from `index.html`.

### Mobile-only quirks

The app is mobile-first and disables zoom: the viewport meta blocks scaling and `main.jsx` swallows `gesturestart`/`gesturechange`/`gestureend` plus double-tap `touchend`. A zoomable UI (image viewer, map) has to opt out locally — don't unhook the global handlers.
