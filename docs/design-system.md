# Design system

The visual language is editorial, calm, and senior. Warm off white, deep ink,
one serif for headings, one sans for everything else. Restraint signals
seniority. Generous whitespace. The only saturated color is the four quadrant
accents and the position dots.

This file exists so the look never regresses again. If you change a token,
change it here too.

## Fonts

Loaded from Google Fonts in `index.html`. Confirm they load before shipping.

- Headings: Fraunces (serif). Weights 500 and 600.
- Body and UI: Outfit (sans). Weights 300 to 600.
- Never fall back to system sans for headings. If Fraunces fails to load, fix
  the import rather than shipping the fallback.

## Color tokens

```
--bg          #faf8f4   warm off white, the canvas
--bg-raised   #fffdf9   cards and panels
--bg-overlay  #ffffff   floating profile
--ink         #1a1916   text
--ink-soft    #56544e   secondary text
--ink-faint   #8d8a82   tertiary text, labels
--line        #e6e1d7   hairlines
--line-strong #d8d2c5   stronger borders

quadrants
--manage      #b91c1c   Manage closely (high power, high interest)
--satisfied   #b45309   Keep satisfied (high power, low interest)
--informed    #0f6e56   Keep informed (low power, high interest)
--monitor     #5f5e5a   Monitor (low power, low interest)

position
--for         #2f8f5b
--against     #b91c1c
--neutral     #8d8a82
--unknown     #c5c1b8   shown as a dashed ring
```

Quadrant tints sit at about 6 percent over the raised surface, with a 15 percent
accent border. Clearly present zones, not washed out and not blocks of color.
The people and the latest message still stand out more than the background.

## Type scale

Body base is 15px with 1.55 line height. Do not go below 13px for anything a
user reads. Labels and meta sit at 11 to 12px.

```
brand            36 desktop / 30 mobile serif 500
landing title    82 desktop / 56 mobile serif 500
tab label        17 serif 600
modal title      24 serif 600
profile name     22 serif 600
play headline    19 serif 500
person row name  16 sans 500
body / chat      15 sans 400
secondary        13 to 14
labels / meta    11 to 12, uppercase, 0.1em tracking
```

## Spacing

An 8px rhythm exposed as tokens `--s1` (4) through `--s7` (48). Cards use 18 to
20px padding. Sections separate with 24px. Nothing should feel glued.

## Components

- Floating profile uses `--shadow-float`. Cards use `--shadow`.
- Modals use a stable rgba backdrop. Do not animate or color-mix the backdrop;
  it can flicker during Firestore-driven rerenders.
- Buttons: `.btn-primary` (ink), `.btn-secondary` (outline), `.btn-ghost`,
  `.btn-danger`. One primary per surface.
- Desktop rail keeps Rooms and Decisions. Selected room and selected decision
  use one quiet treatment only: soft fill or a left rule, not both, and never a
  bordered card. Decisions are plain indented rows with a status dot. New room
  and New decision share the same small plus affordance. When a room has more
  than four active decisions, show the most recent four plus an inline "Show all
  (N)" row; collapsing again must keep the active decision visible.
- The account layer is a menu, not a settings page. Desktop opens it from the
  top-right name and avatar. Mobile shows the same section in the right drawer
  below Rooms and Decisions. Item order is always Signed in as name, Profile,
  Frameworks, Sign out. A divider sits after the Signed in as block so identity
  and actions read as separate groups. Sign out does not live in the desktop rail.
- Profile is a shared modal surface on web and mobile. It contains editable
  Name, read-only Email with a small read-only badge, and optional Position as
  one fixed select: empty, PM, Engineering, Design, Exec, Other. Empty fields are
  valid. Save shows a clear success state. When present, the saved profile name
  is the account greeting.
- Chat threads alternate user prompts and assistant replies. User prompts are
  right-aligned ink bubbles; assistant command results stay in raised cards
  because they are also structured UI.
- Chat default state is a conversation starter, not a room read. It should ask
  what is on the user's mind and suggest commands. `@read` is an explicit command
  only; selecting a room or decision must not trigger The Read.
- First-run onboarding uses a chat-like panel, not a modal. Assistant prompts
  sit in raised bubbles, user answers sit in ink bubbles, and the form uses one
  primary action. The panel asks three fixed questions. Guided chat is the only
  setup entry; there is no "Skip, I'll set it up myself" link. The panel carries a
  quiet close affordance (the `onboarding-close` square in the header), and
  dismissing lands the user in the live empty room with the rail and command
  surface visible, never in a settings modal. Manual room editing stays reachable
  through the existing room-settings entry point. The entrance is one calm,
  uniform animation (a soft fade and slight rise, no lateral jump) on both
  first-run and "+ New room", and it respects reduced-motion.
- A generated play (`@play`) is a pinned, immutable card, visually distinct from
  chat bubbles: a raised card with an ink top rule, labeled `PLAY · <timestamp>`
  with a pin marker. It is frozen at generation time (the generating inputs are
  snapshotted in), re-openable through the reasoning toggle, and persists across
  reload. It is not a chat bubble and never restyles as one.
- The signed-in operator is rendered as "You", visually distinct from directory
  people: a tinted self tag and avatar in the roster and People lens, and a
  self-marked chip (`chip-self`) on the Energy grid and network. "You" is present
  in every room by default, removable, and never offered in "Add from directory".
- "Add from directory" rows are roomy, never crammed: a vertical list with 8px
  gaps, 14 by 16px row padding, and a 60px minimum row height, with a one-line
  helper above the list.
- Position shown as a colored dot (chip) and a pill badge.
- Network and grid chips show a three character first-name label such as Cha,
  Cla, Rou, or Ral. Full name and role stay available through hover labels and
  the profile surface.
- The grid does not carry instructional text inside the plot area. Empty space
  helps people read position; interaction hints belong outside the map or in
  onboarding.
- Person surfaces use one primary profile view. `PersonPage` (`#/person/:id`) is
  the profile: header, role, stance, quadrant, Power and Interest, driver, the
  last two encrypted notes, a `View all notes` link when more exist, history, and
  all four framework mappings. Framework mappings use the same visual language
  as the earlier profile chips: SCARF dimension dots, Thomas-Kilmann mode badge,
  Cialdini lever chips, and Fisher and Ury teaser text, with stored rationale
  beside the visual. Driver is display text, not an adjustable textarea; changes
  should come from notes and reads, not inline editing on the profile page.
  `PersonNotesPage` (`#/person/:id/notes`) is the long notes list for that
  person. `FrameworksPage` (`#/frameworks`) is generic,
  person-independent reference content, one plain section per framework, no
  tooltips or nested modals. Litmus test: a screenshot of any framework
  explanation contains no person name. Framework explanation content lives solely
  on the reference page.
- On the graph (Energy and Network), tapping a node opens a small floating node
  summary (`NodeSummary`), not the full overlay: name, the decision last touched,
  the last one or two notes, and key scores (Power and Interest, SCARF state).
  Tapping the summary opens the person profile page.
- Mobile shell: a slim header with the brand and a right-side burger; a
  horizontal tab row (People, Energy, Network) directly beneath the header as the
  primary lens switcher; the active lens fills the full remaining height, so the
  graph is full-screen. There is no bottom navigation bar. Rooms, decisions, and
  the account menu live in a right-side drawer (`MobileDrawer`) opened from the burger.
  Chat is not a tab. It runs through a persistent floating command companion
  (`CommandCompanion`). On People, the collapsed entry is a bottom-right pill with
  a command glyph and "Command the room"; on Energy and Network it compresses to a
  slash-only control beside the header actions so it never covers the graph or
  legend. Expanded, it is a full-screen mobile command view holding the chat with
  placeholder "Command the room, or type /". It reads as a command surface, not a
  support chatbot (no headset or help iconography), and it is fixed, not
  draggable. Desktop keeps the rail plus chat column three-pane layout; the
  burger, drawer, and companion are mobile only. The chat input autofocuses on
  desktop only; on mobile it focuses on explicit tap, so the keyboard never opens
  the product out of view on load. A hard refresh preserves the active room,
  active decision, and current People/Energy/Network lens when those saved ids
  are still valid. Selected decisions use `#/decision/:decisionId` as the app
  route so refresh can restore the exact decision before async storage returns.
  Mobile route pages (`#/person/:id`,
  `#/person/:id/notes`, `#/frameworks`) keep the same app header with brand and
  burger, then show a separate back row below it.
- Missing-decision state: the chat column owns the copy (`No decision open` and
  the locked input). The main workspace stays quiet and does not duplicate that
  message with a center card or a "Nothing open right now" prompt. If no room is
  selected on mobile, show the `Select your room` card because the rail is hidden;
  desktop relies on the visible rail.

## Tooling

Install the UI and UX skill and run its pre delivery anti pattern checks before
calling any build done:

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
```

Validate against the usual anti patterns every time: tiny fonts, cramped
spacing, low contrast, inconsistent rhythm, more than one primary action per
view. Those were the exact regressions this pass had to undo.

## Copy rules

Follow the anti slop rules from github.com/hardikpandya/stop-slop in all UI copy
and docs: active voice, no filler adverbs, no throat clearing, varied sentence
rhythm. No em dashes. Avoid the hyphen as a connector; use a period or comma.
Compound words keep their hyphen.
