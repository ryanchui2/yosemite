# UI Cleanup and Small-Business Value — Plan (Updated)

## Branding: Keep yosemite

- **Keep yosemite** as the product name everywhere: header, logo, and metadata.
- [`frontend/app/layout.tsx`](frontend/app/layout.tsx) already uses `title: "yosemite"` and the dashboard uses `yosemite_logo.png` and "yosemite" in the header — no change needed.
- Do not switch to "ARRT" in the UI; README can continue to reference ARRT as the project/codebase name if desired.

---

## Icon consistency audit and fixes

Ensure the same concept uses the same icon across sidebar, tab headers, empty states, and shared components.

### Current usage

| Location                | Icon          | Purpose                             |
| ----------------------- | ------------- | ----------------------------------- |
| **Sidebar**             | Cuboid        | Overview                            |
| **Sidebar**             | Drama         | Anomaly detector                    |
| **Sidebar**             | Ship          | Geo & sanctions                     |
| **Sidebar**             | AlertTriangle | AI fraud analysis                   |
| **Anomaly tab**         | AlertTriangle | Section header (Anomaly Detector)   |
| **Anomaly tab**         | Upload        | DropZone                            |
| **Anomaly tab**         | AlertTriangle | Empty state                         |
| **Geo & sanctions tab** | Shield        | Section header (Sanctions Screener) |
| **Geo & sanctions tab** | Globe         | Empty state                         |
| **RiskOverview**        | AlertTriangle | Bullet in list                      |
| **FlaggedTransactions** | AlertTriangle | Empty / header                      |

### Inconsistencies to fix

1. **Anomaly**: Sidebar uses **Drama**, tab header uses **AlertTriangle**.  
   - **Recommendation**: Use **AlertTriangle** in the sidebar for "anomaly detector" so it matches the tab (fraud/risk theme). Alternatively use **Drama** in the tab header for consistency; AlertTriangle is stronger for "anomaly/fraud."

2. **Geo & sanctions**: Sidebar uses **Ship**, tab uses **Shield** (header) and **Globe** (empty state).  
   - **Recommendation**: Pick one concept — e.g. **Shield** for sanctions/compliance and use it in the sidebar and empty state, or **Globe** for geo + sanctions and use it in sidebar and header so all three (sidebar, header, empty) match.

3. **Icon size**: Sidebar uses `h-4 w-4`; FraudAgentProgress uses `h-3.5 w-3.5`; empty states use `h-6 w-6`.  
   - **Recommendation**: Use a single size for "section" icons (e.g. `h-4 w-4` in nav and tab headers, `h-6 w-6` for large empty-state icons) and document in the plan or a small UI constants file.

4. **Overview**: No icon in the overview content, only in sidebar (Cuboid).  
   - **Recommendation**: If adding a SectionHeader component for other tabs, add one for Overview with **Cuboid** (or LayoutDashboard) so the overview section has a matching icon.

### Implementation steps

- Define a single mapping: **Overview** → Cuboid, **Anomaly** → AlertTriangle (or Drama), **Geo & sanctions** → Shield or Globe (pick one and use everywhere), **AI fraud** → AlertTriangle.
- Use the chosen icon in: (1) sidebar item, (2) tab content header, (3) empty state for that tab.
- Standardize sizes: e.g. `h-4 w-4` for nav and in-tab headers, `h-6 w-6` for empty-state illustrations.
- When extracting tab components, pass the same icon (or a shared constant) so the sidebar and tab stay in sync.

---

## 1. UI cleanup (unchanged summary)

- Split `page.tsx` into tab components: `OverviewTab`, `AnomalyTab`, `GeoSanctionsTab`, `AIFraudTab`.
- Extract `DropZone` and CSV helpers; optional `SectionHeader` with consistent icon + title.
- Remove or feature-flag agent-log fetch calls to `127.0.0.1:7242`.
- Consistent spacing and section title styling; optional responsive sidebar.

---

## 2. Small-business value (unchanged summary)

- Backend: Add `GET /api/stats` (or similar) with `total_transactions`, `total_volume`, optional `last_scan_at`.
- Frontend: Key metrics row on Overview (transactions in system, total volume, last scan + CTA); optional last-scan reminder, cash-flow snapshot, top vendors.

---

## 3. Implementation order (updated)

1. **Icons**: Apply icon-audit fixes (sidebar + tab headers + empty states + sizes) so they match before or while splitting tabs.
2. **Backend**: Add stats endpoint.
3. **Frontend**: Extract tab components and shared UI; remove agent-log; add Overview stats row.
4. **Optional**: SectionHeader with icon; responsive sidebar.
