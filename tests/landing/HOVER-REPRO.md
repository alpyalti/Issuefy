# IFY-015: stationary pointer hover loop

Baseline: `87ed908`. Hovering in the bottom 1–2 pixels of a card moves the
hit target upward via `:hover { transform: translateY(-2px) }`. The pointer
then falls outside the target, hover clears, and the card returns underneath
it. The cycle repeats without mouse movement. The shared source chip has
the same problem with a 1px translation.

## Reproduce

1. Open the landing page and place the pointer just inside the bottom edge of
   a glow card or pricing card, away from its rounded corners and child links.
2. Leave the mouse stationary. Observe repeated hover/normal changes. For a
   numerical check, count `pointerenter` and `pointerleave` events on that card.
3. Repeat with a dashboard stat, signal, saved card, hub post, or source chip.
4. After the fix, the bounds stay fixed while border/shadow/glow hover feedback
   remains. A stationary pointer should produce one entry and no repeated exits.

## Local browser evidence

An isolated localhost fixture loaded the actual `globals.css`, `landing.css`,
and `dashboard.css`; no copied hover declarations or provider services were used.
The card was positioned at (100,140), sized 300×100, and the pointer was placed
at (250,239), one pixel inside its original bottom edge.

- Baseline `.bg-card`: 93 pointer entries and 92 exits without further pointer
  movement; its bottom oscillated around 239px rather than remaining at 240px.
- Fixed `.bg-card`: one entry, zero exits, bottom remained 240px on a later read.
- Fixed `.stat`: one entry, zero exits, bottom remained 240px on a later read.
- Fixed `.tier` and `.source`: edge targeting produced one entry, zero exits,
  and a 240px bottom in the sampled state.

Only hover translations were removed from the seven affected selectors.
Colors, borders, shadows, glow tracking, active-press effects, keyboard behavior,
and non-hover animations remain unchanged. No implementation-mirroring unit
assertions were added for these CSS declarations.

This verifies a concrete geometry feedback loop, not every possible cause of
flicker. Hosted full-page behavior, other browsers, and animated WebGL/overlay
compositing remain separate verification targets.
