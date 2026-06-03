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
brand            clamp(26, 3vw, 38) serif 500
landing title    clamp(48, 8vw, 88) serif 500
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
- Buttons: `.btn-primary` (ink), `.btn-secondary` (outline), `.btn-ghost`,
  `.btn-danger`. One primary per surface.
- Position shown as a colored dot (chip) and a pill badge.
- Frameworks render visual first: SCARF as colored dimension pills, Thomas
  Kilmann as a colored mode badge, Cialdini as lever chips, Fisher and Ury as a
  one line teaser. Full text expands on click.

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
