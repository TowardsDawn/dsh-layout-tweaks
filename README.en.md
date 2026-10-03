<div align="center">

# dsh-layout-tweaks

**Layout tweaks for the DSH Web GUI — a two-row session header and a one-click collapsible panel list**

Render-layer only · touches no other plugin · never touches the sidebar footer · no build step

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-DSH%20Web%20Client-4d6bfe.svg)](#)
[![Type](https://img.shields.io/badge/type-client%20plugin-6f42c1.svg)](#)

[中文](README.md) | English

</div>

---

## What it does

Two spots in the DSH Web GUI are awkward: the session header crams the title, the working mode and a
dozen action buttons into a single row; and the panel modules at the top of the left sidebar (Plugins,
Task board, Skill center, SSH) always take up space even when you are not using them.

This plugin fixes both, and:

- **claims no slot** and **changes no other plugin's code**;
- **never touches the sidebar footer** — the position and order of *Context insight / Session manager /
  Check for updates / Remote access / Today's cost / Settings* belong to the host and to other
  plugins; this one writes no attribute and ships no rule for them (a hard boundary since v0.3.0 —
  see [the appendix](#appendix-an-abandoned-attempt));
- works purely through injected CSS plus one self-owned collapse header — the React tree never notices;
- ships **prebuilt, hand-written `lib/`** (no tsdown / rolldown / tsc required);
- **fails silently** when an anchor is missing — it can never half-break the host UI.

## Features

| # | Feature | Default | Notes |
|---|---------|:-------:|-------|
| ① | **Two-row session header** | on | Row 1 = session title + working mode; row 2 = undo / restore / snapshot / archive / tags / move / copy link; the tab strip stays where it is |
| ② | **Collapsible panel list** | expanded | A collapse header at the top of the sidebar hides Plugins / Task board / Skill center / SSH in one click, handing the space back to the workspace list |

② is a click on the header itself: instant, and remembered. While the sidebar is collapsed to the 56px
rail, the header hides itself.

## Preview

| Before (plugin off) | After (plugin on) |
|:------:|:-----:|
| ![before](assets/before.png) | ![after](assets/after.png) |

- **Header**: `dsh bug 检查` + `标准模式` get row 1 to themselves; every other control moves down a row
  instead of being squeezed sideways.
- **Sidebar**: a collapse header (`▾ Panels & plugins 4`) appears above the panel list.

**The footer area is identical in both screenshots** — `⟳ Check for updates / ⇄ Remote access /
Context insight / Session manager / Today's cost / Settings` keep their position, order and horizontal
arrangement. That is a deliberate boundary: the plugin ships no rule for the footer area and writes no
attribute on its nodes (the fixture reports the number of footer nodes written to — it must be 0).

### ② Collapsed

![collapsed](assets/collapsed.png)

> Screenshots come from the offline fixture `test/fixture.html`, which reproduces the session header
> and left sidebar using the **real DOM shape observed on a live client** — so the layout can be
> verified without signing in to a GUI.

## Install

```bash
dsh plugin --profile web add "github:TowardsDawn/dsh-layout-tweaks"
```

This writes the package into the profile's `dsh.profile.bundles` and lets the bundle layer read its
`cordis.patch.yml`. Or do it manually: add a `file:` dependency plus one entry in
`dsh.profile.bundles` inside `<DSH_HOME>/profiles/web/package.json`, then restart `dsh web`.

This is a **client-only** plugin: the host half (`lib/index.js`) is just a mount point in the assembly
tree — it registers no service and reads no session.

> The client half (`lib/client.js`) is read into memory **at startup** by the host (served with
> `immutable` and a one-year cache), so **editing `lib/client.js` needs a `dsh web` restart** to take
> effect. The day-to-day collapse toggle is unaffected and applies live.

To disable without uninstalling, set `disabled: true` on the inserted row in this package's
`cordis.patch.yml`.

## Configuration

### The collapse toggle (②)

Click the collapse header to fold/unfold the panel list. State lives in `localStorage` under
`dsh-layout-tweaks:v1`:

```json
{ "headerTwoRows": true, "collapsed": false }
```

### Turning the two-row header off (①)

Since v0.3.0 the collapse header carries no settings entry (the old ⚙ and its popover are gone) and ①
defaults to on. To disable it, run this in the browser console:

```js
const s = JSON.parse(localStorage.getItem('dsh-layout-tweaks:v1') || '{}')
s.headerTwoRows = false
localStorage.setItem('dsh-layout-tweaks:v1', JSON.stringify(s))
location.reload()
```

Reset everything (two rows on, panel list expanded):

```js
localStorage.removeItem('dsh-layout-tweaks:v1'); location.reload()
```

> The old `foldEntries` / `bottomKeep` fields are no longer read; leaving them in place is harmless.

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
nodes, no slot claims. Its only DOM write is a single collapse header it owns.

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

Being a flex item of the host element itself, the pseudo-element gives a line break point with no
inserted node — React reconciliation never notices.

### ② The collapse header

The single injected DOM node (`.dsh-lt-head`), created and cleaned up by the plugin: an `insertBefore`
anchor on the sidebar root's `nav` (falling back to the workspaces container), kept in place by a
throttled `MutationObserver`, with text writes guarded against self-triggering. No React-managed node
is ever moved. Folding is pure CSS:
`html[data-dsh-lt-collapsed] [data-slot="sidebar"] > div > nav{ display:none }`.

### Anchors used

`data-slot="conversation.session.header"` (+ `.actions` / `.utilities` / `.corner`),
`data-slot="sidebar"`, `data-slot="sidebar.workspaces"`, and the sidebar root's direct `nav`.
**No CSS-Module hashes** (such as `wSkVaW_` / `hHd-Xa_`), which change between releases.

## Appendix: an abandoned attempt

Between v0.1.0 and v0.2.4 this plugin also tried to move the sidebar's bottom entries
(「Context insight / Session manager」 and the like) up under the panel list and into the fold.
**v0.3.0 removed that machinery entirely**, because the cost far outweighed the benefit (one screen of
space). The lessons are kept here so nobody repeats them:

1. **Bottom entries and the panel list are registered in very different ways** — different slots,
   different containers, different layout constraints. "Fold them in" can only be faked at the render
   layer by flattening the whole container chain with `display:contents`, and that is fragile by
   construction.
2. **`order` applies to the *layout* flex item, while selectors follow the *DOM* hierarchy.**
   `display:contents` only makes a container transparent for layout; in the DOM it is still the parent
   of those entries. Written as a direct child, the selector matched nothing and the entries kept
   `order: 0`, piling up at the very top.
3. **Flattening a container changes the container's own flex direction.** This was the expensive one:
   bottom entries lived in a row container where `flex:1` filled the width; moved into the sidebar root
   (a column), the very same `flex:1` became "grab height" — measured: an entry stretched to 125px
   (normally 36px) and the workspace list was squeezed to zero height. Users reported it as *"the
   workspace list disappeared"*.
4. **Someone else may already be ordering the same entries.** In a live client another plugin (marking
   the sidebar with `data-dsh-frame` / `data-dsh-part`) ships
   `[data-dsh-frame]:not(…) [class*="footerActions"] > [data-slot="sidebar.footer.action"] > :not(…) { order: 1 }`
   with `(0,6,0)` specificity — higher than this plugin's `(0,3,1)` — flattening the classification
   result. The only way out was `!important` on everything, which just creates the same problem for
   the next plugin.
5. **The baseline rule's specificity can beat the classification rules**, and only `:where()` (zero
   specificity) makes the baseline lose reliably.

Conclusion: **the sidebar footer belongs to the host and to other plugins — this plugin does not write
a single byte into it**, so the visible layout is pixel-identical to "this plugin never touched the
footer", and whatever a new plugin registers is what you see. Since v0.3.0 `npm test` guards that
boundary with reverse assertions: if `data-dsh-lt-fold` / `data-dsh-lt-keep` / `data-dsh-lt-box` /
`data-dsh-lt-settings` / `BOTTOM_KEEP_SELECTORS` / `sidebar.footer.action` / `footerActions` ever
reappear in the source, the test fails.

## Compatibility

- Host: DSH Web client (DOM shape verified against the 0.2.0-rc series).
- Browser: anything with `:has()` (Chrome / Edge 105+, Firefox 121+, Safari 15.4+).
- Degradation: without `:has()` the `@supports` guard disables the two-row rules and the plugin stays
  inert; the collapse feature keeps working (it does not need `:has()`).
- Node (install time only): ≥ 22.19.

## Known limitations

- Tied to the host DOM shape; a major DSH restructure makes the rules miss (the plugin goes inert
  rather than erroring — update the selectors).
- The collapse header assumes the sidebar root's first `nav` is the panel list (falling back to the
  workspaces container). With an empty panel list it degrades to sitting above the workspace area —
  still clickable, just with nothing to fold.
- The two-row layout assumes the first item of `actions` is the working mode (it already carries
  `order:-10` and is always first).
- Row 2 is an ordinary flex row (`flex-wrap`): a narrow window or many header buttons will spill onto
  further rows — deliberate, so nothing gets clipped.
- The collapse header is a self-owned node, so it may sit visually next to the host's own panel-list
  heading (if any) — expected.

## FAQ

<details>
<summary><b>Does it affect other plugins?</b></summary>

No. It calls none of their APIs, changes none of their registrations, moves none of their rendered
nodes, and **writes no attribute on any node in the sidebar footer**. Its only DOM write is a single
collapse header it owns, removed on unload.
</details>

<details>
<summary><b>Why not a proper slot plugin?</b></summary>

See [How it works](#why-not-slots) — exclusive `single` slots, cascade-disposed child slots, and
host-owned `list` positions make "rearranging someone else's UI" impossible at the slot layer.
Render-layer rearrangement is the only approach that does not drag other plugins into it.
</details>

<details>
<summary><b>Why not fold the bottom entries (Context insight / Session manager) in any more?</b></summary>

See [the appendix](#appendix-an-abandoned-attempt). In one line: those entries are registered quite
differently from the panel list, so moving them means flattening containers, flipping a container's
flex direction and fighting other plugins over `order` — for one screen of space. Not worth it.
</details>

<details>
<summary><b>Do I need to restart DSH?</b></summary>

Editing `lib/client.js` (and installing/uninstalling) does — the client half is read into memory at
startup and served with a long cache. The collapse toggle does not: it applies live and is remembered.
</details>

<details>
<summary><b>How do I restore the original layout?</b></summary>

Expand the panel list by clicking the header, then clear `dsh-layout-tweaks:v1` from `localStorage`
(or turn ① off as shown in [Configuration](#configuration)). To remove it at the assembly level, see
*Install*.
</details>

<details>
<summary><b>How can I verify the footer is untouched?</b></summary>

Open the fixture at `test/fixture.html?on=1` (or `&collapsed=1`); the bottom-right badge reports
**"footer nodes written to: 0 (expected 0)"**. That page reproduces the real footer shape (icon
buttons / entry modules / a multi-control card / Settings), so a non-zero number means the boundary is
broken.
</details>

## Development

No build step — `lib/` is the artifact:

```bash
# offline pre-flight (syntax / module protocol / factory export / host half /
#   markers / footer-untouched reverse assertions / required files — 24 checks)
# — this is what catches the classic client-plugin failure: the whole stylesheet lives in a template
#   literal, so a stray backtick in a comment terminates it and the module fails to import in DSH
npm test

# offline fixture (no GUI sign-in needed)
#   test/fixture.html                  → plugin off  (before)
#   test/fixture.html?on=1             → plugin on   (after)
#   test/fixture.html?on=1&collapsed=1 → plugin on, collapsed
```

**Run `npm test` before pushing** — client-plugin mistakes only surface in the browser, and this script
needs neither DSH nor a browser.

The fixture reproduces the real footer shape (including another plugin's `order` rule) and ships a
self-check: **the number of footer nodes written to must be 0**. Edit the `CSS` constant in
`lib/client.js` and refresh the browser to see the result.

## License

[MIT](LICENSE)
