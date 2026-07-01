# Mockingbird — Frontend Component Specification

This document is the authoritative design reference for the Mockingbird UI. A developer should be able to implement any component or screen described here without needing to ask design questions. Read DESIGN.md for product behaviour and IMPLEMENTATION.md for backend details; this document covers everything visual and interactive.

---

## Table of Contents

1. [Design Tokens](#1-design-tokens)
2. [Component Library](#2-component-library)
   - [Button](#21-button)
   - [Input](#22-input)
   - [Textarea](#23-textarea)
   - [Select / Dropdown](#24-select--dropdown)
   - [Badge / Pill](#25-badge--pill)
   - [Card](#26-card)
   - [StatusDot](#27-statusdot)
   - [Modal / Dialog](#28-modal--dialog)
   - [Drawer](#29-drawer)
   - [Tabs](#210-tabs)
   - [DragHandle + Sortable List Row](#211-draghandle--sortable-list-row)
   - [Monaco Editor Wrapper](#212-monaco-editor-wrapper)
   - [TemplatePreview Panel](#213-templatepreview-panel)
   - [ConditionBlock](#214-conditionblock)
   - [WorkflowActionCard](#215-workflowactioncard)
   - [ModuleCard](#216-modulecard)
   - [ServiceTreeItem](#217-servicetreeitem)
   - [FilterChip](#218-filterchip)
   - [SaveStateIndicator](#219-savestateIndicator)
3. [Screen-Level Specs](#3-screen-level-specs)
   - [Empty State](#31-empty-state-first-launch-no-services)
   - [Add Service Wizard](#32-add-service-wizard)
   - [Service Settings Page](#33-service-settings-page)
   - [Endpoint List](#34-endpoint-list)
   - [Endpoint Detail](#35-endpoint-detail)
   - [Statement Editor](#36-statement-editor)
   - [Module Configuration](#37-module-configuration)
   - [Response Block Library](#38-response-block-library)
   - [Request Log](#39-request-log)
   - [Global Settings](#310-global-settings)
4. [Interaction Patterns](#4-interaction-patterns)
   - [Two-Tier Save Model](#41-two-tier-save-model)
   - [Drag-to-Reorder](#42-drag-to-reorder)
   - [Inline Module Creation](#43-inline-module-creation-from-a-workflow-step)
   - [Create Statement from Log Entry](#44-create-statement-from-log-entry)
   - [Orphaned Endpoint Warning and Remap](#45-orphaned-endpoint-warning-and-remap-flow)
   - [Test Connection Button States](#46-test-connection-button-states)

---

## 1. Design Tokens

Expressed as CSS custom properties. Define these on `:root` and reference them everywhere — never hard-code colour or spacing values.

```css
:root {
  /* ─── Colour: Brand / Primary ─── */
  --color-primary-50:  #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #3b82f6;   /* primary interactive */
  --color-primary-600: #2563eb;   /* primary hover */
  --color-primary-700: #1d4ed8;   /* primary active / pressed */
  --color-primary-800: #1e40af;
  --color-primary-900: #1e3a8a;

  /* ─── Colour: Neutral / Surface ─── */
  --color-neutral-0:   #ffffff;   /* page background */
  --color-neutral-50:  #f8fafc;   /* sidebar / raised surface */
  --color-neutral-100: #f1f5f9;   /* input background, card background */
  --color-neutral-200: #e2e8f0;   /* borders, dividers */
  --color-neutral-300: #cbd5e1;   /* disabled border */
  --color-neutral-400: #94a3b8;   /* placeholder, disabled text */
  --color-neutral-500: #64748b;   /* secondary text */
  --color-neutral-600: #475569;   /* body text */
  --color-neutral-700: #334155;   /* heading text */
  --color-neutral-800: #1e293b;   /* primary text */
  --color-neutral-900: #0f172a;   /* high-contrast text */

  /* ─── Colour: Status — Success / Green ─── */
  --color-success-50:  #f0fdf4;
  --color-success-100: #dcfce7;
  --color-success-500: #22c55e;   /* success dot, 2xx badge background tint */
  --color-success-600: #16a34a;   /* success dot border, 2xx text */
  --color-success-700: #15803d;

  /* ─── Colour: Status — Warning / Amber ─── */
  --color-warning-50:  #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-500: #f59e0b;   /* warning dot, 4xx badge background tint */
  --color-warning-600: #d97706;
  --color-warning-700: #b45309;

  /* ─── Colour: Status — Danger / Red ─── */
  --color-danger-50:   #fef2f2;
  --color-danger-100:  #fee2e2;
  --color-danger-500:  #ef4444;   /* error dot, 5xx badge, DELETE method */
  --color-danger-600:  #dc2626;
  --color-danger-700:  #b91c1c;

  /* ─── Colour: Status — Neutral / Grey ─── */
  --color-muted-dot:   #94a3b8;   /* unchecked health dot */

  /* ─── Colour: HTTP Method Badges ─── */
  --color-method-get-bg:     #dbeafe;   /* blue-100 */
  --color-method-get-text:   #1d4ed8;   /* blue-700 */
  --color-method-post-bg:    #dcfce7;   /* green-100 */
  --color-method-post-text:  #15803d;   /* green-700 */
  --color-method-put-bg:     #fef3c7;   /* amber-100 */
  --color-method-put-text:   #b45309;   /* amber-700 */
  --color-method-patch-bg:   #ede9fe;   /* violet-100 */
  --color-method-patch-text: #6d28d9;   /* violet-700 */
  --color-method-delete-bg:  #fee2e2;   /* red-100 */
  --color-method-delete-text:#b91c1c;   /* red-700 */
  --color-method-options-bg: #f1f5f9;   /* neutral-100 */
  --color-method-options-text:#475569;  /* neutral-600 */

  /* ─── Colour: Workflow Action Type Badges ─── */
  --color-action-respond-bg:       #dbeafe;
  --color-action-respond-text:     #1d4ed8;   /* blue */
  --color-action-kafka-bg:         #ffedd5;
  --color-action-kafka-text:       #c2410c;   /* orange */
  --color-action-http-bg:          #ede9fe;
  --color-action-http-text:        #6d28d9;   /* violet */
  --color-action-proxy-bg:         #ccfbf1;
  --color-action-proxy-text:       #0f766e;   /* teal */
  --color-action-delay-bg:         #f1f5f9;
  --color-action-delay-text:       #475569;   /* neutral */
  --color-action-log-bg:           #dcfce7;
  --color-action-log-text:         #15803d;   /* green */

  /* ─── Colour: Save State ─── */
  --color-save-saved-dot:    #22c55e;   /* green */
  --color-save-unsaved-dot:  #f59e0b;   /* amber */
  --color-save-saving-dot:   #3b82f6;   /* blue (animated) */
  --color-save-error-dot:    #ef4444;   /* red */

  /* ─── Spacing Scale ─── */
  /* Base unit: 4px. Names map to multiples. */
  --space-0:    0px;
  --space-0-5:  2px;
  --space-1:    4px;
  --space-1-5:  6px;
  --space-2:    8px;
  --space-3:    12px;
  --space-4:    16px;
  --space-5:    20px;
  --space-6:    24px;
  --space-8:    32px;
  --space-10:   40px;
  --space-12:   48px;
  --space-16:   64px;
  --space-20:   80px;

  /* ─── Typography ─── */
  --font-family-sans:  'Inter', system-ui, -apple-system, sans-serif;
  --font-family-mono:  'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* Font sizes — rem units */
  --text-xs:   0.75rem;    /* 12px */
  --text-sm:   0.875rem;   /* 14px */
  --text-base: 1rem;       /* 16px */
  --text-lg:   1.125rem;   /* 18px */
  --text-xl:   1.25rem;    /* 20px */
  --text-2xl:  1.5rem;     /* 24px */
  --text-3xl:  1.875rem;   /* 30px */

  /* Font weights */
  --font-normal:   400;
  --font-medium:   500;
  --font-semibold: 600;
  --font-bold:     700;

  /* Line heights */
  --leading-tight:  1.25;
  --leading-snug:   1.375;
  --leading-normal: 1.5;
  --leading-relaxed:1.625;

  /* ─── Border Radius ─── */
  --radius-sm:   4px;    /* inputs, small badges */
  --radius-md:   6px;    /* buttons, cards */
  --radius-lg:   8px;    /* modals, larger cards */
  --radius-xl:   12px;   /* wizard steps, feature panels */
  --radius-full: 9999px; /* pills, dots */

  /* ─── Shadows ─── */
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.08);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.10), 0 8px 10px -6px rgb(0 0 0 / 0.10);

  /* ─── Z-Index Scale ─── */
  --z-base:    0;
  --z-raised:  10;    /* floating labels, drag previews */
  --z-sticky:  20;    /* sticky header / toolbar */
  --z-overlay: 30;    /* drawer backdrop */
  --z-drawer:  40;    /* right-side drawer */
  --z-modal:   50;    /* modal dialog */
  --z-toast:   60;    /* toast notifications (future) */

  /* ─── Transitions ─── */
  --transition-fast:   100ms ease;
  --transition-normal: 150ms ease;
  --transition-slow:   250ms ease;

  /* ─── Layout ─── */
  --sidebar-width: 250px;
  --header-height: 48px;
}
```

---

## 2. Component Library

### 2.1 Button

The fundamental interactive element. All Button variants share the same height and padding; only colour and border change.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger' \| 'icon'` | No | `'primary'` | Visual style |
| `size` | `'sm' \| 'md' \| 'lg'` | No | `'md'` | Controls height and padding |
| `disabled` | `boolean` | No | `false` | Prevents interaction, dims appearance |
| `loading` | `boolean` | No | `false` | Shows spinner, prevents double-submit |
| `icon` | `string` | No | — | Material icon name placed left of label (e.g. `'add'`); or only content for `icon` variant |
| `iconPosition` | `'left' \| 'right'` | No | `'left'` | Side of the label for the icon |
| `type` | `'button' \| 'submit' \| 'reset'` | No | `'button'` | HTML button type |
| `@Output() clicked` | `EventEmitter<void>` | No | — | Emits on click |
| `ariaLabel` | `string` | Conditional | — | Required when `variant='icon'` and no projected label |
| — | `<ng-content>` | — | — | Label text; omit for icon-only |

#### Size Dimensions

| Size | Height | Horizontal padding | Font size | Icon size |
|---|---|---|---|---|
| `sm` | 28px | `var(--space-3)` 12px | `var(--text-xs)` | 14px |
| `md` | 36px | `var(--space-4)` 16px | `var(--text-sm)` | 16px |
| `lg` | 44px | `var(--space-6)` 24px | `var(--text-base)` | 18px |

#### Variants

**primary** — filled, high emphasis.
```
bg: --color-primary-500
text: white
border: none
hover bg: --color-primary-600
active bg: --color-primary-700
disabled bg: --color-neutral-300 / text: --color-neutral-400
```

**secondary** — outlined, medium emphasis.
```
bg: white
text: --color-neutral-700
border: 1px solid --color-neutral-300
hover bg: --color-neutral-50 / border: --color-neutral-400
active bg: --color-neutral-100
disabled: opacity 0.5
```

**ghost** — no border, low emphasis.
```
bg: transparent
text: --color-neutral-600
border: none
hover bg: --color-neutral-100
active bg: --color-neutral-200
disabled: opacity 0.4
```

**danger** — filled red, destructive actions only.
```
bg: --color-danger-600
text: white
border: none
hover bg: --color-danger-700
active bg: --color-danger-700 (slightly darker shadow)
disabled: opacity 0.5
```

**icon** — square, ghost-style. Use when the button contains only an icon.
```
width == height (size-determined)
padding: --space-2
bg: transparent
hover bg: --color-neutral-100
No label visible. aria-label is mandatory.
```

#### Visual States

| State | Visual change |
|---|---|
| Default | Base colours above |
| Hover | Darker background (see per-variant above); cursor: pointer |
| Focus | `outline: 2px solid var(--color-primary-500); outline-offset: 2px` |
| Active / pressed | Slightly darker than hover |
| Disabled | `opacity: 0.5`; `cursor: not-allowed`; pointer events none |
| Loading | Replace icon/label with a 16px spinner (CSS animation); same colours; pointer events none |

#### ASCII Sketch

```
Primary md:
┌─────────────────────┐
│  ▷  Save changes    │   height: 36px
└─────────────────────┘
  ^icon ^label

Icon-only sm:
┌────┐
│ ✕  │   28 × 28px
└────┘
```

---

### 2.2 Input

Single-line text field. Supports label, hint, error, prefix/suffix adornments.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `string` | Yes | — | Links label htmlFor |
| `label` | `string` | No | — | Visible label above the field |
| `placeholder` | `string` | No | — | Ghost text inside empty field |
| `value` | `string` | Yes | — | Controlled value |
| `@Output() valueChange` | `EventEmitter<string>` | Yes | — | Emits on every keystroke (use with `[(value)]` two-way binding) |
| `type` | `'text' \| 'number' \| 'password' \| 'url' \| 'email'` | No | `'text'` | HTML input type |
| `disabled` | `boolean` | No | `false` | Read-only + dimmed |
| `error` | `string` | No | — | Error message; triggers red border + message below |
| `hint` | `string` | No | — | Helper text below field (grey, smaller) |
| `prefixIcon` | `string` | No | — | Material icon name shown inside the left edge |
| `suffixIcon` | `string` | No | — | Material icon name shown inside the right edge |
| `readOnly` | `boolean` | No | `false` | Prevents editing; shows slightly dimmed background |
| `autoFocus` | `boolean` | No | `false` | Focus on mount via `cdkFocusInitial` |
| `@Output() keydown` | `EventEmitter<KeyboardEvent>` | No | — | Key events forwarded from the native input |

#### Visual States

| State | Visual |
|---|---|
| Default | `border: 1px solid var(--color-neutral-300)`; `bg: white`; `radius: var(--radius-sm)` |
| Hover | `border-color: var(--color-neutral-400)` |
| Focus | `border-color: var(--color-primary-500)`; `box-shadow: 0 0 0 3px var(--color-primary-100)` |
| Error | `border-color: var(--color-danger-500)`; error text below in `--color-danger-600` |
| Disabled | `bg: var(--color-neutral-100)`; `color: var(--color-neutral-400)`; `cursor: not-allowed` |
| Read-only | `bg: var(--color-neutral-50)`; no hover/focus ring |

#### ASCII Sketch

```
Label text                         ← var(--text-sm), --color-neutral-700, mb: --space-1
┌─────────────────────────────────┐
│ 🔍  placeholder text            │   height: 36px (md), border-radius: --radius-sm
└─────────────────────────────────┘
  Hint text below in grey           ← var(--text-xs), --color-neutral-500

Error state:
┌─────────────────────────────────┐
│ bad value                       │   border: 1px solid --color-danger-500
└─────────────────────────────────┘
  ⚠ Port is already in use          ← --color-danger-600, --text-xs
```

---

### 2.3 Textarea

Multi-line text input. Identical behaviour to Input except it is resizable and has a fixed minimum height.

#### Inputs & Outputs

All Input props except `type`, `prefix`, `suffix`. Additionally:

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `rows` | `number` | No | `4` | Minimum visible rows |
| `resize` | `'none' \| 'vertical' \| 'both'` | No | `'vertical'` | CSS resize property |
| `monospace` | `boolean` | No | `false` | Applies `--font-family-mono` |

Visual states are identical to Input.

---

### 2.4 Select / Dropdown

Used for single-select and multi-select scenarios. Implemented as a custom dropdown (not a native `<select>`) to support rich option content (icons, badges, grouping).

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `string` | Yes | — | Links label |
| `label` | `string` | No | — | Visible label above |
| `options` | `Option[]` | Yes | — | List of selectable items |
| `value` | `string \| string[]` | Yes | — | Selected ID(s) |
| `@Output() valueChange` | `EventEmitter<string \| string[]>` | Yes | — | Emits when selection changes (use with `[(value)]`) |
| `multi` | `boolean` | No | `false` | Allow multiple selection (`MatSelect[multiple]`) |
| `searchable` | `boolean` | No | `false` | Show filter input inside open dropdown |
| `placeholder` | `string` | No | `'Select...'` | Text when nothing is selected |
| `disabled` | `boolean` | No | `false` | — |
| `error` | `string` | No | — | Error message |
| `hint` | `string` | No | — | Helper text |
| `groups` | `boolean` | No | `false` | Render options with `mat-optgroup` headers |
| `maxHeight` | `number` | No | `240` | Max height of open list in px (via `panelClass`) |

#### Option Type

```ts
interface Option {
  id: string;
  label: string;
  description?: string;    // secondary text below label
  icon?: string;           // Material icon name shown left of label
  badge?: string;          // short text badge shown right of label
  disabled?: boolean;
  group?: string;          // group header label when groups=true
}
```

#### Visual States

Trigger (closed):
- Same appearance as Input: bordered, 36px high, arrow icon on the right.
- Multi-select: selected items shown as small Pills inside the trigger before the arrow. Overflows truncate to "N selected".

Dropdown (open):
- `bg: white`; `border: 1px solid var(--color-neutral-200)`; `shadow: var(--shadow-lg)`; `radius: var(--radius-md)`
- Options: 32px row height; hover `bg: var(--color-neutral-50)`.
- Selected option: `bg: var(--color-primary-50)`; checkmark icon on right.
- Group headers: `text-xs`, `font-semibold`, `color: --color-neutral-500`, not interactive.
- Searchable: filter input pinned at top of open list.

Focus on trigger: same focus ring as Input.
Disabled: same as Input disabled.

---

### 2.5 Badge / Pill

Small label for categorical data. Used for HTTP method, status codes, action types, module types, and "Used by N" counts.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `variant` | `'method' \| 'status' \| 'action' \| 'type' \| 'count' \| 'custom'` | No | `'custom'` | Preset colour scheme |
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'PATCH' \| 'DELETE' \| 'OPTIONS'` | Conditional | — | Required when variant='method' |
| `status` | `number` | Conditional | — | HTTP status code; required when variant='status' |
| `action` | `'respond' \| 'kafka_publish' \| 'http_request' \| 'proxy' \| 'delay' \| 'log'` | Conditional | — | Required when variant='action' |
| `label` | `string` | No | — | Text to display (overrides auto-label for method/status/action) |
| `color` | `string` | No | — | Background CSS colour for variant='custom' |
| `textColor` | `string` | No | — | Text CSS colour for variant='custom' |
| `size` | `'sm' \| 'md'` | No | `'md'` | Controls padding and font size |
| `removable` | `boolean` | No | `false` | Show × button; fires `onRemove` |
| `onRemove` | `() => void` | Conditional | — | Required when removable=true |

#### Size Dimensions

| Size | Height | H-Padding | Font |
|---|---|---|---|
| `sm` | 18px | 6px | `--text-xs` |
| `md` | 22px | 8px | `--text-xs` (bold) |

All badges: `border-radius: var(--radius-full)`, `font-weight: var(--font-semibold)`, `text-transform: uppercase` for method/action variants.

#### Colour Mapping

**method variant** — reads from `--color-method-{method}-bg` and `--color-method-{method}-text`.

**status variant** — derived from status range:
- 2xx: `--color-success-100` bg, `--color-success-700` text
- 3xx: `--color-primary-100` bg, `--color-primary-700` text
- 4xx: `--color-warning-100` bg, `--color-warning-700` text
- 5xx: `--color-danger-100` bg, `--color-danger-700` text

**action variant** — reads from `--color-action-{action}-bg` and `--color-action-{action}-text`.

**type variant** (module type: kafka, http) — same orange/purple as action kafka/http.

**count variant** — `bg: --color-neutral-100`, `text: --color-neutral-600`.

#### ASCII Sketch

```
Method:    ┌──────┐   Status:   ┌─────┐   Removable:  ┌───────────┐
           │ GET  │             │ 200 │                │ Service A × │
           └──────┘             └─────┘                └───────────┘
            blue                 green
```

---

### 2.6 Card

Container component. Used for module cards, response block cards, and content sections.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `interactive` | `boolean` | No | `false` | Adds hover treatment + cursor pointer |
| `@Output() cardClick` | `EventEmitter<void>` | No | — | Emits when card is clicked (sets `interactive` implicitly) |
| — | `<ng-content>` | — | — | Card body content |
| `selected` | `boolean` | No | `false` | Highlights card with primary left border |
| `disabled` | `boolean` | No | `false` | Dims; pointer-events none |
| `padding` | `'sm' \| 'md' \| 'lg'` | No | `'md'` | Internal padding level |

#### Visual States

| State | Visual |
|---|---|
| Default | `bg: white`; `border: 1px solid var(--color-neutral-200)`; `border-radius: var(--radius-lg)`; `shadow: var(--shadow-sm)` |
| Interactive hover (`interactive=true`) | `border-color: var(--color-neutral-300)`; `shadow: var(--shadow-md)`; `cursor: pointer` |
| Selected | `border-left: 3px solid var(--color-primary-500)`; left padding adjusted to compensate |
| Disabled | `opacity: 0.6`; `cursor: not-allowed` |

Padding values: `sm` = 12px; `md` = 16px; `lg` = 24px.

#### ASCII Sketch

```
┌─────────────────────────────────────┐  ← 1px border, --radius-lg
│  Card title                  badge  │  ← --space-4 padding
│  Secondary text                     │
│  ...                                │
└─────────────────────────────────────┘
```

---

### 2.7 StatusDot

A coloured circle indicating live health or save state. The `checking` state pulses.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | `'healthy' \| 'unhealthy' \| 'checking' \| 'unchecked'` | Yes | — | Determines colour and animation |
| `pulse` | `boolean` | No | `true` when `status='checking'` | CSS pulse ring animation |
| `size` | `'sm' \| 'md'` | No | `'md'` | — |
| `label` | `string` | No | — | Tooltip text on hover (via `title`) |

#### Size

| Size | Diameter |
|---|---|
| `sm` | 8px |
| `md` | 10px |

#### Colour and Animation

| Status | Colour | Animation |
|---|---|---|
| `healthy` | `--color-success-500` | None |
| `unhealthy` | `--color-danger-500` | None |
| `checking` | `--color-warning-500` | CSS keyframe scale+opacity ring radiating outward, 1.5s loop |
| `unchecked` | `--color-muted-dot` | None |

Pulse animation:
```css
@keyframes status-pulse {
  0%   { transform: scale(1);   opacity: 1; }
  70%  { transform: scale(2.5); opacity: 0; }
  100% { transform: scale(1);   opacity: 0; }
}
/* Applied to a ::after pseudo-element matching the dot's colour */
```

#### ASCII Sketch

```
●  healthy (green)
●  unhealthy (red)
⊙  checking (amber, pulsing ring)
●  unchecked (grey)
```

---

### 2.8 Modal / Dialog

Full-screen overlay with a centred dialog box. Used for wizards, confirmations, and pickers.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | `string` | Yes | — | Dialog heading |
| `description` | `string` | No | — | Subtitle or context text below title |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | No | `'md'` | Dialog width |
| `closeOnBackdrop` | `boolean` | No | `true` | Whether clicking the backdrop dismisses the dialog |
| `showClose` | `boolean` | No | `true` | Whether the × button is shown in the header |
| `@Output() closed` | `EventEmitter<void>` | Yes | — | Emits on backdrop click and Escape key |
| — | `<ng-content>` | — | — | Dialog body content |
| — | `<ng-content select="[mb-dialog-footer]">` | — | — | Pinned footer row (typically action buttons) |

> **Usage:** Open via `MatDialog.open(MbDialogComponent, { data: { title, ... } })`. `closed` output maps to `MatDialogRef.afterClosed()`. Visibility is controlled by `MatDialog`, not an `open` input.

#### Size Widths

| Size | Max Width |
|---|---|
| `sm` | 400px |
| `md` | 560px |
| `lg` | 720px |
| `xl` | 900px |

#### Layout and Visual

```
┌──────────────── overlay (rgba 0,0,0,0.4, z-index: --z-modal) ──────┐
│                                                                     │
│   ┌──────────────────────────────────────────┐                     │
│   │  Dialog title                         ×  │  ← header 48px      │
│   │  Description text (optional)             │    border-bottom     │
│   ├───────────────────────────────────────── ┤                     │
│   │                                          │  ← scrollable body  │
│   │  {children}                              │    max-height 70vh   │
│   │                                          │                     │
│   ├──────────────────────────────────────────┤                     │
│   │  {footer}              [Cancel] [Confirm]│  ← footer 56px      │
│   └──────────────────────────────────────────┘    border-top       │
│      radius: --radius-xl, shadow: --shadow-xl                      │
└─────────────────────────────────────────────────────────────────────┘
```

Enter/exit animation: `opacity` 0→1 and `scale` 0.97→1 over `--transition-slow`.
Backdrop fades in simultaneously.
Escape closes the modal (calls `onClose`) unless `closeOnBackdrop` is false.
Focus trap: Tab cycles only within the dialog while open.
Body scroll locked while open.

---

### 2.9 Drawer

Slides in from the right edge of the viewport. Used for the request log entry detail panel. The backdrop dims the page content but does not block interaction with the sidebar.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `open` | `boolean` | Yes | — | Controls `MatDrawer.opened` |
| `title` | `string` | Yes | — | Drawer heading |
| `width` | `number \| string` | No | `560` | Drawer width in px or CSS value |
| `showClose` | `boolean` | No | `true` | Header × button |
| `@Output() closed` | `EventEmitter<void>` | Yes | — | Emits on backdrop click and Escape |
| — | `<ng-content>` | — | — | Drawer body |
| — | `<ng-content select="[mb-drawer-footer]">` | — | — | Pinned bottom row |

#### Layout and Visual

```
┌─── backdrop (rgba 0,0,0,0.25, z-index: --z-overlay) ─────────────────────────┐
│                                                                               │
│                                         ┌──── drawer (z-index: --z-drawer) ──┤
│                                         │ Title                           ×  │
│                                         ├────────────────────────────────────┤
│                                         │                                    │
│   main content (dimmed)                 │  {children}                        │
│                                         │  (scrollable)                      │
│                                         │                                    │
│                                         ├────────────────────────────────────┤
│                                         │  {footer}                          │
│                                         └────────────────────────────────────┘
└───────────────────────────────────────────────────────────────────────────────┘
```

Animation: translate from `translateX(100%)` to `translateX(0)` in `--transition-slow`.
Backdrop opacity 0→0.25 simultaneously.
Drawer uses `position: fixed; top: 0; right: 0; height: 100vh`.
Body in drawer is `overflow-y: auto`.
No focus trap — the user may click outside to close.

---

### 2.10 Tabs

Horizontal tab strip for switching between related views within a page section.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `tabs` | `Tab[]` | Yes | — | Tab definitions |
| `activeTab` | `string` | Yes | — | ID of the selected tab |
| `@Output() activeTabChange` | `EventEmitter<string>` | Yes | — | Emits the ID when a tab is clicked (use with `[(activeTab)]`) |
| `size` | `'sm' \| 'md'` | No | `'md'` | Controls height and font size |

```ts
interface Tab {
  id: string;
  label: string;
  count?: number;     // shows a count pill next to the label
  disabled?: boolean;
}
```

#### Visual

The strip sits on a bottom border line. The active tab has a bottom border in primary colour.

```
  Default Response   Statements (3)   Log
  ─────────────────[══════════]────────────
                                           ← bottom border: --color-neutral-200
                    active tab bottom bar: 2px --color-primary-500
```

- Tab text: `--text-sm`, `--font-medium`, `--color-neutral-600`.
- Active tab text: `--color-neutral-800`, `--font-semibold`.
- Count pill: small Badge variant=count next to label text.
- Hover: `--color-neutral-50` background.
- Disabled: `opacity: 0.5`; pointer-events none.
- Height: `md` = 40px; `sm` = 32px.

---

### 2.11 DragHandle + Sortable List Row

Used to reorder statements within an endpoint and workflow steps within a statement.

#### DragHandle

A grabbable grip icon rendered as 2×3 dots (⠿ or custom SVG).

#### Inputs & Outputs (DragHandle)

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `disabled` | `boolean` | No | `false` | Removes grab affordance |

Visual: 16px × 20px; `color: --color-neutral-300`; on hover `--color-neutral-500`; `cursor: grab`; active `cursor: grabbing`. Applied via `cdkDragHandle` directive on the grip icon element.

#### SortableListRow

A row wrapper that uses Angular CDK `cdkDrag` directive. Wraps any arbitrary content.

#### Inputs & Outputs (SortableListRow)

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `string` | Yes | — | Unique identifier for CDK DnD tracking (`cdkDragData`) |
| `dragHandle` | `boolean` | No | `true` | Include `cdkDragHandle` grip on the left |
| `disabled` | `boolean` | No | `false` | Sets `[cdkDragDisabled]` for this row |
| — | `<ng-content>` | — | — | Row content |

While dragging:
- The dragged row shows `opacity: 0.5` in its original position (ghost).
- A solid clone follows the cursor.
- Drop target positions show a 2px primary blue line indicator between rows.

#### ASCII Sketch

```
⠿  Statement 1                             [toggle] [×]
⠿  Statement 2  ← active drag ghost
─── ← drop indicator (2px primary line)
⠿  Statement 3
```

---

### 2.12 Monaco Editor Wrapper

Wraps `@monaco-editor/react` with Mockingbird-specific configuration: language modes, template variable autocomplete, save binding, and the save button bar.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `value` | `string` | Yes | — | Current content |
| `@Output() valueChange` | `EventEmitter<string>` | Yes | — | Emits on every edit |
| `@Output() save` | `EventEmitter<string>` | Yes | — | Emits current value when Save button or Cmd/Ctrl+S is pressed |
| `language` | `'json' \| 'yaml' \| 'xml' \| 'plaintext'` | No | `'json'` | Monaco language mode |
| `readOnly` | `boolean` | No | `false` | Disables editing; hides save bar |
| `height` | `string \| number` | No | `'300px'` | Editor height |
| `templateVariables` | `string[]` | No | `[]` | Variable names to register for `{{...}}` autocomplete |
| `showSaveBar` | `boolean` | No | `true` | Show the save button bar below the editor |
| `dirty` | `boolean` | No | `false` | Controlled external unsaved state |
| `error` | `string` | No | — | Validation error message shown in the save bar |
| `saving` | `boolean` | No | `false` | Shows spinner on Save button |
| `label` | `string` | No | — | Optional label above the editor |

#### Layout

```
┌──────────────────────────────────────────────────────┐
│ label text (optional)                                │
├──────────────────────────────────────────────────────┤  ← Monaco editor
│  {                                                   │     border: 1px --color-neutral-200
│    "id": "{{request.path_param.id}}",                │     radius top: --radius-md
│    ...                                               │     min-height: height prop
│  }                                                   │
├──────────────────────────────────────────────────────┤  ← Save bar (when showSaveBar)
│  ⚠ Invalid JSON: Unexpected token at line 3          │     border: 1px --color-neutral-200
│                               [ Save (Cmd+S) ]       │     border-top: none
└──────────────────────────────────────────────────────┘     radius bottom: --radius-md
```

#### Save Bar Behaviour

- Save bar is always visible when `showSaveBar=true`.
- Save button: `variant='primary'`, `size='sm'`, label `Save`; `disabled` when `!dirty`; `loading` when `saving`.
- Secondary text shows keyboard shortcut hint: `Cmd+S` (macOS) or `Ctrl+S` (Windows/Linux).
- When `error` is set: red inline error message left-aligned in the save bar.
- `Cmd/Ctrl+S` inside the editor triggers `onSave` regardless of focus within the editor component.

#### Template Autocomplete

When `templateVariables` is provided, register a Monaco completion provider for the `{{` trigger. Available completions:
- Built-in: `request.method`, `request.path`, `request.path_param.*`, `request.query.*`, `request.header.*`, `request.body`, `request.body_json.*`, `now`, `uuid`.
- User-defined parameter set keys passed via `templateVariables`.
- Completion items show as `kind: Variable` in the Monaco suggestion list.

#### Unresolved Variable Decoration

After a successful render from TemplatePreview, variables that resolved to empty string are decorated with `inlineClassName: 'monaco-unresolved-var'` (red wavy underline via CSS). Clicking the decoration scrolls to and highlights that `{{...}}` span.

---

### 2.13 TemplatePreview Panel

A collapsible panel rendered below (or alongside) a Monaco editor when editing template content. Lets the developer fill in sample request values and see the rendered output.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `endpointPath` | `string` | Yes | — | E.g. `/payments/{id}` — used to extract path param names |
| `template` | `string` | Yes | — | Current template content from the Monaco editor |
| `onDecorateUnresolved` | `(vars: string[]) => void` | No | — | Called after render; used to trigger Monaco decorations |
| `collapsed` | `boolean` | No | `false` | Initial collapsed state |
| `onToggle` | `() => void` | No | — | Collapse/expand control callback |

#### Layout

The panel opens below the Monaco editor save bar. It is split horizontally at 50/50:

```
┌──────────────────────────────────────────────────────────┐
│  Template Preview                                   [▲]  │  ← collapse toggle
├────────────────────────────┬─────────────────────────────┤
│  Template (read-only echo) │  Rendered output            │
│  {                         │  {                          │
│    "id": "{{request.       │    "id": "42",              │
│      path_param.id}}",     │    "email":                 │
│    "email": "{{request.    │      "jane@example.com",    │
│      body_json.$.email}}", │    "at": "2026-06-30..."    │
│    "at": "{{now}}"         │  }                          │
│  }                         │                             │
│                            │  Unresolved: highlighted    │
│                            │  in red underline on left   │
├────────────────────────────┴─────────────────────────────┤
│  Sample request                                          │
│                                                          │
│  Path params                                             │
│    id  [ 42                    ]                         │
│                                                          │
│  Query params                                            │
│    [ key ]  [ value ]  [ + ]                             │
│                                                          │
│  Headers                                                 │
│    [ key ]  [ value ]  [ + ]                             │
│                                                          │
│  Body (JSON)                                             │
│  ┌───────────────────────────────────────────────────┐   │
│  │ { "email": "jane@example.com" }                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                             [ Render ▶ ] │
└──────────────────────────────────────────────────────────┘
```

Render button: `variant='secondary'`, `size='sm'`. Calls `POST /api/template/preview`. Shows spinner while in flight. On success: rendered JSON appears on the right in a read-only Monaco. Unresolved variables received from the API trigger red decorations on the left panel template echo.

Path param fields are auto-detected from `{paramName}` segments of `endpointPath`. Each renders as a labelled Input.

The sample request form is local to the session (not persisted).

---

### 2.14 ConditionBlock

A single row in the condition builder. Represents one leaf condition: field type, optional param name, operator, and value.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `condition` | `LeafCondition` | Yes | — | The condition data |
| `connector` | `'AND' \| 'OR' \| null` | No | `null` | Connector shown above this block (null for first block) |
| `@Output() conditionChange` | `EventEmitter<LeafCondition>` | Yes | — | Emits on any field change |
| `@Output() remove` | `EventEmitter<void>` | Yes | — | Emits when the × button is clicked |
| `@Output() connectorChange` | `EventEmitter<'AND' \| 'OR'>` | No | — | Emits when the AND/OR toggle is clicked |

```ts
interface LeafCondition {
  type: 'request.method' | 'request.path_param' | 'request.query_param'
      | 'request.header' | 'request.body_json' | 'request.body_xml'
      | 'request.body_raw' | 'request.count';
  param?: string;   // param name for path_param, query_param, header, body_json, body_xml
  op: 'equals' | 'not_equals' | 'contains' | 'not_contains'
    | 'matches_regex' | 'exists' | 'not_exists' | 'gt' | 'lt';
  value?: string;   // absent for exists / not_exists
}
```

#### Layout

```
┌────────────── condition block ──────────────────────────────────────────────┐
│  AND  ← connector pill (clickable to toggle AND/OR)                         │
│                                                                             │
│  [ request.path_param ▾ ]  [ id        ]  [ equals ▾ ]  [ 999        ]  × │
│   ↑ type select            ↑ param input  ↑ op select   ↑ value input      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Connector pill: `AND` / `OR` text; `bg: --color-primary-100`; `color: --color-primary-700`; `radius: --radius-full`; clicking toggles between AND and OR; calls `onConnectorChange`.

Field widths:
- Type select: 200px
- Param input: 120px (hidden when type has no param, e.g. `request.method`, `request.body_raw`, `request.count`)
- Operator select: 160px
- Value input: flex 1 (grows); hidden when op is `exists` or `not_exists`
- Remove button: icon variant, 28px

Operators shown per type:
- `request.method`: only `equals`, `not_equals`
- `request.count`: `equals`, `not_equals`, `gt`, `lt`
- `request.body_json`, `request.body_xml`: all operators
- All others: `equals`, `not_equals`, `contains`, `not_contains`, `matches_regex`, `exists`, `not_exists`

All field changes are structural saves (immediate API write) except the value input, which debounces 500ms.

At the bottom of the condition builder there are two buttons: `+ AND` and `+ OR`, which append a new ConditionBlock.

---

### 2.15 WorkflowActionCard

Represents a single action step in a workflow. Displays a type badge, drag handle, and an inline form specific to the action type.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | `WorkflowAction` | Yes | — | Action data |
| `@Output() actionChange` | `EventEmitter<WorkflowAction>` | Yes | — | Emits updated action on any field change |
| `@Output() remove` | `EventEmitter<void>` | Yes | — | Emits when × is clicked |
| `availableModules` | `Module[]` | No | `[]` | Filtered by matching type for module dropdown |
| `availableResponseBlocks` | `ResponseBlock[]` | No | `[]` | For respond action block picker |
| `availableParameterSets` | `ParameterSet[]` | No | `[]` | For respond template mode |
| `endpointPath` | `string` | Yes | — | Needed for TemplatePreview param detection |
| `isSyncZoneDivider` | `boolean` | No | `false` | Render the sync/async divider above this card |
| `isRespondMissing` | `boolean` | No | `false` | When true, show warning banner in place of divider |

#### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  ⠿  [respond]  ──────────────────────────────────────────────  [×]  │  ← header row
├──────────────────────────────────────────────────────────────────────┤
│  ○ Response block    ◉ Inline    ○ Template                          │  ← mode toggle (respond only)
│                                                                      │
│  Block: [ standard_200 ▾ ]   ← read-only body preview below         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ { "status": "ok" }                                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

For kafka_publish:
```
┌──────────────────────────────────────────────────────────────────────┐
│  ⠿  [kafka_publish]  ──────────────────────────────────────────  × │
├──────────────────────────────────────────────────────────────────────┤
│  Module  [ main-kafka ▾ ] (+ Create new module)                      │
│  Topic   [ payments.events        ]                                  │
│  Key     [ {{request.path_param.id}} ]                               │
│  Payload [Monaco editor]                                             │
│          [save bar]                                                  │
│          [TemplatePreview panel — collapsible]                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### Sync / Async Zone Divider

Rendered above the first action that comes after `respond`. It is a visual horizontal rule with centred label text:

```
─────────────────  ↑ RESPONSE SENT  ─────────────────
                   async actions below
```

Colour: `--color-neutral-300` for the line; `--color-neutral-500` for the text; `--text-xs`.

When no `respond` action exists:
```
┌─────────────────────────────────────────────────────┐
│  ⚠ No respond action — requests to this endpoint    │
│    will time out. Add a respond or proxy action.    │
└─────────────────────────────────────────────────────┘
```
Background: `--color-warning-50`; border: `1px solid --color-warning-200`; radius: `--radius-md`.

---

### 2.16 ModuleCard

A card in the module list view. Shows name, type, health, and a key config summary.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `module` | `ModuleSummary` | Yes | — | Module data |
| `health` | `'healthy' \| 'unhealthy' \| 'checking' \| 'unchecked'` | Yes | — | Live health status |
| `usedByCount` | `number` | No | `0` | Number of workflow steps referencing this module |
| `@Output() edit` | `EventEmitter<void>` | Yes | — | Emits when card is clicked — opens module editor drawer |
| `@Output() delete` | `EventEmitter<void>` | Yes | — | Emits delete intent; disabled when `usedByCount > 0` |

#### Layout

```
┌────────────────────────────────────────────────────────┐
│  ● (health dot)  Main Kafka Cluster    [kafka]  [× del]│
│  kafka:9092                                            │
└────────────────────────────────────────────────────────┘
```

- Health dot: `StatusDot` component, `size='sm'`, positioned left of the module name.
- Type badge: `Badge variant='type'`.
- Config summary line: `--text-xs`, `--color-neutral-500`. For Kafka: first broker address. For HTTP: base URL.
- Delete button: `Button variant='icon'` size='sm'`. Disabled (`cursor: not-allowed`) when `usedByCount > 0`; tooltip "Used by N workflow steps".

---

### 2.17 ServiceTreeItem

A single entry in the sidebar service tree. Can have children (Endpoints, Modules, Settings sub-nodes).

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `service` | `ServiceSummary` | Yes | — | Service name, port, ID |
| `expanded` | `boolean` | Yes | — | Bound to `MatExpansionPanel.expanded` |
| `orphanedCount` | `number` | No | `0` | Number of orphaned endpoints; shows orange `MatBadge` |
| `active` | `boolean` | No | `false` | Current page is within this service; adds primary left border |
| `@Output() toggle` | `EventEmitter<void>` | Yes | — | Emits on expand/collapse |
| — | `<ng-content>` | — | — | Child tree nodes (endpoints, sub-links) inside `MatExpansionPanel` |

#### Layout

```
▶  Payment Service :8081  ⚠         ← collapsed; orange ⚠ badge if orphanedCount > 0
                                     ← active: left border --color-primary-500

▼  Payment Service :8081             ← expanded
   ├─ Endpoints
   │   ├─ GET /payments/{id}  ●      ← endpoint sub-items with status dot
   │   ├─ POST /payments
   │   └─ ⚠ Orphaned (1)            ← collapsible orphaned section with orange indicator
   ├─ Modules
   └─ Settings
```

Tree item dimensions: 32px row height; `--text-sm`; `--font-medium` for service name; indent 12px per level.

Active item: `bg: --color-primary-50`; `border-left: 2px solid --color-primary-500`; `padding-left` adjusted.
Hover: `bg: --color-neutral-100`.

Port badge: small `Badge variant='custom'` with `bg: --color-neutral-100`, `text: --color-neutral-600`.

Endpoint sub-items:
- StatusDot (`sm`) indicates: green = has statements active, grey = serving default only, amber = orphaned.
- Orphaned items: `text-decoration: line-through`; `color: --color-neutral-400`.

---

### 2.18 FilterChip

Represents an active filter in the Request Log toolbar. Removable.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `label` | `string` | Yes | — | Filter description, e.g. "Service: Payment" |
| `color` | `string` | No | — | Optional accent colour for the left border |
| `@Output() remove` | `EventEmitter<void>` | Yes | — | Emits when × is clicked; parent removes the filter |

#### Visual

```
┌─────────────────────┐
│  Service: Payment ×  │   height: 24px; radius: --radius-full
└─────────────────────┘   bg: --color-neutral-100; border: 1px --color-neutral-200
                          font: --text-xs; color: --color-neutral-700
                          × button: ghost icon 16px; hover --color-danger-500
```

Rendered in a flex-wrap row below the filter toolbar. `Clear all` text link at the end of the chip row calls `onClearAll`.

---

### 2.19 SaveStateIndicator

Header component showing the current save state across all open editors.

#### Inputs & Outputs

| Input/Output | Type | Required | Default | Description |
|---|---|---|---|---|
| `status` | `'saved' \| 'unsaved' \| 'saving' \| 'error'` | Yes | — | Current state from the Angular `SaveStateService` |
| `error` | `string` | No | — | Error message for `status='error'` |

#### Visual and Labels

| Status | Dot colour | Label text | Label colour |
|---|---|---|---|
| `saved` | `--color-save-saved-dot` (green) | "Saved" | `--color-neutral-500` |
| `unsaved` | `--color-save-unsaved-dot` (amber) | "Unsaved changes" | `--color-warning-600` |
| `saving` | `--color-save-saving-dot` (blue, spin) | "Saving…" | `--color-neutral-500` |
| `error` | `--color-save-error-dot` (red) | "Save failed" | `--color-danger-600` |

Layout: horizontally arranged `StatusDot` + label text. Right-aligned in the global header.

For `status='error'`: the error message string appears below the label in `--text-xs`, `--color-danger-600`, wrapping over up to two lines. Positioned as an absolute popover anchored below the indicator so it doesn't push header content.

For `status='saving'`: the StatusDot animates a continuous rotation (spinner style) rather than the health pulse.

```
Header:
┌────────────────────────────────────────────────────────────────────────────────┐
│  🐦 Mockingbird                                           ● Unsaved changes    │
└────────────────────────────────────────────────────────────────────────────────┘
                                                            ↑ SaveStateIndicator
```

---

## 3. Screen-Level Specs

### App Shell

**Layout grid:**

```
┌──────────────── 100vw ─────────────────────────────────┐
│  Header (height: --header-height = 48px, z-index: --z-sticky)          │
│  bg: white; border-bottom: 1px --color-neutral-200; shadow: --shadow-sm│
├──────────────────────────────────────────────────────────────────────│
│ Sidebar           │ Main content area                                  │
│ (width: 250px)    │ (flex: 1; overflow-y: auto; padding: 0)            │
│ bg: --neutral-50  │ bg: --neutral-0                                    │
│ border-right:     │                                                    │
│  1px --neutral-200│                                                    │
│ overflow-y: auto  │                                                    │
│ position: fixed   │                                                    │
│ height: 100vh     │                                                    │
│ top: --header-h   │                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Main content area `margin-left: 250px; padding-top: --header-height`.

Sidebar sections:
1. **Services** — `ServiceTreeItem` list; `+ Add Service` button at bottom of section.
2. Divider line.
3. **Modules** — link to global modules page; shows count of configured modules.
4. **Response Blocks** — link; shows count.
5. **Request Log** — link; shows a live entry count badge (updates via WebSocket).
6. **Settings** — link to global settings.

---

### 3.1 Empty State (First Launch, No Services)

Shown in the main content area when `GET /api/services` returns an empty array.

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│              🐦  (hero illustration)                 │
│                                                      │
│          No services configured                      │
│          ──────────────────────                      │
│  Point Mockingbird at an OpenAPI spec to spin up     │
│  your first mock server in seconds.                  │
│                                                      │
│              [ + Add your first service ]            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

- Centred vertically in the main content area.
- Hero text: `--text-2xl`, `--font-semibold`, `--color-neutral-700`.
- Body text: `--text-base`, `--color-neutral-500`, max-width 400px.
- CTA button: `variant='primary'`, `size='lg'`. Opens the Add Service wizard.

---

### 3.2 Add Service Wizard

Three-step modal (`size='lg'`). Step indicator at the top. Back / Next / Create buttons in the footer.

#### Step Indicator

```
  ① Basic info  ──────  ② Spec source  ──────  ③ Review
  (active)               (future)               (future)
```

Active step: filled circle + bold label. Completed steps: filled circle with checkmark. Future steps: empty circle + grey label. Connecting lines: `1px --color-neutral-200`.

#### Step 1 — Basic Info

```
┌───────────────────────────────────────────────────────────────┐
│  Service name                                                 │
│  [ Payment Service                  ]                         │
│                                                               │
│  Port                                                         │
│  [ 8081  ]                                                    │
│  Ports 1024–65535. Must not be in use by another service.     │
│                                                               │
└──────────────────────────────────── [Cancel]  [Next →]        │
```

Validation on "Next" click:
- Name: required, unique (checked against existing service names from API).
- Port: 1024–65535; not already in the config. Shows inline error if taken.

#### Step 2 — Spec Source

Radio group with three options. Only one is expanded at a time (the selected one).

```
┌───────────────────────────────────────────────────────────────┐
│  How do you want to provide the OpenAPI spec?                 │
│                                                               │
│  ◉  URL                                                       │
│     Fetch from a remote URL                                   │
│     [ https://...                                         ]   │
│     Headers (optional)                                        │
│       [ Authorization  ]  [ Bearer ${TOKEN}  ]  [ + ]        │
│     Refresh every [ 60 ] seconds                              │
│     [ Test connection ]  ✓ 34 endpoints found                 │
│                                                               │
│  ○  Upload file                                               │
│     Upload a .json or .yaml OpenAPI spec file                 │
│                                                               │
│  ○  Upload & host                                             │
│     Same as Upload; also serves the spec at                   │
│     GET /mockingbird/specs/{service-id}                       │
│                                                               │
└────────────────────────────── [← Back]  [Next →]             │
```

For Upload options: drag-and-drop zone with dashed border `2px dashed --color-neutral-300`. On drag-over: `border-color: --color-primary-400; bg: --color-primary-50`. On file drop: validate client-side; show success "42 endpoints parsed" or error "Not a valid OpenAPI 2 or 3 spec".

Test Connection button on URL option: `variant='secondary'`. See [Section 4.6](#46-test-connection-button-states) for state machine.

#### Step 3 — Review

```
┌───────────────────────────────────────────────────────────────┐
│  Review your new service                                      │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  Name:         Payment Service                       │     │
│  │  Port:         8081                                  │     │
│  │  Spec source:  URL (https://example.com/api-docs)    │     │
│  │  Endpoints:    34 detected                           │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                               │
└──────────────────────────── [← Back]  [Create service]        │
```

"Create service" button: `variant='primary'`. On click: calls `POST /api/services`; button enters loading state. On success: close modal, navigate sidebar to new service, show "Service created" inline success. On error: show error text below the button.

---

### 3.3 Service Settings Page

Main content area for a single service. URL: `/services/{id}/settings`.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Payment Service                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  Spec source                                                         │
│  Type: URL                                                           │
│  URL:  https://internal.example.com/payments/v1/api-docs             │
│  Last fetched: 2 minutes ago                         [Refresh now]   │
│  Next refresh: in 58 seconds                                         │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  CORS                                                                │
│  Enabled  [toggle: on]                                               │
│  Allow origins  [ * ]                                                │
│  Allow methods  [ * ]                                                │
│  Allow headers  [ * ]                                                │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  Proxy                                                               │
│  Enabled  [toggle: off]                                              │
│  Target URL  [ disabled; enable proxy to edit ]                      │
│  Forward headers  [toggle: on]                                       │
│  Timeout  [ 5000 ] ms                                                │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────  │
│  Danger zone                                                         │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Delete service                                              │   │
│  │  Removes all endpoints, statements, and workflows.           │   │
│  │                              [Delete "Payment Service"]      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Refresh now** button: `variant='secondary'`, `size='sm'`. Calls `POST /api/services/{id}/spec/refresh`. Enter loading state during fetch; on completion, "Last fetched" updates.
- **CORS toggles and inputs**: structural saves (immediate). Toggling "Enabled" off disables the fields below.
- **Proxy section**: toggle enables the section fields. Changes are structural saves.
- **Danger zone box**: `border: 1px solid --color-danger-200`; `bg: --color-danger-50`; `radius: --radius-lg`. Delete button: `variant='danger'`. Clicking opens a confirmation Modal (`size='sm'`) requiring the user to type the service name to confirm.

---

### 3.4 Endpoint List

Main content area showing all endpoints for a service. URL: `/services/{id}/endpoints`.

```
┌──────────────────────────────────────────────────────────────────┐
│  Payment Service — Endpoints                                     │
│                                                                  │
│  Live endpoints (32)                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [GET]   /payments/{id}         ●  2 statements          │   │
│  │  [POST]  /payments              ●  default only          │   │
│  │  [DELETE]/payments/{id}         ●  1 statement           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ▶  Orphaned (1)                                ← collapsible   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [GET]   /old-path/{id}  ⚠  ~~strikethrough~~            │   │
│  │                                    [Remap to…]           │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

Each endpoint row: 48px height; method Badge; path string in monospace; StatusDot on right; statement count text in grey; clickable to navigate to endpoint detail.

Orphaned section header: amber `⚠` icon + "Orphaned (N)" text; collapsible (default collapsed). Each orphaned row: path text struck-through, `--color-neutral-400`; "Remap to…" Button `variant='secondary'` `size='sm'` on the right.

Clicking "Remap to…" opens a Modal (`size='md'`) titled "Remap orphaned endpoint":

```
Orphaned:  GET /old-path/{id}
           ↓ Select replacement
[ GET /payments/{id}   ▾ ]  ← pre-selected with closest Levenshtein match
                                    [ Cancel ]  [ Remap ]
```

---

### 3.5 Endpoint Detail

Three-tab view for a single endpoint. URL: `/services/{id}/endpoints/{eid}`.

#### Header

```
[GET]  /payments/{id}     ●  Payment Service : 8081
```

Method badge + path in monospace + StatusDot + breadcrumb. Below: Tabs component with tabs: Default Response | Statements (N) | Log.

#### Tab: Default Response

```
Mode:  ◉ Response block    ○ Inline response

Block: [ standard_200 ▾ ]

Preview (read-only):
┌──────────────────────────────────────┐
│  Status:  200                        │
│  Body:    { "status": "ok" }         │
│  Delay:   0ms                        │
└──────────────────────────────────────┘
```

Switching to "Inline response":

```
Mode:  ○ Response block    ◉ Inline response

Status:  [ 200  ] (number input; quick-select chips: 200 201 204 400 401 403 404 500)

Headers
  [ Content-Type  ]  [ application/json  ]  [×]
  [ + Add header ]

Body
┌──── Monaco editor ────────────────────┐
│ { "status": "ok" }                    │
└───────────────────────────────────────┘
[ Save (Cmd+S) ]

Delay   [────●────────────] 0 ms   (range 0–5000, step 50; also accepts text input)
```

Mode toggle is a structural save. Body edits are content saves (explicit).

#### Tab: Statements

```
[+ Add statement]

⠿  [on]  ①  Return 404 for id=999       ← drag to reorder = priority order
           IF path_param id = 999
           Workflow: respond (not_found_404) → kafka_publish
                                      [Edit] [Duplicate] [×]

⠿  [off]  ②  Return templated response   ← disabled; dimmed
           IF query_param format = full
           Workflow: respond (template)
                                      [Edit] [Duplicate] [×]
```

Each statement row: 64px card with a DragHandle on the left; enable/disable toggle (immediate save); priority number; statement name; one-line condition summary; one-line workflow summary; action buttons.

"Edit" opens the statement editor (see Section 3.6) inline below the card (accordion) or navigates to a sub-route.

"+ Add statement" button: `variant='secondary'`, appends a new empty statement, opens its editor.

#### Tab: Log

Filtered view of the Request Log (Section 3.9) showing only entries for this endpoint. Same table and drawer, pre-filtered, with the endpoint filter chip locked.

---

### 3.6 Statement Editor

Appears as an expanded section under a statement card (accordion style), or at `/services/{id}/endpoints/{eid}/statements/{sid}`.

#### Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Statement name  [ Return 404 for id=999           ]                 │
│  ─────────────────────────────────────────────────────────────────   │
│  Condition                                                           │
│                                                                      │
│  IF  [ request.path_param ▾ ] [ id ] [ equals ▾ ] [ 999 ]  ×        │
│  AND [ request.header ▾ ]  [ X-Test ] [ exists ▾ ]          ×        │
│  [+ AND]   [+ OR]                                                    │
│                                                                      │
│  ─────────────────────────────────────────────────────────────────   │
│  Workflow                                                            │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ⠿  [delay]  ───────────────────────────────────────  [×]   │   │
│  │  Wait:  [ 100 ] ms                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ⠿  [respond]  ─────────────────────────────────────  [×]   │   │
│  │  ○ Block  ◉ Inline  ○ Template                               │   │
│  │  [monaco editor for inline body]                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ─────────────── ↑ RESPONSE SENT ─── async below ──────────────     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ⠿  [kafka_publish]  ────────────────────────────────  [×]  │   │
│  │  Module  [ main-kafka ▾ ]                                    │   │
│  │  Topic   [ payments.events      ]                            │   │
│  │  Payload [monaco + save bar]                                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [+ Add action]                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Name field: Input, saves on blur (structural).
- Condition area: stack of `ConditionBlock` components managed with Angular CDK `CdkDropList`.
- Workflow area: stack of `WorkflowActionCard` components managed with Angular CDK `CdkDropList`.
- `+ Add action` opens a small popover type picker: respond / kafka_publish / http_request / proxy / delay / log.

---

### 3.7 Module Configuration

Shared between `/modules` (global) and `/services/{id}/modules` (service-scoped).

#### Module List

Grid of `ModuleCard` components, 2 columns on wide screens, 1 on narrow.

```
[+ Add module]

┌──────────────────────┐  ┌──────────────────────┐
│ ● Main Kafka  [kafka] │  │ ● Audit Webhook [http]│
│ kafka:9092            │  │ audit.internal...     │
│                  [×] │  │                  [×] │
└──────────────────────┘  └──────────────────────┘
```

Clicking a card opens the module editor in a Drawer (Section 2.9) from the right.

#### Module Editor — Kafka

Rendered inside the Drawer:

```
┌─────────────────────────────────────────────────────────┐
│  Edit module                                         ×  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Name   [ Main Kafka Cluster                  ]         │
│  Type   [ Kafka ▾ ] (locked after creation)             │
│                                                         │
│  Brokers                                                │
│  [ kafka:9092                ]  [×]                     │
│  [+ Add broker]                                         │
│                                                         │
│  Authentication                                         │
│  [ SASL Plain ▾ ]                                       │
│  Username  [ ${KAFKA_USER}    ]                         │
│  Password  [ ${KAFKA_PASS}    ]                         │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│  [Test connection]   ● Connected to kafka:9092 (3 brokers)│
│                                                         │
├─────────────────────────────────────────────────────────┤
│                          [Cancel]  [Save]               │
└─────────────────────────────────────────────────────────┘
```

Auth options: None / SASL Plain / SASL SCRAM-256 / SASL SCRAM-512 / TLS. Fields below the auth picker change based on selection. TLS shows cert/key/CA file path fields.

#### Module Editor — HTTP

```
Name     [ Audit Webhook               ]
Type     [ HTTP ▾ ]

Base URL [ https://audit.internal.example.com ]

Default headers
  [ Authorization  ]  [ Bearer ${AUDIT_TOKEN}  ]  [×]
  [+ Add header]

Authentication
  [ Bearer token ▾ ]  (None / Bearer / Basic / API Key)

  (if Bearer)
  Token  [ ${AUDIT_TOKEN}  ]

Timeout  [ 3000 ] ms

─────────────────────────────────────────────────────────────
[Test connection]   ● 200 OK (42ms)

                    [Cancel]  [Save]
```

Test connection button states: see Section 4.6.

---

### 3.8 Response Block Library

Page at `/response-blocks`.

```
┌──────────────────────────────────────────────────────────────────┐
│  Response Blocks                          [+ New block]          │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐   │
│  │  Generic 200 OK  │  │  Generic 404     │  │  401 Unauth  │   │
│  │  [200]           │  │  [404]           │  │  [401]       │   │
│  │  {"status":"ok"} │  │  {"error":"not.. │  │  {"error":"u │   │
│  │  Used by 3       │  │  Used by 1       │  │  Used by 0   │   │
│  │  [Clone] [×]     │  │  [Clone] [×]     │  │  [Clone] [×] │   │
│  └──────────────────┘  └──────────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

Clicking a card opens the block editor below (accordion) or in a Drawer.

#### Block Editor

```
Name    [ Generic 200 OK         ]

Status  [ 200 ]   Quick-select: [200] [201] [204] [400] [401] [403] [404] [500]

Headers
  [ Content-Type  ]  [ application/json  ]  [×]
  [+ Add header]

Body
Language: [JSON ▾] [XML] [Text]
┌──── Monaco editor ─────────────────────────────────────────────┐
│ { "status": "ok" }                                              │
└─────────────────────────────────────────────────────────────────┘
[ Save (Cmd+S) ]

[Template Preview ▼]  ← collapsible; for blocks, sample request form shows generic fields

Delay   [────────────●] 500 ms
```

Delete button: disabled with "Used by N endpoints" tooltip when `usedBy > 0`. Clone copies the block with "Copy of" prepended to the name and opens the editor immediately.

---

### 3.9 Request Log

Page at `/log`.

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Request Log                           (●) Live   1000 / 1000   │
│                                                                  │
│  [ Service ▾ ]  [ Method ▾ ]  [ Status ▾ ]  [ Statement ▾ ]     │
│  [ Path contains...            ]               [Clear filters]   │
│                                                                  │
│  Active filters:  [Service: Payment ×]  [Method: GET ×]          │
│                                                                  │
│  ──────────────────────────────────────────────────────────────  │
│  Time        Service    Method  Path              Status Latency │
│  ──────────────────────────────────────────────────────────────  │
│  2s ago      Payment    [GET]   /payments/42      [200]   12ms   │
│  5s ago      Payment    [POST]  /payments         [201]   8ms    │
│  12s ago     Inventory  [GET]   /items            [404]   4ms    │
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘
```

"(●) Live" indicator: pulsing green dot when WebSocket is connected; amber when reconnecting; a count showing `N / max` entries in the buffer.

Log table: virtualised list (`react-virtual`) — rows are 48px. Method and Status columns use `Badge` components.

Time column: relative by default ("2s ago"); on hover shows absolute ISO 8601 via tooltip.

#### Entry Detail Drawer

Opens on row click. Width: 560px (see Section 2.9).

```
┌─────────────────────────────────────────────────────┐
│  GET /payments/42                                × │
├─────────────────────────────────────────────────────┤
│  Request  |  Response  |  Workflow Log              │  ← Tabs
├─────────────────────────────────────────────────────┤
│  (Request tab)                                      │
│  Method:   GET                                      │
│  Path:     /payments/42                             │
│  Matched:  "Return 404 for id=999"                  │
│                                                     │
│  Query params                                       │
│  (none)                                             │
│                                                     │
│  Headers                                            │
│  Authorization: Bearer eyJ...                       │
│                                                     │
│  Body (none)                                        │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Create statement from this request]               │  ← always visible
└─────────────────────────────────────────────────────┘
```

Response tab: Status code, headers table, body in read-only Monaco. If proxied, shows "Proxied to: https://real.example.com — 200 (38ms upstream)".

Workflow Log tab: ordered list of action results:
```
① delay — 100ms ✓
② respond — 404 not_found_404 ✓
③ kafka_publish — payments.events ✓ (async)
```
Each item: action Badge, description, duration, ✓/✕. On error: red ✕ with error message below.

"Create statement from this request" button: `variant='secondary'`, full-width, pinned above the drawer footer. See Section 4.4 for the full flow.

---

### 3.10 Global Settings

Page at `/settings`.

```
┌──────────────────────────────────────────────────────────────────┐
│  Settings                                                        │
│                                                                  │
│  Log retention                                                   │
│  Keep the last [ 1000 ] entries in memory (max 10000)            │
│                                                                  │
│  Log level                                                       │
│  [ Info ▾ ]   (debug / info / warn / error)                      │
│                                                                  │
│  UI port                                                         │
│  [ 9000 ]   (requires restart)                                   │
│                                                                  │
│                                              [ Save settings ]   │
└──────────────────────────────────────────────────────────────────┘
```

Settings are saved as a single batch on "Save settings" click (`PUT /api/settings`). Fields that require a restart show an amber note "Requires restart to take effect".

---

## 4. Interaction Patterns

This section documents shared interaction flows once, so they do not need to be re-specified per screen.

---

### 4.1 Two-Tier Save Model

The UI distinguishes between two classes of change.

#### Structural changes (immediate save)

Fires a PATCH/PUT API call on the spot. No save button required. Examples:
- Toggling a statement enabled/disabled.
- Reordering statements by drag-and-drop.
- Selecting a different response block from the dropdown.
- Adding or removing a workflow action step.
- Changing a Select field in a condition block.
- Toggling CORS enabled.

On success: no visual indication needed (change is already reflected in the UI).
On error: inline error message below the changed field; the field reverts to its previous value.

#### Content edits (explicit save)

Used for all Monaco editor fields (response body, Kafka payload, HTTP body, template body) and any multi-character input where a partially-typed value would be invalid YAML/JSON.

Save flow:
1. User edits the Monaco editor → `saveState.markUnsaved()` → header shows "Unsaved changes".
2. User presses **Save** button or `Cmd/Ctrl+S`.
3. Save button enters loading state; header shows "Saving…".
4. API call is made (`PUT /api/...`).
5a. On success: `saveState.markSaved()` → header shows "Saved".
5b. On 400 (validation error): inline error appears in the save bar; header shows "Save failed" + error message. File is not changed on disk.
5c. On network/server error: header shows "Save failed — Write error"; content preserved in editor.

#### External file change conflict

When the backend detects that `mockingbird.yaml` was edited externally while the user has unsaved edits:
- A banner appears at the top of the main content area:
  ```
  ┌──────────────────────────────────────────────────────────────┐
  │  ⚠  Config file changed externally. Your unsaved edits may  │
  │     conflict. Review before saving.    [View diff]  [Dismiss]│
  └──────────────────────────────────────────────────────────────┘
  ```
- "View diff" opens a Modal (`size='xl'`) with a Monaco diff editor comparing the on-disk version (left) and the unsaved UI version (right).
- The user can choose to keep their edits (Save), discard (Reload from file), or dismiss and deal with it later.

---

### 4.2 Drag-to-Reorder

Used for statements within an endpoint and workflow steps within a statement. Implemented with Angular CDK `CdkDropList` + `cdkDrag`.

**Visual behaviour:**
1. User grabs the DragHandle. Cursor changes to `grabbing`.
2. The dragged item becomes a floating clone following the cursor; the original slot shows a transparent placeholder at 50% opacity.
3. As the clone crosses other items, they animate to clear space (CSS `transition: transform 150ms ease`).
4. A 2px primary-blue line appears at the insertion point between items.
5. On drop: items shift to final positions. A PATCH reorder API call fires immediately (`PATCH /api/.../reorder`).
6. On API error: items snap back to their pre-drag order; inline error shown.

**Keyboard support:**
- Tab to focus a DragHandle; Enter or Space to pick up; arrow keys to move; Enter or Space to drop; Escape to cancel.

---

### 4.3 Inline Module Creation from a Workflow Step

Triggered when a `kafka_publish` or `http_request` WorkflowActionCard's Module dropdown contains no modules of the required type, or when the user selects `+ Create new module` at the bottom of the dropdown.

**Flow:**
1. User opens the Module dropdown in a WorkflowActionCard.
2. If no modules of the required type exist, the dropdown list body shows:
   ```
   No kafka modules configured.
   [+ Create new Kafka module]
   ```
3. Clicking opens the module editor in a Drawer (Section 2.9), sliding in from the right, covering the workflow editor.
4. The Drawer is pre-typed to the required module type (type field locked).
5. User fills in the module form and clicks Save.
6. Drawer closes; the new module is appended to the in-memory module list.
7. The WorkflowActionCard Module dropdown re-opens and auto-selects the newly created module.

The workflow editor behind the Drawer is not unmounted — it retains all state.

---

### 4.4 Create Statement from Log Entry

Triggered by the "Create statement from this request" button in the log entry detail Drawer.

**Flow:**
1. User finds a request in the log that they want to mock specifically.
2. User clicks **Create statement from this request**.
3. The UI calls `POST /api/services/{svcId}/endpoints/{eid}/statements` with a payload pre-populated from the log entry:
   - Condition blocks auto-generated for each path param, each non-empty query param, and the top-level keys of the JSON body (if present), all connected with AND.
   - Workflow: a single empty `respond` action.
4. On success: the log entry Drawer closes.
5. The UI navigates to the Statements tab of the relevant endpoint.
6. The new statement is appended at the bottom of the list, expanded in edit mode.
7. A notification bar appears at the top of the statement list:
   ```
   ┌──────────────────────────────────────────────────────────┐
   │  New statement pre-filled from log entry. Review the    │
   │  conditions below and add a workflow action.             │
   └──────────────────────────────────────────────────────────┘
   ```

The auto-generated conditions are always editable — the user should review and remove any they don't need.

---

### 4.5 Orphaned Endpoint Warning and Remap Flow

Triggered when Mockingbird detects that an endpoint with user-configured data no longer exists in the current spec.

**Discovery:**
- The service's `ServiceTreeItem` in the sidebar shows an orange `⚠` badge next to the service name.
- The Endpoint List (Section 3.4) shows an "Orphaned (N)" collapsible section at the bottom.

**Remap flow:**
1. User clicks **Remap to…** on an orphaned endpoint row.
2. A Modal (`size='md'`) opens with title "Remap orphaned endpoint".
3. The Modal body shows:
   - The orphaned endpoint path (read-only).
   - A searchable Select dropdown listing all current live endpoints in this service.
   - The closest-match endpoint by Levenshtein distance is pre-selected.
4. User selects the target endpoint and clicks **Remap**.
5. API call: `POST /api/services/{id}/endpoints/{orphanedEid}/remap` with `{ target_endpoint_id: "..." }`.
6. On success: Modal closes; the orphaned endpoint disappears from the list; the target endpoint now shows the transferred statement count.
7. The orange badge on the `ServiceTreeItem` is removed if no orphaned endpoints remain.

**Dismiss without remap:** The user can collapse the "Orphaned" section and continue. The orphaned data is preserved in config indefinitely until remapped or deleted.

---

### 4.6 Test Connection Button States

Used in the Add Service Wizard (URL spec source) and the Module Editor (Kafka, HTTP).

The button is a controlled state machine with four states:

| State | Button appearance | Inline result |
|---|---|---|
| `idle` | `[Test connection]` — `variant='secondary'`, `size='sm'` | None |
| `checking` | `[Testing…]` — same variant, `loading=true`, disabled | "Connecting…" grey text |
| `success` | `[Test connection]` — returned to idle appearance | ✓ Green success message (example: "● Connected to kafka:9092 (3 brokers)" or "● 200 OK (42ms)") |
| `error` | `[Test connection]` — returned to idle | ✕ Red error message (example: "Connection refused: kafka:9092") |

The success/error inline result sits immediately to the right of the button on the same line.

Success result colour: `--color-success-600`. Error result colour: `--color-danger-600`. Both use `--text-sm`.

The result clears when the user modifies any connection field (broker address, URL, auth settings). This prevents stale results from being misleading.

Clicking **Test connection** again from success/error state resets to `idle` then immediately enters `checking`.

For the **Add Service Wizard URL option**, success additionally shows the endpoint count: "✓ 34 endpoints found" — this value is stored in component state to populate Step 3's review summary.

`${ENV_VAR}` references in connection fields are resolved server-side before the test runs. The raw unresolved string is sent to the API, which resolves it from the Docker environment before executing the connection test.

---

*End of COMPONENTS.md*
