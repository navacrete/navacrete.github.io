/**
 * Game logic of the web room client – ports of the app's EvidenceFilter, TimerPlans, GameRules
 * (hunt/UV durations) and PartyScoring. Pure functions; test/logic.test.js checks the evidence
 * filter against vectors printed by the Kotlin code.
 *
 * Evidence state per id: 0 unknown · 1 found · 2 ruled out (same ints the room protocol uses).
 */
import { GHOSTS, EVIDENCE } from "./ghosts.js";
import { BINGO_SIDE, BINGO_FREE } from "./party-data.js";

export const EV_IDS = EVIDENCE.map((e) => e.id);
export const UNKNOWN = 0, FOUND = 1, RULED_OUT = 2;

export const ghostById = Object.fromEntries(GHOSTS.map((g) => [g.id, g]));

/* ------------------------------------------------------------------ evidence filter */

export function shownEvidence(g) {
  return g.fakeOrb && !g.evidence.includes("ORB") ? [...g.evidence, "ORB"] : g.evidence;
}

export function isPossible(g, states, evidenceCount) {
  const found = EV_IDS.filter((e) => states[e] === FOUND);
  const out = EV_IDS.filter((e) => states[e] === RULED_OUT);
  const hidden = Math.min(3, Math.max(0, 3 - evidenceCount));
  const shown = shownEvidence(g);
  if (!found.every((e) => shown.includes(e))) return false;
  if (g.fakeOrb && out.includes("ORB")) return false;
  if (g.guaranteed && evidenceCount >= 1 && evidenceCount <= 2) {
    if (out.includes(g.guaranteed)) return false;
    if (found.length >= evidenceCount && !found.includes(g.guaranteed)) return false;
  }
  const ruledOutOwn = out.filter((e) => g.evidence.includes(e)).length;
  if (ruledOutOwn > hidden) return false;
  const maxFound = evidenceCount + (g.fakeOrb ? 1 : 0);
  if (found.length > maxFound) return false;
  return true;
}

export function possibleGhosts(states, evidenceCount) {
  return GHOSTS.filter((g) => isPossible(g, states, evidenceCount));
}

/* ------------------------------------------------------------------ timers */

export const DEFAULT_SMUDGE = 90, DEFAULT_COOLDOWN = 25, DEFAULT_UV = 120;

/** TimerPlans.plan: group the candidates by duration; one alert per group, the longest is the total. */
function plan(candidates, othersLabel, seconds) {
  const pool = candidates.length ? candidates : GHOSTS;
  const groups = new Map();
  for (const g of pool) { const s = seconds(g); if (!groups.has(s)) groups.set(s, []); groups.get(s).push(g); }
  const keys = [...groups.keys()].sort((a, b) => a - b);
  const total = keys[keys.length - 1];
  if (keys.length === 1) return { total, label: pool.length === 1 ? pool[0].name : "", milestones: [] };
  return { total, label: "", milestones: keys.map((sec) => [sec, groups.get(sec).length <= 2 ? groups.get(sec).map((g) => g.name).join(", ") : othersLabel]) };
}
export const incensePlan = (candidates, othersLabel) => plan(candidates, othersLabel, (g) => g.smudge);
export const cooldownPlan = (candidates, othersLabel) => plan(candidates, othersLabel, (g) => g.cooldown);
export const uvMilestones = (candidates, uvSeconds) => (uvSeconds > 0 && candidates.some((g) => g.id === "obake") ? [[Math.floor(uvSeconds / 2), "Obake"]] : []);

const SIZE_INDEX = { SMALL: 0, MEDIUM: 1, LARGE: 2 };
const PRESET_LENGTH = { AMATEUR: "LOW", INTERMEDIATE: "MEDIUM", PROFESSIONAL: "HIGH", NIGHTMARE: "HIGH", INSANITY: "HIGH", CUSTOM: "HIGH" };
/** GameRules.huntDuration for the presets (custom difficulty follows the HIGH table). */
export function huntDuration(difficulty, mapSize, cursed) {
  const table = { LOW: [15, 30, 40], MEDIUM: [20, 40, 50], HIGH: [30, 50, 60] }[PRESET_LENGTH[difficulty] || "HIGH"];
  return table[SIZE_INDEX[mapSize] ?? 1] + (cursed ? 20 : 0);
}
export const uvSeconds = (difficulty) => (difficulty === "INSANITY" ? 60 : 120);

/* ------------------------------------------------------------------ party scoring */

export const GHOST_POINTS = 3, ROOM_POINTS = 2, DEATH_POINTS = 1, NONE = "none";
export const STATUS_ACTIVE = "active", STATUS_DONE = "done", STATUS_FAILED = "failed";

export function sameRoom(a, b) {
  return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase() && String(a).trim() !== "";
}

export function betPoints(bet, res) {
  let p = 0;
  if (bet.ghost && bet.ghost === res.ghost) p += GHOST_POINTS;
  if (sameRoom(bet.room, res.room)) p += ROOM_POINTS;
  if (bet.death) {
    const hit = bet.death === NONE ? res.deaths.length === 0 : res.deaths.includes(bet.death);
    if (hit) p += DEATH_POINTS;
  }
  return p;
}

export function huntPoints(deltaSeconds) {
  const d = Math.abs(deltaSeconds);
  return d <= 5 ? 3 : d <= 15 ? 2 : d <= 30 ? 1 : 0;
}

export function challengePoints(c) {
  const out = {};
  if (c.status === STATUS_DONE) for (const t of c.targets) out[t] = c.level;
  else if (c.status === STATUS_FAILED) for (const t of c.targets) out[t] = -c.level;
  return out;
}

export function bingoLines(marked) {
  const n = BINGO_SIDE;
  const has = (c) => c === BINGO_FREE || marked.has(c);
  let lines = 0;
  for (let r = 0; r < n; r++) { let ok = true; for (let c = 0; c < n; c++) if (!has(r * n + c)) ok = false; if (ok) lines++; }
  for (let c = 0; c < n; c++) { let ok = true; for (let r = 0; r < n; r++) if (!has(r * n + c)) ok = false; if (ok) lines++; }
  let d1 = true, d2 = true;
  for (let i = 0; i < n; i++) { if (!has(i * n + i)) d1 = false; if (!has(i * n + (n - 1 - i))) d2 = false; }
  if (d1) lines++; if (d2) lines++;
  return lines;
}
export const bingoFull = (marked) => new Set([...marked, BINGO_FREE]).size === BINGO_SIDE * BINGO_SIDE;
export const bingoPoints = (lines, full) => (lines > 0 ? 3 + (lines - 1) : 0) + (full ? 5 : 0);

export function scoreboard(players, betsByRound, results, challenges, minis, bingo) {
  const names = new Map(players.map((p) => [p.pid, p.name]));
  const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
  const bets = new Map(), chal = new Map(), mini = new Map(), bng = new Map();
  for (const [r, res] of Object.entries(results)) {
    for (const b of betsByRound[r] || []) { if (!names.has(b.pid)) names.set(b.pid, b.name); add(bets, b.pid, betPoints(b, res)); }
  }
  for (const c of challenges) {
    for (const [id, p] of Object.entries(challengePoints(c))) {
      const i = c.targets.indexOf(id);
      if (i >= 0 && i < c.names.length && !names.has(id)) names.set(id, c.names[i]);
      add(chal, id, p);
    }
  }
  for (const m of minis) { if (!names.has(m.pid)) names.set(m.pid, m.name); add(mini, m.pid, m.points); }
  for (const bm of bingo) { if (!names.has(bm.pid)) names.set(bm.pid, bm.name); add(bng, bm.pid, bingoPoints(bingoLines(bm.cells), bingoFull(bm.cells))); }
  return [...names.entries()].map(([pid, name]) => {
    const b = bets.get(pid) || 0, c = chal.get(pid) || 0, m = mini.get(pid) || 0, g = bng.get(pid) || 0;
    return { pid, name, total: b + c + m + g, bets: b, challenges: c, mini: m, bingo: g };
  }).sort((x, y) => y.total - x.total || x.name.toLowerCase().localeCompare(y.name.toLowerCase()));
}

/* ------------------------------------------------------------------ party facts → view */

export const isPartyKey = (k) => k === "party" || k === "roles" || k === "bingo" || /^(player|bet|result|challenge|dead|mini|bingomark):/.test(k);

const str = (o, k) => (o && typeof o[k] === "string" && o[k] !== "" ? o[k] : null);
const strs = (a) => (Array.isArray(a) ? a.map(String) : []);

/** Everything the party tab shows, derived from the room state (same rules as Party.kt). */
export function partyView(state, myPid) {
  const round = Math.max(1, (state.party && typeof state.party.round === "number" ? state.party.round : 1) | 0);
  const playersMap = new Map();
  for (const [k, v] of Object.entries(state)) {
    if (k.startsWith("player:") && v) playersMap.set(k.slice(7), v.name || "Player");
  }
  for (const [k, v] of Object.entries(state)) {
    const m = k.match(/^(bet|dead|mini):\d+:(.+)$/);
    if (m && v && !playersMap.has(m[2])) playersMap.set(m[2], v.name || "Player");
  }
  let players = [...playersMap.entries()].map(([pid, name]) => ({ pid, name }));
  players = [...players.filter((p) => p.pid === myPid), ...players.filter((p) => p.pid !== myPid).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))];

  const bets = (r) => Object.entries(state).filter(([k]) => k.startsWith(`bet:${r}:`)).map(([k, v]) => ({ pid: k.split(":")[2], name: v.name || "Player", ghost: str(v, "ghost"), mapId: str(v, "map"), room: str(v, "room"), death: str(v, "death"), at: v.at || 0 })).sort((a, b) => a.at - b.at);
  const result = (r) => { const v = state[`result:${r}`]; return v ? { ghost: str(v, "ghost"), mapId: str(v, "map"), room: str(v, "room"), deaths: strs(v.deaths), by: v.by || "", at: v.at || 0 } : null; };
  const scoredRounds = Object.keys(state).filter((k) => k.startsWith("result:")).map((k) => parseInt(k.slice(7), 10)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
  const challenges = Object.entries(state).filter(([k]) => k.startsWith("challenge:")).map(([k, v]) => ({ n: parseInt(k.slice(10), 10), id: v.id || "", level: v.level || 1, team: !!v.team, targets: strs(v.targets), names: strs(v.names), text: v.text || "", status: v.status || STATUS_ACTIVE, by: v.by || "", at: v.at || 0 })).filter((c) => !isNaN(c.n)).sort((a, b) => a.n - b.n);
  const roles = (state.roles && state.roles.assignments) || {};
  const dead = (r) => Object.keys(state).filter((k) => k.startsWith(`dead:${r}:`)).map((k) => k.split(":")[2]);
  const minis = Object.entries(state).filter(([k]) => k.startsWith("mini:")).map(([k, v]) => ({ pid: k.split(":")[2], name: v.name || "Player", points: v.points || 0, tries: v.tries || 0 }));
  const bingoSeed = state.bingo && state.bingo.seed != null ? state.bingo.seed : null;
  const bingoShared = state.bingo ? state.bingo.shared !== false : true;
  const bingoMarks = bingoSeed == null ? [] : Object.entries(state).filter(([k]) => k.startsWith("bingomark:")).map(([k, v]) => ({ pid: k.slice(10), name: v.name || "Player", seed: v.seed, cells: new Set(strs(v.cells).map(Number)) })).filter((m) => m.seed === bingoSeed);
  const betsByRound = Object.fromEntries(scoredRounds.map((r) => [r, bets(r)]));
  const results = Object.fromEntries(scoredRounds.map((r) => [r, result(r)]).filter(([, v]) => v));
  return {
    round, players, bets, result, scoredRounds, challenges, currentChallenge: challenges[challenges.length - 1] || null, roles, dead, minis,
    bingoSeed, bingoShared, bingoMarks, scores: scoreboard(players, betsByRound, results, challenges, minis, bingoMarks),
    playerName: (pid) => playersMap.get(pid) || pid,
  };
}
