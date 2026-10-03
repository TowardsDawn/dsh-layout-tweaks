<div align="center">

# dsh-layout-tweaks

**Layout tweaks for the DSH Web GUI — a two-row session header, sidebar footer entries moved up, and a collapsible non-workspace block**

Render-layer only · touches no other plugin · no build step

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-DSH%20Web%20Client-4d6bfe.svg)](#)
[![Type](https://img.shields.io/badge/type-client%20plugin-6f42c1.svg)](#)

[中文](README.md) | English

</div>

---

## What it does

The DSH Web GUI packs every session-header control into a single row, and the sidebar keeps
「Context insight / Session manager」 at the very bottom while the panel modules (Plugins, Task board,
Skill center, SSH) eat the top of the column. This plugin fixes all three, and:

- **claims no slot** and **changes no other plugin's code**;
- works purely through injected CSS plus one self-owned collapse header — the React tree never notices;
- ships **prebuilt, hand-written `lib/`** (no tsdown / rolldown / tsc required);
- **fails silently** when an anchor is missing — it can never half-break the host UI.

| # | Feature | Default | Notes |
|---|---------|:-------:|-------|
| ① | **Two-row session header** | on | Row 1 = session title + working mode; row 2 = undo / restore / snapshot / archive / tags / move / delete; the tab strip stays where it is |
| ② | **Footer entries moved up** | on | 「Context insight / Session manager」 move directly under the panel list; 「Today's cost」 and Settings stay at the bottom |
| ③ | **Collapsible panel block** | on | A collapse header at the top of the sidebar hides the panel list and the moved entries in one click |

## Preview

| Before | After |
|:------:|:-----:|
| ![before](assets/before.png) | ![after](assets/after.png) |

| Collapsed | Settings |
|:---------:|:--------:|
| ![collapsed](assets/collapsed.png) | ![settings](assets/settings.png) |

> Screenshots come from the offline fixture `test/fixture.html`, which reproduces the session header
> and left sidebar using the **real DOM shape observed on a live client** — so the layout can be
> verified without signing in to a GUI.

## Install

```bash
# recommended
dsh plugin --profile web add <absolute path to this folder>
```

Or manually add the package to `<DSH_HOME>/profiles/web/package.json` (a `file:` dependency plus one
entry in `dsh.profile.bundles`), then restart `dsh web`.

To disable without uninstalling, set `disabled: true` on the inserted row in this package's
`cordis.patch.yml`.

## Configuration

Everything is live — no restart:

- **⚙ Layout settings** on the collapse header toggles ① / ②, with a **Reset to defaults** action.
- Clicking the collapse header toggles ③.
- State is persisted in `localStorage` under `dsh-layout-tweaks:v1`:

  ```json
  { "headerTwoRows": true, "moveEntries": true, "collapsed": false }
  ```

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
nodes, no slot claims.

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

### ② Moving footer entries: `order` vs. selector nesting

The sidebar root is a flex column. After `display:contents` on the footer area and its
`footerActions` wrapper, the footer entries become flex items of the root, so `order` can position
them precisely.

> **Implementation note (a real trap we hit):** `order` applies to the **layout** flex item, but
> selectors must follow the **DOM** hierarchy. `display:contents` only makes `footerActions`
> transparent for layout — in the DOM it is still the parent of those entries. Writing
> `… > div > [class*="lc-ov-entry"]` (as a direct child) matches nothing, and the entries keep
> `order: 0`, piling up at the very top. The correct selector goes through
> `*:last-child > *:first-child`.

### ③ The collapse header

The single injected DOM node, created and cleaned up by the plugin: an `insertBefore` anchor on the
sidebar root's `nav` (falling back to the workspaces container), kept in place by a throttled
`MutationObserver`, with text writes guarded against self-triggering. No React-managed node is ever
moved.

### Anchors used

`data-slot="conversation.session.header"` (+ `.actions` / `.utilities` / `.corner`),
`data-slot="sidebar"`, `data-slot="sidebar.workspaces"`, the sidebar root's direct `nav`, and the
third-party prefixes `lc-ov-entry` / `sm-footerBtn`. **No CSS-Module hashes** (such as `wSkVaW_` /
`hHd-Xa_`), which change between releases.

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
  full-width row, so the result is identical — a future horizontal entry would need its own rule.
- `order` cannot move an entry *inside* another container: ② places the footer entries visually right
  after the panel list, but in the DOM they still belong to the footer area.

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

## License

[MIT](LICENSE)
