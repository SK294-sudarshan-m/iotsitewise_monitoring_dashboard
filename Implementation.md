# Implementation Notes

How the dashboard's calculation logic actually works, for anyone extending or
reviewing it. Skims the architecture; focuses on the math.

## 1. Data flow (one pipeline, any source)

```
Data/*.json  ──┐
Uploaded JSON ─┼─►  Source Adapter  ──►  normalizePayload()  ──►  Canonical Sensor Model
(future) S3   ─┤     (returns raw           (dataNormalizer.js)         │
(future) SiteWise ┘  {raw, sourceInstance,                              ▼
                       error} objects)                     Plant filter → Time-window filter
                                                                          │
                                                     ┌────────────────────┼────────────────────┐
                                                     ▼                    ▼                     ▼
                                            sensorHealth.js      aggregates.js         kpiDefinitions.js
                                            (Panel 2)            (Panel 3)             (Panels 4 & 5)
```

Every adapter (`src/data/*Adapter.js`) just fetches/parses raw JSON and hands
it to `normalizePayload()` — **no component or calculation ever looks at
source-specific JSON shape.** This is why swapping in S3 or SiteWise later
won't touch any math described below.

**Canonical sensor shape** (`dataNormalizer.js`): `{ id, source, plant,
tagName, description, unit, variableType, configuredMin, configuredMax,
sampleCount, samples: [{timestamp, value}], firstValue, lastValue,
isPartialSeries }`. Sensor identity for merging/deduping across files uses
`property_id` first, then `tag_name`, then `name`, then a composite fallback —
never a hard-coded UUID.

All math below operates only on samples inside the **currently selected time
window** (`[windowStart, windowEnd]`), computed once in `App.jsx` and reused
by every panel via `useMemo`.

---

## 2. Common Aggregates (Panel 3) — `src/utils/aggregates.js`

Exactly 10 values per sensor, computed only from valid numeric samples in the
selected window:

| Metric | Formula |
|---|---|
| Current | latest valid sample in window |
| **Average** | **time-weighted**, not a plain mean — see below |
| Minimum / Maximum | min/max of valid values |
| Median | standard numeric median |
| Standard Deviation | **population** stddev: `sqrt(Σ(v − mean)² / N)` |
| Observed Range | `max − min` |
| First / Last Value | first/last valid sample in window |
| Sample Count | count of valid samples used |

**Why time-weighted average**: telemetry isn't evenly spaced, so a plain mean
would over-weight bursts of samples. Instead we integrate trapezoidally and
divide by elapsed time:

```
segmentArea[i] = (value[i] + value[i+1]) / 2 × (timestamp[i+1] − timestamp[i])
average = Σ segmentArea / Σ (timestamp[i+1] − timestamp[i])
```
(single sample → average = that value)

This same trapezoidal building block (`timeSeries.js: trapezoidalIntegral`) is
reused for the "Total" figures in the flow/power KPIs below — just expressed
in **hours** instead of milliseconds, so the result is a quantity (tonnes,
MWh) instead of a rate.

---

## 3. Sensor Status / Health (Panel 2) — `src/utils/sensorHealth.js`

This is **data/communication health only** — never a claim about physical
sensor condition. Four statuses, decided in this order per sensor:

1. **No valid samples in window** → `NOT REPORTING` — "No observations in selected period"
2. **All present values invalid** (null/NaN/Infinity) → `NOT REPORTING` — "Invalid values"
3. **Gap analysis**: `expectedInterval` = median of positive consecutive
   timestamp gaps. Compare the largest gap (including the trailing gap up to
   `windowEnd`) against it:
   - `> 6× expected` → `NOT REPORTING` — "Large reporting gaps"
   - `> 3× expected` → contributes to `SUSPECT`
4. **Fewer than 2 valid samples** in window → `UNKNOWN` — "Insufficient observations"
5. Otherwise, check for `SUSPECT` evidence and combine any that apply:
   - **Analog flat-line**: observed range ≤ 0.5% of the sensor's configured
     min/max span (skipped entirely for binary/state sensors — see below)
   - **Range violations**: ≥2 samples *and* ≥10% of samples outside the
     configured min/max
   - **Mixed invalid values**: some (not all) samples invalid
6. No evidence found → `WORKING` — "Reporting normally"

**Binary/state detection** (`detectBinarySensor`, reused by KPI 10 too):
configured min=0 & max=1, OR a state-like unit/variable-type name, OR all
observed values are exactly 0/1. A sensor stuck at constant 0 or 1 is **not**
auto-flagged as faulty because of this check.

`Sensor Health % = Working / Total Evaluated × 100`.

---

## 4. KPI Matching Engine — `src/utils/kpiDefinitions.js`

Sensors are matched to each of the 10 KPIs **semantically** (description, tag
name, unit, variable type) — never by hard-coded PropertyID/UUID, so it keeps
working if the underlying telemetry system's IDs change.

Each KPI defines:
- `requiredGroups`: OR-lists of synonyms (e.g. `[['hp'], ['steam'],
  ['generation','flow']]`) — **every group** must have at least one hit for a
  sensor to qualify at all.
- `boostTokens` / `preferredUnitTokens` / `preferredVarTypeTokens`: add to a
  score once qualified.
- A universal bonus for tokens like `total, combined, comp, cmp, inclusive,
  incl, aggregate` — this is what makes the engine prefer a single
  already-combined measurement (e.g. *"AQC HP steam Generation **incl** PH
  Steam"*) over summing separate component sensors, per the "don't double
  count" rule.

Highest-scoring qualified sensor wins; if nothing qualifies, the KPI reports
`N/A` — values are never fabricated.

> ⚠️ **Gotcha to remember**: never add a synonym that's a plain substring of
> another synonym in the same group (e.g. `'gen'` next to `'generation'`) —
> it silently double-counts matches and can flip which sensor wins. This
> exact bug happened once during development (WHRS Power Generation briefly
> matched the wrong sensor) and was fixed by removing the redundant token and
> adding a `boostTokens` phrase match instead.

---

## 5. The Ten KPIs — calculation specifics

**Flow/power KPIs (1–6)**: current/average/min/max from the matched sensor's
windowed samples, plus a **Total** = `trapezoidalIntegral(samples)` in
tonnes or MWh (same time-weighted integration as the aggregates average,
just expressed as a quantity).

| # | KPI | Match concept | Total |
|---|---|---|---|
| 1 | Kiln Feed Rate | kiln + feed | Total Feed (tonnes) |
| 2 | TPP Generation Load | tpp/cpp + generation/load | Energy Generated (MWh) |
| 3 | WHRS Power Generation | whrs/whsr + power/generation | WHRS Energy Generated (MWh) |
| 4 | Grid Load | grid + load/import/draw | Grid Energy (MWh) |
| 5 | HP Steam Generation Rate | hp + steam + generation/flow, prefers combined | Total HP Steam (tonnes) |
| 6 | LP Steam Generation Rate | lp + steam + generation/flow, prefers combined | Total LP Steam (tonnes) |

**Pressure KPIs (7–8)**: current/average/min/max/**standard deviation**, plus
`% of window time spent outside the sensor's configured min/max`
(`computeOutOfRangeDuration`, only computed when configured limits are
trustworthy). Both prefer a `"TG ..."` (turbine-generator delivery) reading
via a `boostTokens: ['tg']` match when one exists.

**#9 — WHRS Gas Temperature Drop**: the one KPI that isn't a single-sensor
match. `findGasTemperaturePaths()`:
1. Filters to temperature sensors whose description mentions "gas".
2. Detects inlet vs. outlet/exit from the description wording, and builds a
   key from the description with the direction word stripped (so "PH Boiler
   **inlet** Gas temperature" and "PH Boiler **Outlet** Gas temperature"
   produce the same key).
3. If a key resolves to exactly one inlet + one outlet → valid pair. If
   ambiguous (e.g. PH1A and PH1B share identical wording), it disambiguates
   using known equipment tokens found in the tag name (`PH1A, PH1B, AQC, ESP,
   TG, STG, WH1, WH2`) — a group that's still ambiguous after that is
   **dropped, never guessed**.
4. Per matched pair: nearest-timestamp-aligns inlet/outlet samples (tolerance
   = half the inferred sampling interval), then `delta = inlet − outlet` at
   each aligned point.
5. Headline current/average/min/max = plain mean across all valid paths;
   every individual path (with its inlet/outlet sensor names) is exposed in
   the tile's expanded detail.

**#10 — Equipment Runtime %**: uses only sensors flagged by the same
`detectBinarySensor()` check from Section 3. For each one,
`calculateStateTransitions()` walks its samples clipped to the window, **holding
each state until the next timestamp** (or until `windowEnd` for the last known
state — never fabricating what happens after). From that:
- `onDuration` / `offDuration` = summed segment durations
- `Runtime % = onDuration / (onDuration + offDuration) × 100` (duration-based,
  never a naive "ON sample count ÷ total samples")
- `startCount` = 0→1 transitions, `stopCount` = 1→0 transitions
- `longestOffDuration` = longest single OFF segment

If multiple binary equipment sensors exist, the headline **pools** ON/observed
time across all of them (`Σon / Σobserved`, not an average of percentages) —
each equipment's own numbers are still shown in the expanded detail.

---

## 6. Where to look

| Concern | File |
|---|---|
| Canonical model + merge/dedupe | `src/utils/dataNormalizer.js` |
| Plant name resolution | `src/utils/plantResolver.js` |
| All time-series math (integration, stddev, runtime, gap/interval inference) | `src/utils/timeSeries.js` |
| The 10 common aggregates | `src/utils/aggregates.js` |
| Sensor health classification | `src/utils/sensorHealth.js` |
| KPI matching + all 10 KPI calculations | `src/utils/kpiDefinitions.js` |
| Source adapters (local/uploaded/S3-stub/SiteWise-stub) | `src/data/*Adapter.js` |
| Source factory (single switch point) | `src/data/dataSource.js` |
| Plant/time filtering, wiring panels together | `src/App.jsx` |

Components (`src/components/*.jsx`) only render and handle UI interaction
(search/sort/expand) — they never contain calculation logic themselves.
