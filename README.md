# AutoMiners

Automated poly drones that collect your **base resources for you**.

Lightweight client-side JS mod for **Mindustry v8** (build 158+). No server, no Java plugin, no permission hassle — drop it in your `mods` folder and play.

Each of your cores keeps up to `botsPerCore` poly drones. The drones are controlled by `MinerAI` and always mine the resource your core has the **least** of (copper → lead → sand → coal → titanium → thorium → scrap, only ores actually present on the map). When the shortage shifts, they automatically switch to the new deficit resource.

![Mindustry](https://img.shields.io/badge/Mindustry-v8%20(158%2B)-04684e)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Why AutoMiners?

In Mindustry v8 a lot of early-game work is babysitting your few drill-less `poly`s so they mine the right ore and keep the core stocked. AutoMiners removes that chore: the moment you place a core, helper drones appear and keep the resource levels healthy, freeing you to build, defend, and expand.

Feature checklist:

- ✅ Per-core quota — no global pile-up of units in one spot
- ✅ Deficit-first mining — drones mine what your core actually lacks
- ✅ Only your *own* drones are touched — player units and official units are never hijacked
- ✅ Respects the unit cap (`Units.getCap`) and only spawns when there is free capacity
- ✅ Safe spawn placement (open tile near the core, no spawn-death loops)
- ✅ Zero server component — fully client-side, works in singleplayer
- ✅ Survives saves — settings persist via `Core.settings`

What it does **not** do (by design): army automation, follow-me mode, manual orders, a control panel. This is the "simple, just miners" build. Those extras were stripped out to keep the mod predictable and bug-free.

---

## Installation

1. Download the mod (Release ZIP, or clone this repository).
2. Copy the contents into `mods/` inside your Mindustry folder:
   - Windows (often): `%appdata%/Mindustry/mods/`
   - Or the portable/pirated layout this project was built against: `<game>/saves/mods/`
3. Launch Mindustry **v8 / build 158+**.
4. In the mods list, enable **AutoMiners** (arrow on the row).

Folder layout inside `mods/`:

```
mods/
└── auto-director/          <- folder name must stay "auto-director"
    ├── mod.hjson           <- mod manifest
    └── scripts/
        └── main.js         <- the whole mod logic
```

> **Important:** the in-game *identifier* (folder + `name` in `mod.hjson`) is kept as `auto-director`. Mindustry toggles a mod by its identifier inside `settings.bin` (`mod-auto-director-enabled`), so renaming the id would make the game treat it as a brand-new and **disabled** mod. `displayName: AutoMiners` is what you actually see in the UI.

---

## How it works

Every `checkInterval` ticks (default **40**, ~0.67s) a director scan runs:

1. **`balanceBots(team)`** — checks each core. If a core has fewer than `botsPerCore` poly drones around it **and** the team is under the unit cap, it spawns another `poly` on a free tile near the core.
2. **`manageBots(team, core)`** — looks at the stock in the first core. Finds the scarcest mineable ore on the map (`pickDeficit`), then makes sure every drone is `MinerAI`, pointing them at that ore (`mineTile`) with a small per-ore tile cache (`oreCache`, 8s TTL) so they don't restock pointlessly every tick.

The `isDead()` helper is deliberately version-safe: Mindustry v8 made `Building.dead` a **boolean field** instead of a method, so calling `core.dead()` throws `TypeError`. The helper detects whether `dead` is a field or a function and handles both.

### Config keys (all optional, saved in `Core.settings`)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `auto-director-enabled` | bool | `true` | Global on/off |
| `auto-director-spawnBots` | bool | `true` | Allow spawning drones |
| `auto-director-botsPerCore` | int | `3` | Drones per core |
| `auto-director-checkInterval` | int | `40` | Ticks between scans |
| `auto-director-debug` | bool | `false` | `[AutoDirector]` lines into the log |

Settings are written on change via `Core.settings.save()`.

---

## Development / structure

```
auto-director/
├── mod.hjson      # manifest: id, version, minGameVersion, displayName
├── scripts/
│   └── main.js    # single-file logic (spawn + mining director)
├── LICENSE        # MIT
└── README.md
```

All logic lives in `scripts/main.js` to keep Rhino (the JS engine embedded in Mindustry) happy. A few hard-learned v8/Rhino constraints are respected inside the code:

- No `.dead()` calls — v8 uses a `boolean` field (`isDead()` helper).
- No `label(String)`, no `Table.table(...)` — overload ambiguity throws `InternalError` under Rhino (that's why this build has no UI panel at all; it started as a control-panel mod and the UI was removed).
- Booleans/numbers stored into `Core.settings` are explicitly cast (`int`/`float`) — storing a raw JS `Double` throws `Invalid object stored`.

Syntax is validated with `node --check scripts/main.js` before release.

---

## Roadmap (v0.5+ ideas)

- Resource priority tuning per unit type (drone counts per resource ratio)
- Radius awareness: pick nearest ore, not just the most scarce
- Optional manual "mine target" orders via a future UI (needs a Rhino-safe UI approach)

---

## License

MIT © ebann — see [LICENSE](LICENSE).

Contributions, forks, and modpacks that include AutoMiners are welcome; please keep attribution.