# QA: Web parity and profile

Date: 2026-06-05

Local URL used: `http://localhost:5179/`

## Desktop viewport

- Rail visual cleanup: open the local preview, enter local mode, inspect the left
  rail. Rooms and Decisions remain. The selected room and selected decision use
  one soft fill. Decision rows are indented and plain with status dots. New
  decision and New room use the same plus affordance. Sign out is absent from the
  rail.
- Decision overflow: create five extra decisions with `+ New decision`. The rail
  shows four recent decisions plus `Show all (6)`. Click `Show all (6)` to see
  every decision, then `Show less` to collapse. Select `Overflow test 1`, collapse
  again, and confirm the active older decision stays visible above the recent
  four.
- Persistence and empty voice: select decisions, reload, and confirm the last
  local selection is restored from cache. With no decision open, the center card
  and chat panel both say `No decision open` and use the same instruction. The
  locked input placeholder reads `Open a decision first`.
- Account menu: click the name and avatar at top-right. Confirm item order:
  `Signed in as`, `Profile`, `Frameworks`, `Sign out`.
- Frameworks route: choose Frameworks from the account menu. Confirm the URL hash
  is `#/frameworks` and the visible page contains generic framework text only.
- Profile: choose Profile from the account menu. Clear Name, choose
  `No position selected`, save, and confirm `Saved.` appears with no validation
  error. Enter `Local Operator`, choose `PM`, save again, reload, enter local
  mode, reopen Profile, and confirm the name and position persist. Email is
  disabled and marked read-only.
- Chat default: with a decision open and only the welcome message present, the
  chat shows a conversation starter, not a `Read the room` participant card.
  Switching rooms or decisions must not create a read message. Sending `@read`
  is the only path that runs The Read.
- Person page: open Marco from People, Energy, or Network. Confirm the page bar
  still shows `The Situation Room`, recent activity shows two encrypted notes,
  `View all notes (15)` opens `#/person/marco/notes`, and the back button returns
  to `#/person/marco`.
- Framework visuals: on Marco's page, confirm SCARF dots, Thomas-Kilmann badge,
  Cialdini chips, and Fisher and Ury teaser text render in the framework rows.
  The `Understand the frameworks` link opens the generic reference page and the
  product name remains visible in the page bar.
- Center spacing: with no decision open, confirm the center card uses normal panel
  spacing and does not leave a large empty well below the content.

## Mobile viewport

- Mobile shell: set viewport below 768px. Confirm the burger is visible, the
  desktop rail and account trigger are hidden, People, Energy, and Network sit in
  the top tab row, the desktop chat column is hidden, and the command companion
  pill is visible.
- Mobile command view: tap `/ Command the room` on People. Confirm the command
  panel covers the full screen, sent prompts appear as right-side user bubbles,
  the temporary thinking state uses animated dots, and assistant results appear
  as left-side chat bubbles.
- Graph command placement: switch to Energy and Network. Confirm the command
  entry becomes a compact slash control near the header actions and does not
  overlap graph points, labels, axes, legends, or node summaries.
- Drawer account menu: tap the burger. Confirm Rooms and Decisions are still in
  the drawer. Confirm the account section shows `Signed in as`, then Profile,
  Frameworks, and Sign out in that order.
- Mobile Profile: tap Profile in the drawer. The drawer closes and the same
  Profile modal opens with Name, disabled read-only Email, and Position. The saved
  name and position match desktop.
- Mobile Frameworks: reopen the drawer, tap Frameworks, and confirm the drawer
  closes, the URL hash is `#/frameworks`, and the visible frameworks page has no
  person-specific data. Confirm the mobile route chrome keeps the brand and
  burger in the top row and shows a separate back row below it.

## Verification commands

- `npm run build`
- `npm run eval:offline`
- `npm run verify:onboarding`
- `npm run verify:persistence`
- `npm run verify:resolution`
- `npm run verify:guard`
- `npm run verify:autoread`
- `npm run verify:confidence`

Browser console errors during QA: none.
