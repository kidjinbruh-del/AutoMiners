// AutoDirector v0.4.0 — client JS mod, Mindustry v8 (build 158+).
// Simple mode: spawn helper poly drones that permanently mine deficit resources.

var PREFIX = "auto-director-";

var CFG = {
  enabled: true,
  spawnBots: true,
  botsPerCore: 3,
  debug: false,
  checkInterval: 40 // ticks between director scans
};

function getBool(key, def) {
  try { return Core.settings.getBool(PREFIX + key, def); } catch (e) { return def; }
}
function getNum(key, def) {
  try {
    var v = Core.settings.get(PREFIX + key, def);
    var n = Number(v);
    return isFinite(n) ? n : def;
  } catch (e) { return def; }
}
function loadCfg() {
  CFG.enabled = getBool("enabled", true);
  CFG.spawnBots = getBool("spawnBots", true);
  CFG.botsPerCore = Math.max(0, Math.floor(getNum("botsPerCore", 3)));
  CFG.debug = getBool("debug", false);
  CFG.checkInterval = Math.max(5, Math.floor(getNum("checkInterval", 40)));
}
function saveCfg() {
  try {
    Core.settings.put(PREFIX + "enabled", CFG.enabled);
    Core.settings.put(PREFIX + "spawnBots", CFG.spawnBots);
    Core.settings.put(PREFIX + "botsPerCore", Math.floor(CFG.botsPerCore));
    Core.settings.put(PREFIX + "debug", CFG.debug);
    Core.settings.put(PREFIX + "checkInterval", Math.floor(CFG.checkInterval));
    Core.settings.save();
  } catch (e) { Log.err("AutoDirector save failed: " + e); }
}

// ---- version-safe helpers ----
// v8: Building.dead is a BOOLEAN FIELD; Unit.dead may be either —
// never call .dead() directly (it threw "not a function, it is boolean").
function isDead(e) {
  try {
    if (e == null || e === undefined) return true;
    try {
      var d = e.dead;
      if (typeof d === "function") return !!d.call(e);
      return !!d;
    } catch (ee) { return false; }
  } catch (e3) { return false; }
}

// ---- helpers ----
function botUnitType() {
  try { if (UnitTypes.poly != null) return UnitTypes.poly; } catch (e) {}
  try {
    var found = null;
    Vars.content.units().each(function (t) {
      if (found == null && t != null && t.name === "poly") found = t;
    });
    return found;
  } catch (e) { return null; }
}
function countTeamUnits(team) {
  var n = 0;
  try {
    Groups.unit.each(function (u) {
      try { if (u.team === team && !isDead(u)) n++; } catch (e) {}
    });
  } catch (e) {}
  return n;
}
function unitCapFor(team) {
  try { return Units.getCap(team); } catch (e) { return 24; }
}
var lastBotSpawn = 0;
function freeSpotNear(core, radius) {
  try {
    var tx = core.tileX(), ty = core.tileY();
    for (var r = 1; r <= radius; r++) {
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          try {
            var t = Vars.world.tile(tx + dx, ty + dy);
            if (t != null && !t.solid() && t.build == null) {
              return { x: t.worldx(), y: t.worldy() };
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return null;
}
function countBotsNear(team, type, x, y, radius) {
  var n = 0;
  try {
    var r2 = radius * radius;
    Groups.unit.each(function (u) {
      try {
        if (u.team === team && u.type === type && !isDead(u)) {
          var dx = u.x - x, dy = u.y - y;
          if (dx * dx + dy * dy <= r2) n++;
        }
      } catch (e) {}
    });
  } catch (e) {}
  return n;
}
var lastDiag = 0;
function diag(msg) {
  if (!CFG.debug) return;
  try { Log.info("[AutoDirector] " + msg); } catch (e) {}
}
// per-core quota: every core keeps up to botsPerCore poly miners.
function balanceBots(team) {
  if (!CFG.spawnBots) return;
  if (CFG.botsPerCore <= 0) return;
  var type = botUnitType();
  if (type == null) { diag("no poly type!"); return; }
  var cores = null;
  try { cores = team.cores(); } catch (e) { return; }
  if (cores == null) return;
  var nCores = 0;
  try { nCores = cores.size; } catch (e) {}
  if (nCores === 0) return;
  var total = 0, cap = 0;
  try { total = countTeamUnits(team); cap = unitCapFor(team); } catch (e) {}
  var now = 0;
  try { now = Time.millis(); } catch (e) { return; }
  if (now - lastDiag > 30000) {
    lastDiag = now;
    diag("heartbeat cores=" + nCores + " totalUnits=" + total + " cap=" + cap);
  }
  if (total >= cap) return;
  if (now - lastBotSpawn < 2000) return;
  try {
    cores.each(function (core) {
      try {
        if (core == null || isDead(core)) return;
        var have = countBotsNear(team, type, core.x, core.y, 400);
        if (have >= CFG.botsPerCore) return;
        var spot = freeSpotNear(core, 6);
        var sx = spot != null ? spot.x : core.x + 40;
        var sy = spot != null ? spot.y : core.y;
        diag("spawning poly at " + Math.floor(sx) + "," + Math.floor(sy) + " have=" + have);
        var u = null;
        try { u = type.spawn(team, sx, sy); } catch (e) { return; }
        if (u != null) {
          try { u.controller(new MinerAI()); diag("miner ok id=" + u.id); }
          catch (e) { try { u.controller(new CommandAI()); } catch (ee) {} }
          managedIds.push(u.id);
          lastBotSpawn = now;
        }
      } catch (e) { diag("core loop threw: " + e); }
    });
  } catch (e) { diag("cores.each threw: " + e); }
}

// ---- mining: deficit-first collection of base resources ----
var MINABLE = ["copper", "lead", "sand", "coal", "titanium", "thorium", "scrap"];
var managedIds = []; // poly drones we spawned (other units are never touched)
var oreCache = {};   // itemName -> {tile, at}
function resolveItem(name) {
  try {
    return Vars.content.items().find(function (it) {
      return it != null && it.name === name;
    });
  } catch (e) { return null; }
}
function hasOre(item) {
  try { return Vars.indexer.hasOre(item); } catch (e) { return true; }
}
function coreAmount(core, item) {
  try { return core.items.get(item); } catch (e) { return 0; }
}
function coreCap(core) {
  try { return core.block.itemCapacity; } catch (e) { return 1000; }
}
function findOreTile(item, cx, cy, rTiles) {
  if (item == null) return null;
  var now = 0;
  try { now = Time.millis(); } catch (e) {}
  try {
    var hit = oreCache[item.name];
    if (hit != null && now - hit.at < 8000) {
      try { if (hit.tile != null && hit.tile.drop() === item) return hit.tile; } catch (e) {}
    }
  } catch (e) {}
  try {
    var ctx = Math.floor(cx / 8), cty = Math.floor(cy / 8);
    for (var r = 1; r <= rTiles; r++) {
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          try {
            var t = Vars.world.tile(ctx + dx, cty + dy);
            if (t != null && t.drop() === item) {
              oreCache[item.name] = { tile: t, at: now };
              return t;
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return null;
}
// scarcest stocked mineable resource (by core fill ratio)
function pickDeficit(core) {
  var best = null, bestFill = 2;
  try {
    var cap = coreCap(core);
    for (var i = 0; i < MINABLE.length; i++) {
      var it = null;
      try { it = resolveItem(MINABLE[i]); } catch (e) {}
      if (it == null || !hasOre(it)) continue;
      var fill = coreAmount(core, it) / Math.max(1, cap);
      if (fill < bestFill) { bestFill = fill; best = it; }
    }
  } catch (e) {}
  return { item: best, fill: bestFill };
}
function setMineTarget(u, tile) {
  if (tile == null) return;
  try { u.mineTile = tile; } catch (e) {}
}
// keep only our drones alive, keep the rest as MinerAI on deficit resource.
function manageBots(team, core) {
  try {
    var alive = {};
    Groups.unit.each(function (u) {
      try {
        if (u.team === team && !isDead(u) && managedIds.indexOf(u.id) >= 0) alive[u.id] = true;
      } catch (e) {}
    });
    var kept = [];
    for (var i = 0; i < managedIds.length; i++) {
      if (alive[managedIds[i]]) kept.push(managedIds[i]);
    }
    managedIds = kept;
  } catch (e) { return; }
  var tile = null;
  try {
    if (core != null) {
      var def = pickDeficit(core);
      if (def.item != null) tile = findOreTile(def.item, core.x, core.y, 12);
    }
  } catch (e) {}
  try {
    for (var k = 0; k < managedIds.length; k++) {
      try {
        Groups.unit.each(function (u) {
          try {
            if (u.id === managedIds[k] && !isDead(u)) {
              if (!(u.controller() instanceof MinerAI)) {
                try { u.controller(new MinerAI()); } catch (e) {}
              }
              if (tile != null) setMineTarget(u, tile);
            }
          } catch (e) {}
        });
      } catch (e) {}
    }
  } catch (e) {}
}

// ---- director tick ----
function directorScan() {
  if (!CFG.enabled) return;
  var st;
  try { st = Vars.state; } catch (e) { return; }
  if (st == null || !st.isGame()) return;
  var team;
  try { team = Vars.player.team(); } catch (e) { return; }
  if (team == null) return;
  var core = null;
  try { core = team.cores().first(); } catch (e) {}
  try { balanceBots(team); } catch (e) {}
  try { manageBots(team, core); } catch (e) {}
}

// ---- boot ----
try {
  loadCfg();
  var t = 0;
  Events.run(Trigger.update, function () {
    try {
      t++;
      if (t % CFG.checkInterval === 0) directorScan();
    } catch (e) {}
  });
  Log.info("[AutoDirector] v0.4.0 initialized (minGame 158).");
} catch (e) {
  try { Log.err("AutoDirector init failed: " + e); } catch (ee) {}
}