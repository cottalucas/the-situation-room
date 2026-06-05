# Manual QA: mobile UX revamp

Run on a real mobile viewport under 768px (or a 375px emulation). Each row maps
an acceptance criterion to a tap-path. The whole pass is meant to run in one go.

## Setup
- Sign in on a phone-width browser, or run local preview at 375px.
- In local preview, enter through Get started and confirm the URL carries `#/`
  before testing refresh behavior.
- Start on a room that has a roster and at least one active decision.

## Tasks 1 to 4: shell

| # | Criterion | Tap-path | Pass when |
|---|-----------|----------|-----------|
| 1 | Keyboard does not auto-open on load | Hard reload the app on mobile | The lens is visible; the soft keyboard stays closed; no input is focused until you tap one |
| 2 | Header is slim and not clipped | Reload; look at the top | "The Situation Room" sits fully below the browser bar, smaller than before, not scrolled under the chrome |
| 2 | No bottom bar | Scroll any lens | There is no bottom navigation bar anywhere |
| 2 | Tabs switch lenses | Tap People, then Energy, then Network in the top row | The content area swaps lens; the active tab underlines |
| 2 | Burger drawer holds rooms, decisions, sign out | Tap the burger (top-right) | A right drawer opens with the rooms list, the decisions list, and Sign out pinned at the bottom |
| 2 | Drawer selection navigates | In the drawer tap another room or decision | The drawer closes and that room/decision opens |
| 3 | Graph fills the screen | Tap Energy, then Network | The grid/graph uses the full width and full height below the tab row, no cramped fixed box |
| 4 | Command companion present on every lens | Look at People, Energy, Network | People shows the "/ Command the room" pill; Energy and Network show a compact slash control beside the header actions |
| 4 | Not a support chatbot | Read the pill and panel | Command glyph and "Command the room" copy; no headset/speech-bubble help iconography, no "How can I help?" |
| 4 | Not draggable | Try to drag the pill | It does not move |
| 4 | Graph-safe entry | On Energy and Network, inspect the graph, axes, legend, and selected node card | The command entry does not overlap information the user needs to read |
| 4 | Opens and closes | Tap the command entry, then the close X | A full-screen command view opens with the chat and placeholder "Command the room, or type /", then closes |
| 4 | Command behavior preserved | In the sheet run a command (e.g. `@note <name> ...`) and check a read's chips | The command applies as before; "Grounded in" person chips are tappable |

## Task 5: empty state and persistence

| # | Criterion | Tap-path | Pass when |
|---|-----------|----------|-----------|
| 5 | Reload returns to last room, decision, and lens | Open room A / decision X, tap Energy, reload; repeat on Network. Then select a second active decision and reload from its `#/decision/:decisionId` URL | The app reopens room A and decision X directly and keeps the active lens instead of snapping back to People or the room's first decision |
| 5 | Room selected but no decision stays quiet | Archive/delete the open decision so none is selected | The main workspace shows no center card and no "Nothing open right now" prompt; chat owns the missing-decision copy |
| 5 | No room selected uses mobile recovery | Clear the selected room or arrive with no room selected | A centered "Select your room" card appears with "Open rooms" and guided setup because the rail is hidden on mobile |
| 5 | No rooms routes to guided setup | Use a fresh account / delete all rooms | The guided setup entry is shown (first-run opens it automatically) |

## Task 6: onboarding

| # | Criterion | Tap-path | Pass when |
|---|-----------|----------|-----------|
| 6 | Title not clipped | Start guided setup on mobile | "Build your first room" sits fully below the header, not under the browser bar |
| 6 | Skip is visibly clickable | Look at "Skip, I'll set it up myself" | It is an underlined colored link with a comfortable tap target, not faint ghost text |
| 6 | New room transition is soft | Tap `+ New room` in the drawer | Guided setup eases in like the command/chat surface expanding, not a hard page swap |

## Tasks 7 and 8: condensed overlay and node summary

| # | Criterion | Tap-path | Pass when |
|---|-----------|----------|-----------|
| 8 | Node tap shows a summary | On Network or Energy, tap a node | A small floating card shows name, decision touched, last 1-2 notes, Power/Interest, SCARF state |
| 8 | Summary opens Tier 1 | Tap the summary card | The condensed overlay opens |
| 7 | Overlay is centered on mobile | Open the condensed overlay | It is vertically centered on the screen |
| 7 | Condensed content | Read the overlay | Header (name, role, position-status, quadrant, Power/Interest), driver line, last 2 notes, framework state chips |
| 7 | No per-row eye icons | Scan the framework chips | Zero "i" icons, no "what are these", no tooltip or popover on a chip tap |
| 7 | Links out correctly | Tap "View full profile"; then in the overlay tap "Understand the frameworks" | Person page opens; the quiet link opens /frameworks |

## Tasks 9 and 10: person page and frameworks page

| # | Criterion | Tap-path | Pass when |
|---|-----------|----------|-----------|
| 9 | People tap opens the person page | On People, tap a person row | A full-screen person page opens at `#/person/:id` |
| 9 | Route chrome stays standard | On a person page, notes page, and frameworks page | The top row keeps `The Situation Room` and the burger; the back button sits in a separate row below |
| 9 | Driver is read-only | Open a person page and tap the Driver block | It remains sentence text, not a textarea or inline editor |
| 9 | Person data only, no generic prose | Read the page | Full notes history and four framework mappings with that person's state and rationale; no generic framework explanation inline |
| 9 | Back navigation | Tap the back control | Returns to the People tab |
| 10 | /frameworks renders all four | Open `#/frameworks` (via either quiet link) | SCARF, Thomas-Kilmann, Cialdini, Fisher and Ury each render generically |
| 10 | No person data on it | Read the whole page | No person name appears anywhere |
| 7/9/10 | One route to explanations | Tap any framework chip on a person surface | It never opens a tooltip or a second modal; only /frameworks explains |

## Regression
- Run `@note`, `@grid`/`@energy`, `@network`, `@map`, `@create` and confirm
  unchanged behavior (offline evals already cover the parsing and update shape).
- `npm run eval:offline` and the verify scripts pass unchanged.
