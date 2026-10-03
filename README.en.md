<div align="center">

# dsh-layout-tweaks

**Layout tweaks for the DSH Web GUI — a two-row session header and entry modules folded into a collapsible block**

Render-layer only · touches no other plugin · no build step · new plugin entries land in the block automatically

[![Version](https://img.shields.io/badge/version-0.2.1-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-DSH%20Web%20Client-4d6bfe.svg)](#)
[![Type](https://img.shields.io/badge/type-client%20plugin-6f42c1.svg)](#)

[中文](README.md) | English

</div>

---

## What it does

Two spots in the DSH Web GUI waste space: the session header packs every control into a single row,
and the left sidebar spreads its navigation across both ends of the column — panel modules (Plugins,
Task board, Skill center, SSH) at the top, feature entries at the
bottom — squeezing the workspace/session list between them.

This plugin fixes both, and:

- **claims no slot** and **changes no other plugin's code**;
- works purely through injected CSS plus one self-owned collapse header — the React tree never notices;
- ships **prebuilt, hand-written `lib/`** (no tsdown / rolldown / tsc required);
- **fails silently** when an anchor is missing — it can never half-break the host UI.

| # | Feature | Default | Notes |
|---|---------|:-------:|-------|
| ① | **Two-row session header** | on | Row 1 = session title + working mode; row 2 = undo / restore / snapshot / archive / tags / move / delete; the tab strip stays where it is |
| ② | **Entry modules folded into the block** | on | 「Context insight / Session manager」-style entries leave the sidebar footer and sit right under the panel list, becoming part of the fold |
| ③ | **The fold** | expanded | A collapse header at the top of the sidebar hides the panel list **and** those entries in one click, handing the space back to the workspace list |

Both switches (① ②) live behind the ⚙ on the collapse header and apply live; ③ is a click on the header itself.

## Preview

| Before | After |
|:------:|:-----:|
| ![before](assets/before.png) | ![after](assets/after.png) |

| Collapsed | Settings |
|:---------:|:--------:|
| ![collapsed](assets/collapsed.png) | ![settings](assets/settings.png) |

In the *After* shot the sidebar reads: `▾ Panels & plugins 7` → Plugins / Task board / Skill center /
SSH → **Context insight / Session manager / Example new module** → workspace list → `⟳ Check for
updates` / `⇄ Remote access` / Today's cost / Settings. The three bottom controls stay exactly where
they were, in the same relative order.

> Screenshots come from the offline fixture `test/fixture.html`, which reproduces the session header
> and left sidebar using the **real DOM shape observed on a live client** — so the layout can be
> verified without signing in to a GUI.

## Install

```bash
dsh plugin --profile web add "github:TowardsDawn/dsh-layout-tweaks"
```

Or manually add the package to `<DSH_HOME>/profiles/web/package.json` (a `file:` dependency plus one
entry in `dsh.profile.bundles`), then restart `dsh web`.

To disable without uninstalling, set `disabled: true` on the inserted row in this package's
`cordis.patch.yml`.

## Configuration

Everything is live — no restart:

- **⚙ Layout settings** on the collapse header toggles ① / ②, with a **Reset to defaults** action.
- Clicking the collapse header toggles ③. The number on it counts everything inside the fold
  (panel rows + folded entry modules).
- State is persisted in `localStorage` under `dsh-layout-tweaks:v1`:

  ```json
  { "headerTwoRows": true, "foldEntries": true, "collapsed": false, "bottomKeep": [] }
  ```

  `bottomKeep` is an array of extra CSS selectors for controls you want **pinned to the bottom**
  (advanced; see the next section). Clear the key — or hit *Reset to defaults* — to start over.

## Inclusion rules: what folds, what stays

The requirement behind ② is that **future modules should fold in automatically**, while
「Check for updates / Remote access / Today's cost」 must not move. So ② is a runtime classification,
not a hard-coded allow-list:

```
each direct child of footerActions
        │
        ├─ contains ≥2 clickable controls (a card: main button + expand caret) ─→ stays at bottom
        ├─ matches any BOTTOM_KEEP_SELECTORS (self or descendant) ─────────────→ stays at bottom
        ├─ matches the user's bottomKeep selectors ────────────────────────────→ stays at bottom
        └─ everything else (including entries registered by future plugins) ───→ folds into the block
```

Built-in `BOTTOM_KEEP_SELECTORS` match on **class suffixes and accessible names**, never on the
hash prefixes that change between builds:

| Target | How it is recognised |
|--------|----------------------|
| Usage card | `[class*="footCard"]` / `footMain` / `footToggle`, `[aria-label*="Usage"]`, or the "≥2 controls" rule |
| Check for updates | `[aria-label*="Check for update(s)"]`, `[title*="Check for update"]` (and the zh equivalents) |
| Remote access | `[aria-label*="Remote access"]`, `[title*="Remote access"]` (and the zh equivalents) |
| Panels registered into `sidebar.panellist` | live inside the panel list `nav`, so they fold with it |

Detection inspects **the entry and its descendants**: some plugins wrap their button in a container
(`entryRow > trigger`), so the accessible name sits on an inner element.

## How it works

### Why not slots

DSH's slot system makes "rearranging someone else's UI" impossible by design:

1. **`single` slots are exclusive** — `conversation.session.header` is already claimed by
   `@deepseek-ai/dsh-client-ui-conversation`; registering again throws `SlotOwnershipError`.
2. **An entry's disposer recursively removes the child slots it declared** — so force-replacing the
   claim would take the `actions` / `utilities` / `corner` seats (and **every other plugin's buttons**
   in them) down with it.
3. **A `list` entry's render position belongs to the host** — `sidebar.footer.action` and
   `sidebar.panellist` are different slots in different containers, and a registration is bound to its
   slot name.

So this plugin only rearranges at the render layer: no structural changes, no moving React-managed
nodes, no slot claims. Its only writes are the collapse header it owns and two `data-dsh-lt-*`
classification attributes on footer entries (React does not manage those; the observer re-applies them
after a remount).

### ① Two rows: a zero-DOM line break

`titleRow` is a flex container. The plugin sets `display:contents` on the `titleCluster` and
`headerActions` wrappers so the breadcrumb and each control become flex items of `titleRow`, then
inserts a line break **without touching the DOM** — the `::after` pseudo-element *is* a flex item:

```css
… > div:first-child{ flex-wrap:wrap }
… > div:first-child::after{ content:""; order:5; flex-basis:100%; height:0 }
… nav{ order:0 }                                          /* session title */
… [data-slot="conversation.session.header.actions"] > *:nth-child(1){ order:1 }   /* working mode */
… [data-slot="conversation.session.header.actions"] > *:nth-child(n+2){ order:10 } /* the rest */
```

### ② The fold: attribute-driven, no layer guessing

The sidebar root is a flex column. What actually feeds entries into that layout are three runtime
attributes written by JS:

| Attribute | Written on | Purpose |
|-----------|-----------|---------|
| `data-dsh-lt-box` | every element on the chain "footer area → … → entry container" | makes the whole chain `display:contents`, so entries become **layout** flex items of the root |
| `data-dsh-lt-fold` / `data-dsh-lt-keep` | the real entry elements | decides fold vs. bottom-resident |
| `data-dsh-lt-settings` | the parent container of the settings anchor | keeps Settings at the very bottom |

Ordering then needs nothing but attribute selectors (`:where()` keeps the baseline's specificity at
zero so it can never beat the classified rules):

```css
[data-dsh-lt-box]{ display:contents }
… > div > *{ order:40 }                              /* baseline: stay at the bottom */
… :where([data-dsh-lt-box] > *){ order:40 }           /* same for elements inside the transparent chain */
… > div > *:nth-child(-n+2){ order:0 }                /* brand row + New Session */
… > div > .dsh-lt-head{ order:9 }                     /* collapse header */
… > div > nav{ order:10 }                             /* panel list */
[data-dsh-lt-fold]{ order:15 }                        /* entry modules → the fold */
… > div > div:has(> [data-slot="sidebar.workspaces"]){ order:30 }  /* workspace list */
[data-dsh-lt-keep]{ order:40 }                        /* bottom-resident controls */
[data-dsh-lt-settings]{ order:50 }                    /* settings */
```

`footerActions` is located through the parent of the slot anchor `[data-slot="sidebar.footer.action"]`;
the entry container is that anchor itself (the transparent host the renderer writes), falling back to
"drill through single-child wrappers" when the anchor is missing.

The attributes are maintained by JS on every DOM change (`MutationObserver` +
`requestAnimationFrame` throttling); the classification rules live in
[Inclusion rules](#inclusion-rules-what-folds-what-stays).

> **Three real traps we hit**
>
> 1. **`order` applies to the *layout* flex item, while selectors follow the *DOM* hierarchy.**
>    `display:contents` only makes a container transparent for layout; in the DOM it is still the parent
>    of those entries. Written as a direct child, the selector matched nothing and the entries kept
>    `order: 0`, piling up at the very top.
> 2. **The baseline rule's specificity can beat the classification rules.** A longer baseline selector
>    flattened every classified entry back to `order:40`. Wrapping the baseline in `:where()` drops its
>    specificity to zero.
> 3. **Never guess the layering.** An earlier version hard-coded "footer area → `footerActions` →
>    entries", but the real client has three layers: below `footerActions` sits another *slot anchor
>    host* (`[data-slot="sidebar.footer.action"]`, a class-less transparent div), and the footer area
>    holds a third container besides `footerActions` / `settingsArea` (the usage card). With the
>    hard-coded layers the classifier only saw that host, judged the whole layer a "card" and left it at
>    the bottom — the plugin looked installed but inert. Now the layering is resolved on the spot and
>    the CSS only reads attributes.

### ③ The collapse header

The single injected DOM node (`.dsh-lt-head`), created and cleaned up by the plugin: an `insertBefore`
anchor on the sidebar root's `nav` (falling back to the workspaces container), kept in place by a
throttled `MutationObserver`, with text writes guarded against self-triggering. No React-managed node
is ever moved. It hides itself while the sidebar is collapsed to the 56px rail.

### Anchors used

`data-slot="conversation.session.header"` (+ `.actions` / `.utilities` / `.corner`),
`data-slot="sidebar"`, `data-slot="sidebar.workspaces"`, `data-slot="sidebar.settings"`, the
`sidebar.footer.action` anchor (its parent *and* itself), the sidebar root's direct `nav`, and
accessible names / class suffixes of the entries themselves. **No CSS-Module hashes** (such as
`wSkVaW_` / `hHd-Xa_`), which change between releases.

## Compatibility

- Host: DSH Web client (DOM shape verified against the 0.2.0-rc series).
- Browser: anything with `:has()` (Chrome / Edge 105+, Firefox 121+, Safari 15.4+).
- Degradation: without `:has()` the `@supports` guard disables the rearrangement rules; the plugin
  stays inert instead of partially applying.

## Known limitations

- Tied to the host DOM shape; a major DSH restructure makes the rules miss (the plugin goes inert
  rather than erroring — update the selectors).
- Assumes the sidebar root's first two children are the brand row and New Session.
- `display:contents` cancels `footerActions`' own flex layout; every current footer entry is a
  full-width control or a self-contained card, so the result is identical — a future horizontal entry
  would need its own rule.
- Classification relies on accessible names / class suffixes; a plugin that renames its aria-labels or
  ships meaningless hashes needs a new entry in `BOTTOM_KEEP_SELECTORS` (or in `bottomKeep`).
- `order` cannot move an entry *inside* another container: ② makes footer entries follow the panel list
  in layout order, but in the DOM they still belong to the footer area.

## FAQ

<details>
<summary><b>Will a newly installed plugin fold in automatically?</b></summary>

Yes. Panels registered into `sidebar.panellist` already live inside the panel list; entries registered
into `sidebar.footer.action` are **treated as fold members by default** — no change to this plugin
required. Only entries recognised as bottom-resident controls stay at the bottom, and you can steer
that with `bottomKeep` (or by editing `BOTTOM_KEEP_SELECTORS`).
</details>

<details>
<summary><b>Why not a proper slot plugin?</b></summary>

See [How it works](#how-it-works) — exclusive `single` slots, cascade-disposed child slots, and
host-owned `list` positions make "rearranging someone else's UI" impossible at the slot layer.
Render-layer rearrangement is the only approach that does not drag other plugins into it.
</details>

<details>
<summary><b>Does it affect other plugins?</b></summary>

No. It calls none of their APIs, changes none of their registrations, and moves none of their rendered
nodes. Its only writes are a collapse header it owns plus two `data-dsh-lt-*` classification
attributes; both are cleaned up on unload.
</details>

<details>
<summary><b>Do I need to restart DSH?</b></summary>

Installing/uninstalling needs a `dsh web` restart; the day-to-day switches do not — they apply live
and are remembered.
</details>

## Development

No build step — `lib/` is the artifact:

```bash
node --check lib/client.js
node --check lib/index.js
# offline fixture (no GUI sign-in needed)
#   test/fixture.html                  → plugin off  (before)
#   test/fixture.html?on=1             → plugin on   (after)
#   test/fixture.html?on=1&collapsed=1 → plugin on, collapsed
```

The fixture ships three kinds of footer entries (icon buttons, entry modules, a multi-control card)
plus an "Example new module", so all four classification branches are covered by one page. Edit the
`CSS` constant or `BOTTOM_KEEP_SELECTORS` in `lib/client.js` and refresh the browser to see the
result.

## License

[MIT](LICENSE)
