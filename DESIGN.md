# RVNP Portal design system

Basis: the portal's own brand (green, orange and navy already on the letterhead and sidebar). It was not compared with other real websites, because the UXKIN library was not connected when this was written.
Feeling: calm, official, easy to scan. A polytechnic office, not a startup.

## Color (every color has one job)
| Token | Value | Role |
|---|---|---|
| --navy | #16324b | Headings, table headers, strong text |
| --ink | #16324b | Body text |
| --mut | #5b6b7d | Help text, labels (5.5:1 on white) |
| --ac | #176b45 | Primary buttons, links, active tab (6.6:1 on white) |
| --acd | #105238 | Primary hover |
| --soft | #edf5ef | Quiet fills, hover rows |
| --bd | #dbe3dd | Borders, dividers |
| --bg | #f7f8f6 | Page background |
| --or | #e58a24 | Accent only: underlines, counters, highlights. Never text on white |
| --ord | #98500d | Orange used as text |
| --ok / --er | #176b45 / #a52b2b | Success / error |
Layout (chosen: option B, dark green sidebar): flat sidebar #102f27 with white text; the selected item is solid orange #e58a24 with navy text; page background #f4f7fa; white top bar. Student and placement pages use the same dark green as a top bar with an orange underline.
Light theme only.

## Typography
System font stack (Inter if installed, then Segoe UI, Roboto). Body 16px / 1.5. Headings in navy, weight 700, tight tracking.
Scale: 12 (table headers) / 14 (tables, hints) / 16 (body) / 20 (card title) / 24 (page title) / 30 (statistic numbers).

## Spacing and shape
4px base scale: 4, 8, 12, 16, 24, 32. Cards 16px radius with one soft shadow. Buttons and fields 10px radius, at least 44px high (easy to tap on a phone).

## Components
- Primary button: solid green, no gradient. Secondary: white with a border. Delete: white with a red border. All have a visible focus ring.
- Fields: white, 1px border, green border and halo on focus.
- Tables: pale green header in small capitals, row highlight on hover.
- Counters (badges): orange with navy text.
- Sub-tabs: pills; the selected one is solid green.
- Dashboard: navy welcome banner with an orange underline, statistic cards with a green top edge (orange when something needs attention).

## Icons and imagery
One line-icon set (the shell's). No emoji as icons. The RVNP logo and letterhead are the only imagery.

## Page pattern
Every dashboard opens with a navy banner (orange underline), then statistic cards with a green top edge (orange when something needs attention), then white cards with progress bars. Bars are green; orange marks the part that is behind.

## Where it lives
`portal-theme.css` holds the base colors, `shell.css` the sidebar, `rvnp-design.css` the components above. Change a value there, not inside a page.
