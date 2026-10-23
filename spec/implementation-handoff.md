# Life Simulation Game — Implementation Handoff

Version 1.0 · 2026-10-23 · Design specification 3.0

This file is the entry point for implementation. The referenced Markdown and JSON files in this package are the detailed source of truth. Implement the approved behavior in vertical slices; do not replace the design with a short prototype that skips life-long continuity, choices, relationships, or historical estimates.

## 1. Product goal

Build an adult-oriented, mobile-first life simulation. A player is randomly born somewhere in the world and lives through a full life. The main appeal is historical life, considering how one might live in different circumstances, and discovering an unexpected personal story.

The simulation advances in **quarters**. Ordinary life advances automatically according to the selected focus and presents small choices. Important decisions pause for the player unless automatic decision mode has been selected. The life continues across calendar years and changing social conditions; a data period ending never ends the character's life.

Design goals, interface references, game rules, and user-approved priorities are in [game-spec.md](game-spec.md). The player interface is mobile-first and uses the visual/layout references described there, including the Kyoto life-simulator reference. Do not copy reference assets or text.

## 2. Birth and world scope

- The initial birth window contains 2,000 calendar years ending at the current reference year. With reference year 2026, use years **27–2026 inclusive**.
- The initial sampling policy uses eight broad world regions. Equal regional weights are a game-balance default, not a historical population estimate. Year selection is uniform by default. Both weights must remain data-driven and visible in the birth explanation.
- Deeply authored starting places are Niita/Nihonmatsu and Suzhou (East Asia), Agra (South Asia), Timbuktu (Sub-Saharan Africa), and Dijon (Europe), with historical-source and present-day contexts. This is a first content set, not the whole world.
- Other region/year combinations remain selectable using clearly labeled, low-confidence game-estimate contexts. Do not invent a real city name, local custom, or historical statistic for a generic scene. A location name is specific only when its content record supports it.
- Birth-scene boundaries only select starting context. Resolve current social conditions by current year and location. Preserve the person, family, skills, health, resources, and relationships across all context changes.

Sampling defaults, region weights, location archetypes, and fallback rules: [data/global-birth-sampling.json](data/global-birth-sampling.json) and [birth-sampling.md](birth-sampling.md).

## 3. Core play loop

1. Resolve the current quarter, year, location, household, health, relationships, and applicable data context.
2. Generate eligible everyday choices and concrete opportunities from the context, people, age, resources, and ongoing state.
3. Advance routine changes automatically according to the player's annual focus and auto/manual choice settings.
4. Pause for major life decisions when required; persist the exact decision and offers so a resume cannot reroll them.
5. Resolve outcomes, relationships, personality evidence, events, mortality, journal, and save state exactly once.
6. Continue next quarter while alive; on death, show a life review.

Use [prototype-rules.md](prototype-rules.md) for state values, development, probabilities, mortality, and automatic choices. Use [data/events-initial.json](data/events-initial.json), [data/event-outcomes.json](data/event-outcomes.json), and [data/scenario-bindings.json](data/scenario-bindings.json) for the first 24 authored events, choices, results, people, and context bindings.

## 4. Character and social simulation

Implement the five core abilities, relationships with persistent people, and the four independent personality axes defined in the main specification. Personality is derived from accumulated choices; do not assign a personality type at birth. Relationships and abilities materially affect opportunities and life outcomes. Childhood choices may shape abilities and relationships, but caregiver decisions in infancy do not count as the protagonist's personality evidence.

The player should experience a dense student period and a rich adolescence-to-thirties arc. Everyday choices should be frequent and small; major decisions should be less frequent and consequential. Keep the chosen automatic progression as the default, with an option to answer small choices manually.

## 5. Content/data rules

- Every numeric value carries an evidence tier: observed/source-derived, source-based estimate, or game estimate. Preserve source, version, location, time span, uncertainty, license, and transformation where relevant.
- Missing data may be filled with low/central/high game estimates. Label them as estimates in the interface and journal. Never present them as measured local history.
- Mortality: use the WPP 2024 country series for the five named anchors from 1950–2100; preserve estimates versus Medium-variant projections. Ages 100+ use the documented game-estimated tail. For other places/years, use the low/central/high age-specific estimate profiles and clearly identify them as game estimates.
- Opportunities and health episodes use the initial estimate ranges in [data/scenario-opportunity-estimates.json](data/scenario-opportunity-estimates.json). These are pacing parameters, not measured participation or incidence rates.
- Historical scenes continue through successor contexts; post-2100 conditions are game hypotheses, not forecasts. The context map is [data/scenario-successor-estimates.json](data/scenario-successor-estimates.json).
- Adult rating: intimacy is limited to adults and handled non-explicitly. Never sexualize minors.

## 6. Technical implementation requirements

The documents define behavior and data contracts, not a required framework. Choose an implementation stack appropriate for the target platform, then document the choice. Keep simulation logic, content/data, and presentation separate. Use seeded/replayable randomness and persist the RNG state, rules/data versions, current quarter, event history, unresolved decision, and all character state so save/resume produces no duplicated outcome or rerolled choice.

Treat `game-spec.md` as the product-level authority, `prototype-rules.md` as the initial simulation contract, and the JSON records as data contracts. Where a JSON example and prose conflict, preserve the player-facing intent and record the resolution in the implementation notes rather than silently changing the design.

## 7. Suggested build order

1. Birth generation, calendar, save/reload, and one complete life with estimated data.
2. Quarter progression, small choices, auto/manual modes, and deterministic resume.
3. Persistent relationships, abilities, personality accumulation, opportunities, and event outcomes.
4. Mortality, health episodes, context updates across eras, death, and life review.
5. Add all five deep-dive place pairs and generic estimated coverage for the other regions/years.
6. Mobile-first UI polish, reference-inspired layout, accessibility, and content/data attribution screens.

The full spec is complete for implementation handoff. `public_enabled: false` on current records means a production data release still needs content, licensing, and balance review; it does not mean empirical data is required before implementation.

## 8. Package contents

- Product and UI: `game-spec.md`
- Simulation: `prototype-rules.md`
- Birth sampling: `birth-sampling.md`, `data/global-birth-sampling.json`, `data/birth-estimates.json`
- Content/events: `scenario-events.md`, `data/events-initial.json`, `data/event-outcomes.json`, `data/scenario-bindings.json`
- Opportunities and timeline: `scenario-opportunities.md`, `data/scenario-opportunity-estimates.json`, `data/scenario-successor-estimates.json`
- Place/data research and mortality: `historical-scope.md`, `modern-scope.md`, `scenario-data-plan.md`, `data/mortality-estimates.json`, `data/mortality-historical-estimates.json`, `data/mortality-wpp2024-qx-*.csv.gz`, `tools/derive_wpp2024_qx.py`
- Progress/design decisions: `spec-review.md`
