/**
 * Spectral Journal – web room client. Joins a team room of the Android app from any browser
 * (iPhone, laptop, a friend without the app): shared evidence journal with the same ghost filter,
 * timers that alert every phone, sanity, notes, team pings and the party mode (bets, challenges,
 * roles, bingo, scoreboard). Talks to the same Cloudflare Worker as the app; no account, nothing
 * stored but your nickname and a random player id in this browser.
 */
import { GHOSTS, EVIDENCE } from "./ghosts.js";
import { BINGO, BINGO_FREE, BINGO_SIDE, ROLES, PARTY_CHALLENGES, MAPS } from "./party-data.js";
import { dealCard } from "./kotlin-random.js";
import {
  EV_IDS, UNKNOWN, FOUND, RULED_OUT, ghostById, possibleGhosts, incensePlan, cooldownPlan, uvMilestones, huntDuration, uvSeconds,
  partyView, bingoLines, bingoFull, bingoPoints, betPoints, NONE, STATUS_ACTIVE, STATUS_DONE, STATUS_FAILED,
} from "./logic.js";

const DEFAULT_SERVER = "https://spectral-journal.high-beach-hotels.workers.dev";
const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
const PID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TIMER_KINDS = ["SMUDGE", "COOLDOWN", "HUNT", "UV"];

/* ------------------------------------------------------------------ i18n */
const T = {
  en: {
    tagline: "Team room for Phasmophobia nights – join from any phone or browser.",
    name: "Your name", code: "Room code", join: "Join room", create: "Create a new room", or: "or",
    howTitle: "How it works", how1: "Someone creates a room (here or in the Android app) and shares the 5-letter code.",
    how2: "Evidence, ghosts, timers, sanity, notes and party mode stay in sync on every device.", how3: "No account. Rooms delete themselves 24 h after the last activity.",
    androidNote: "The Android app adds behaviours, maps, voice alerts and more – this page is the lightweight version for everyone else.",
    badCode: "Codes have 5 letters/digits (no 0, O, 1, I).", noRoom: "No room with this code – check it or create a new one.", cantReach: "Cannot reach the room server right now.",
    full: "The room is full (8 players).", connecting: "connecting…", reconnecting: "reconnecting…", live: "live",
    tabJournal: "Journal", tabTimers: "Timers", tabParty: "Party",
    evidenceCount: "Evidence given by the difficulty", possible: (n) => `${n} ghosts possible`, identified: "Identified", noMatch: "No ghost matches – check the journal",
    clear: "Clear journal", tapHint: "Tap once = found, twice = ruled out.", phonesFilter: "Dimmed: ruled out on a phone by behaviours or speed.",
    ghosts: "Ghosts", huntAt: "Hunts at", speed: "Speed", los: "Speeds up with line of sight", noLos: "No line-of-sight speed-up", incense: "Incense", cooldown: "Cooldown", tells: "How to tell",
    guaranteed: "always shown on Nightmare/Insanity", fakeOrb: "can show a fake Ghost Orb",
    tSMUDGE: "Incense", tCOOLDOWN: "Cooldown", tHUNT: "Hunt", tUV: "UV prints", start: "Start", stop: "Stop", others: "others", canHunt: (w) => `${w} can hunt again`,
    hunt: "Hunt", cursed: "+20 s cursed hunt", over: "over", setupLeft: "Setup", timerNote: "Timers run on every phone in the room; the app alerts with sound and voice.",
    sanity: "Average sanity", notes: "Notes", ghostName: "Ghost name", roomName: "Favourite room", pings: "Team pings", pHunt: "Hunt!", pCome: "Come here", pEvidence: "Evidence", pHelp: "Help",
    pingText: { hunt: "HUNT!", come: "come here", evidence: "found evidence", help: "needs help" },
    round: "Round", newRound: "New round", players: "Players", scoreboard: "Scoreboard", total: "Total", betsCol: "Bets", chalCol: "Chal.", bingoCol: "Bingo", miniCol: "Dead",
    challenge: "Challenge roulette", spin: "Spin", level: "Level", any: "any", team: "whole team", one: "one player", forWho: "for", done: "Done", failed: "Failed", active: "active",
    noChallenge: "No challenge yet – spin one before you go in.", roles: "Roles", spinRoles: "Draw roles", noRoles: "Nobody has a role yet.",
    bets: "Bets", myBet: "My bet for this round", ghostPick: "Ghost", mapPick: "Map", roomPick: "Ghost room", deathPick: "Who dies first?", nobody: "nobody dies", lock: "Lock bet", locked: "Bet locked", hidden: "hidden until you lock yours",
    result: "What really happened", confirm: "Confirm result", deaths: "Deaths", undo: "Undo result", pointsFmt: (n) => `${n} pts`, noBets: "No bets yet this round.",
    iDied: "I died ☠", alive: "I'm alive again", bingo: "Bingo", newBingoShared: "Shared card", newBingoOwn: "Own cards", endBingo: "End bingo", lines: (n) => `${n} line${n === 1 ? "" : "s"}`, fullCard: "FULL CARD!",
    bingoNote: "Tap the squares as they happen. First line 3 pts, each further line 1, full card +5.", free: "FREE", noBingo: "No bingo card tonight – deal one for everyone or one per player.",
    others: "others", unknown: "?", yes: "yes", no: "no", leave: "Leave the room?", you: "you", copied: "Code copied", soundOn: "Sound on", soundOff: "Sound off",
    footer: "Spectral Journal is a fan-made companion. Phasmophobia is a trademark of Kinetic Games; no game assets are used.",
  },
  el: {
    tagline: "Δωμάτιο ομάδας για βραδιές Phasmophobia – μπες από οποιοδήποτε κινητό ή browser.",
    name: "Το όνομά σου", code: "Κωδικός δωματίου", join: "Είσοδος", create: "Νέο δωμάτιο", or: "ή",
    howTitle: "Πώς δουλεύει", how1: "Κάποιος φτιάχνει δωμάτιο (εδώ ή στην εφαρμογή Android) και μοιράζεται τον 5ψήφιο κωδικό.",
    how2: "Αποδείξεις, φαντάσματα, χρονόμετρα, λογική, σημειώσεις και party mode συγχρονίζονται σε κάθε συσκευή.", how3: "Χωρίς λογαριασμό. Τα δωμάτια σβήνονται 24 ώρες μετά την τελευταία κίνηση.",
    androidNote: "Η εφαρμογή Android έχει επιπλέον συμπεριφορές, χάρτες, φωνητικές ειδοποιήσεις – αυτή η σελίδα είναι η ελαφριά έκδοση για όλους τους άλλους.",
    badCode: "Ο κωδικός έχει 5 γράμματα/ψηφία (χωρίς 0, O, 1, I).", noRoom: "Δεν υπάρχει δωμάτιο με αυτόν τον κωδικό – έλεγξέ τον ή φτιάξε νέο.", cantReach: "Ο server δωματίων δεν απαντά αυτή τη στιγμή.",
    full: "Το δωμάτιο είναι γεμάτο (8 παίκτες).", connecting: "σύνδεση…", reconnecting: "επανασύνδεση…", live: "ζωντανά",
    tabJournal: "Ημερολόγιο", tabTimers: "Χρονόμετρα", tabParty: "Party",
    evidenceCount: "Αποδείξεις που δίνει η δυσκολία", possible: (n) => `${n} πιθανά φαντάσματα`, identified: "Ταυτοποιήθηκε", noMatch: "Κανένα φάντασμα δεν ταιριάζει – έλεγξε το ημερολόγιο",
    clear: "Καθαρισμός", tapHint: "Ένα πάτημα = βρέθηκε, δύο = αποκλείστηκε.", phonesFilter: "Αχνά: αποκλείστηκαν σε κινητό από συμπεριφορές ή ταχύτητα.",
    ghosts: "Φαντάσματα", huntAt: "Κυνηγά από", speed: "Ταχύτητα", los: "Επιταχύνει με οπτική επαφή", noLos: "Χωρίς επιτάχυνση οπτικής επαφής", incense: "Θυμίαμα", cooldown: "Παύση", tells: "Πώς το καταλαβαίνεις",
    guaranteed: "πάντα ορατή σε Nightmare/Insanity", fakeOrb: "μπορεί να δείξει ψεύτικο Ghost Orb",
    tSMUDGE: "Θυμίαμα", tCOOLDOWN: "Παύση", tHUNT: "Κυνήγι", tUV: "Αποτυπώματα", start: "Έναρξη", stop: "Στοπ", others: "υπόλοιπα", canHunt: (w) => `${w}: μπορεί να κυνηγήσει ξανά`,
    hunt: "Κυνήγι", cursed: "+20 δ καταραμένο", over: "τέλος", setupLeft: "Προετοιμασία", timerNote: "Τα χρονόμετρα τρέχουν σε κάθε κινητό του δωματίου· η εφαρμογή ειδοποιεί με ήχο και φωνή.",
    sanity: "Μέση λογική", notes: "Σημειώσεις", ghostName: "Όνομα φαντάσματος", roomName: "Αγαπημένο δωμάτιο", pings: "Σήματα ομάδας", pHunt: "Κυνήγι!", pCome: "Ελάτε", pEvidence: "Απόδειξη", pHelp: "Βοήθεια",
    pingText: { hunt: "ΚΥΝΗΓΙ!", come: "ελάτε εδώ", evidence: "βρήκε απόδειξη", help: "θέλει βοήθεια" },
    round: "Γύρος", newRound: "Νέος γύρος", players: "Παίκτες", scoreboard: "Πίνακας", total: "Σύνολο", betsCol: "Στοιχ.", chalCol: "Προκλ.", bingoCol: "Bingo", miniCol: "Νεκρός",
    challenge: "Ρουλέτα προκλήσεων", spin: "Γύρνα", level: "Επίπεδο", any: "όποιο", team: "όλη η ομάδα", one: "ένας παίκτης", forWho: "για", done: "Έγινε", failed: "Απέτυχε", active: "ενεργή",
    noChallenge: "Καμία πρόκληση ακόμη – γύρνα τη ρουλέτα πριν μπείτε.", roles: "Ρόλοι", spinRoles: "Κλήρωση ρόλων", noRoles: "Κανείς δεν έχει ρόλο ακόμη.",
    bets: "Στοιχήματα", myBet: "Το στοίχημά μου για τον γύρο", ghostPick: "Φάντασμα", mapPick: "Χάρτης", roomPick: "Δωμάτιο φαντάσματος", deathPick: "Ποιος πεθαίνει πρώτος;", nobody: "κανείς", lock: "Κλείδωμα", locked: "Κλειδώθηκε", hidden: "κρυφό μέχρι να κλειδώσεις το δικό σου",
    result: "Τι έγινε στ' αλήθεια", confirm: "Επιβεβαίωση", deaths: "Θάνατοι", undo: "Αναίρεση", pointsFmt: (n) => `${n} π.`, noBets: "Κανένα στοίχημα ακόμη σε αυτόν τον γύρο.",
    iDied: "Πέθανα ☠", alive: "Ζωντανός ξανά", bingo: "Bingo", newBingoShared: "Κοινή κάρτα", newBingoOwn: "Δικές μας κάρτες", endBingo: "Τέλος bingo", lines: (n) => `${n} γραμμ${n === 1 ? "ή" : "ές"}`, fullCard: "ΓΕΜΑΤΗ ΚΑΡΤΑ!",
    bingoNote: "Πάτα τα τετράγωνα όταν συμβαίνουν. Πρώτη γραμμή 3 π., κάθε επόμενη 1, γεμάτη κάρτα +5.", free: "FREE", noBingo: "Καμία κάρτα bingo απόψε – μοίρασε μία για όλους ή μία ανά παίκτη.",
    others: "υπόλοιπα", unknown: "?", yes: "ναι", no: "όχι", leave: "Έξοδος από το δωμάτιο;", you: "εσύ", copied: "Ο κωδικός αντιγράφηκε", soundOn: "Ήχος ενεργός", soundOff: "Ήχος κλειστός",
    footer: "Το Spectral Journal είναι ανεπίσημη εφαρμογή θαυμαστών. Το Phasmophobia είναι σήμα της Kinetic Games· δεν χρησιμοποιείται υλικό του παιχνιδιού.",
  },
};
let L = T.en;
const greek = () => S.lang === "el";
const evName = (id) => { const e = EVIDENCE.find((x) => x.id === id); return e ? (greek() ? e.el : e.en) : id; };
const letters = (g) => EVIDENCE.filter((e) => g.evidence.includes(e.id)).map((e) => e.letter).join("");
const mapName = (id) => (MAPS.find((m) => m.id === id) || {}).name || id || L.unknown;
const challengeText = (c) => { const pc = PARTY_CHALLENGES.find((x) => x.id === c.id); return pc ? (greek() ? pc.el : pc.en) : c.text; };
const roleOf = (id) => ROLES.find((r) => r.id === id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clock = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ state */
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("sj." + k); return v == null ? d : v; } catch (_) { return d; } },
  set: (k, v) => { try { localStorage.setItem("sj." + k, v); } catch (_) { /* private mode */ } },
};
const params = new URLSearchParams(location.search);
const S = {
  server: (params.get("server") || store.get("server", DEFAULT_SERVER)).replace(/\/+$/, ""),
  pid: store.get("pid", "") || null,
  name: store.get("name", ""),
  lang: store.get("lang", (navigator.language || "en").toLowerCase().startsWith("el") ? "el" : "en"),
  sound: store.get("sound", "1") === "1",
  code: null, ws: null, state: {}, members: [], me: null, status: "idle", tab: store.get("tab", "journal"), cursed: false,
  wantRoom: false, retry: 0, fired: new Set(), pingAt: 0, dirty: false,
};
if (!S.pid || S.pid.length < 4) { S.pid = Array.from({ length: 6 }, () => PID_ALPHABET[Math.floor(Math.random() * PID_ALPHABET.length)]).join(""); store.set("pid", S.pid); }
if (params.get("server")) store.set("server", S.server);
L = T[S.lang] || T.en;

const myName = () => (S.me && S.me.name) || S.name || "Player";
const evStates = () => { const ev = S.state.evidence || {}; const o = {}; for (const id of EV_IDS) o[id] = ev[id] || UNKNOWN; return o; };
const evCount = () => (typeof S.state.evidenceCount === "number" ? S.state.evidenceCount : 3);
const candidates = () => possibleGhosts(evStates(), evCount());
const othersInRoom = () => S.members.filter((m) => !S.me || m.id !== S.me.id).length;

/* ------------------------------------------------------------------ connection */
function send(obj) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj)); }
function applyLocal(patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (k === "timers" && v && typeof v === "object") S.state.timers = Object.assign(S.state.timers || {}, v);
    else if (v === null) delete S.state[k];
    else S.state[k] = v;
  }
}
/** Sends a patch and applies it locally (what we hold is what the room holds). */
function patch(p) { applyLocal(p); send({ type: "patch", patch: p }); render(); }

async function join(code, create = false) {
  $("joinError").textContent = "";
  let c = code;
  try {
    if (create) {
      const r = await fetch(S.server + "/api/rooms", { method: "POST" });
      if (!r.ok) throw new Error("create");
      c = (await r.json()).code;
    } else {
      const r = await fetch(S.server + "/api/rooms/" + c, { cache: "no-store" });
      if (r.status === 404) { $("joinError").textContent = L.noRoom; return; }
      if (!r.ok) throw new Error("probe");
    }
  } catch (_) { $("joinError").textContent = L.cantReach; return; }
  S.code = c; S.wantRoom = true; S.retry = 0; S.state = {}; S.members = []; S.me = null;
  store.set("name", S.name); store.set("lastCode", c);
  history.replaceState(null, "", "?room=" + c);
  showMain();
  connect();
}

function connect() {
  if (!S.wantRoom || !S.code) return;
  S.status = S.retry ? "reconnecting" : "connecting"; renderHeader();
  const url = S.server.replace(/^http/, "ws") + `/api/rooms/${S.code}/ws?name=${encodeURIComponent(S.name || "Player")}`;
  const ws = new WebSocket(url);
  S.ws = ws;
  ws.onopen = () => { S.retry = 0; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    if (m.type === "hello") {
      S.state = m.state || {}; S.members = m.members || []; S.me = m.you; S.status = "live";
      // announce myself for the party (same fact the phones write)
      patch({ [`player:${S.pid}`]: { name: myName(), at: Date.now() } });
    } else if (m.type === "patch") {
      applyLocal(m.patch);
      if (m.patch.ping) onPing(m.patch.ping);
    } else if (m.type === "reset") { S.state = {}; S.fired.clear(); }
    else if (m.type === "members") S.members = m.members || [];
    else if (m.type === "error") toast(m.message);
    render();
  };
  ws.onclose = (e) => {
    if (S.ws !== ws) return;
    if (!S.wantRoom) return;
    if (e.code === 4000) { toast(L.noRoom); leave(); return; }
    S.status = "reconnecting"; renderHeader();
    S.retry++;
    setTimeout(connect, Math.min(15000, 1000 * Math.pow(1.6, S.retry)));
  };
  ws.onerror = () => { try { ws.close(); } catch (_) { /* ignore */ } };
}

function leave() {
  S.wantRoom = false;
  try { S.ws && S.ws.close(); } catch (_) { /* ignore */ }
  S.ws = null; S.code = null; S.state = {}; S.members = []; S.me = null; S.status = "idle";
  history.replaceState(null, "", location.pathname);
  showJoin();
}

/* ------------------------------------------------------------------ alerts */
let audio = null;
function unlockAudio() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (_) { /* no audio */ } }
function beep(times = 1, freq = 880) {
  if (!S.sound || !audio) return;
  for (let i = 0; i < times; i++) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine"; o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    const t = audio.currentTime + i * 0.25;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.start(t); o.stop(t + 0.22);
  }
}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (_) { /* ignore */ } }
function speak(text) {
  if (!S.sound || !("speechSynthesis" in window)) return;
  try { const u = new SpeechSynthesisUtterance(text); u.lang = greek() ? "el-GR" : "en-US"; speechSynthesis.speak(u); } catch (_) { /* ignore */ }
}
function toast(text, ms = 2500) { const t = $("toast"); t.textContent = text; t.classList.remove("hidden"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add("hidden"), ms); }

function onPing(p) {
  if (!p || !p.at || p.at <= S.pingAt || Date.now() - p.at > 20000) return;
  S.pingAt = p.at;
  const txt = (p.kind === "hunt" ? "🏃 " : p.kind === "come" ? "📍 " : p.kind === "evidence" ? "🔍 " : "🆘 ") + esc(p.from || "") + " · " + (L.pingText[p.kind] || p.kind);
  const b = $("pingBanner"); b.innerHTML = txt; b.classList.remove("hidden");
  vibrate(p.kind === "hunt" ? [300, 100, 300, 100, 300] : p.kind === "help" ? [500, 200, 500] : [200]);
  beep(p.kind === "hunt" ? 3 : 1, p.kind === "hunt" ? 660 : 880);
  clearTimeout(onPing.h); onPing.h = setTimeout(() => b.classList.add("hidden"), 8000);
}
function sendPing(kind) {
  const p = { kind, from: myName(), at: Date.now(), nonce: Math.random().toString(36).slice(2, 8) };
  send({ type: "patch", patch: { ping: p } });
  toast(L["p" + kind[0].toUpperCase() + kind.slice(1)] + " ✓", 1200);
}

/** Every 250 ms: tick the clocks and fire milestone / end alerts for running timers. */
function tick() {
  const now = Date.now();
  const timers = S.state.timers || {};
  for (const kind of TIMER_KINDS) {
    const t = timers[kind]; if (!t || !t.endAt) continue;
    const elapsed = (t.total || 0) - (t.endAt - now) / 1000;
    for (const [sec, label] of t.milestones || []) {
      const key = `${kind}:${t.endAt}:${sec}`;
      if (elapsed >= sec && !S.fired.has(key)) { S.fired.add(key); beep(2, 988); vibrate([200, 100, 200]); if (kind === "SMUDGE" || kind === "COOLDOWN") speak(L.canHunt(label)); else speak(label); toast(`${L["t" + kind]}: ${label}`); }
    }
    const endKey = `${kind}:${t.endAt}:end`;
    if (now >= t.endAt && !S.fired.has(endKey)) { S.fired.add(endKey); beep(3, 523); vibrate([400, 150, 400]); toast(`${L["t" + kind]} – ${L.over}`); }
    const el = document.querySelector(`[data-clock="${kind}"]`);
    if (el) {
      const left = (t.endAt - now) / 1000;
      el.textContent = left > 0 ? clock(S.state.countUp === false ? left : elapsed) : clock(S.state.countUp === false ? 0 : t.total || 0);
      const card = el.closest(".t"); if (card) { card.classList.toggle("run", left > 0); card.classList.toggle("done", left <= 0); }
    }
  }
  const c = S.state.contract;
  const se = document.querySelector("[data-setup]");
  if (se && c && c.running && c.setupSeconds) { const left = c.setupSeconds - (now - c.startedAt) / 1000; se.textContent = left > 0 ? `${L.setupLeft} ${clock(left)}` : ""; }
}
setInterval(tick, 250);

/* ------------------------------------------------------------------ actions: journal & timers */
function cycleEvidence(id) {
  const ev = evStates();
  ev[id] = ev[id] === UNKNOWN ? FOUND : ev[id] === FOUND ? RULED_OUT : UNKNOWN;
  const p = { evidence: ev };
  if (othersInRoom() === 0) p.possible = possibleGhosts(ev, evCount()).map((g) => g.id);
  patch(p);
}
function setCount(n) { const p = { evidenceCount: n }; if (othersInRoom() === 0) p.possible = possibleGhosts(evStates(), n).map((g) => g.id); patch(p); }
function clearJournal() { const ev = {}; for (const id of EV_IDS) ev[id] = UNKNOWN; const p = { evidence: ev }; if (othersInRoom() === 0) p.possible = GHOSTS.map((g) => g.id); patch(p); }

function startTimer(kind) {
  const cands = candidates();
  let total, label = "", milestones = [];
  if (kind === "SMUDGE") ({ total, label, milestones } = incensePlan(cands, L.others));
  else if (kind === "COOLDOWN") ({ total, label, milestones } = cooldownPlan(cands, L.others));
  else if (kind === "HUNT") total = huntDuration(S.state.difficulty || "PROFESSIONAL", S.state.mapSize || "MEDIUM", S.cursed);
  else { total = uvSeconds(S.state.difficulty || "PROFESSIONAL"); milestones = uvMilestones(cands, total); }
  patch({ timers: { [kind]: { endAt: Date.now() + total * 1000, total, label, milestones } } });
}
function stopTimer(kind) { patch({ timers: { [kind]: null } }); }

let notesTimer = null;
function setNotes(field, value) {
  const notes = Object.assign({}, S.state.notes || {}); notes[field] = value; S.state.notes = notes;
  clearTimeout(notesTimer); notesTimer = setTimeout(() => send({ type: "patch", patch: { notes } }), 350);
}
let sanityTimer = null;
function setSanity(v) { S.state.sanity = v; clearTimeout(sanityTimer); sanityTimer = setTimeout(() => send({ type: "patch", patch: { sanity: v } }), 250); const el = $("sanityVal"); if (el) el.textContent = `${v} %`; }

/* ------------------------------------------------------------------ actions: party (same facts as Party.kt) */
const now = () => Date.now();
function party() { return partyView(S.state, S.pid); }
function writeFact(key, value) { patch({ [key]: value === null ? null : value }); }
function newRound() { writeFact("party", { round: party().round + 1, at: now() }); }
function lockBet(ghost, mapId, room, death) {
  if (!ghost && !room && !death) return;
  writeFact(`bet:${party().round}:${S.pid}`, { name: myName(), ghost: ghost || null, map: mapId || null, room: room || null, death: death || null, at: now() });
}
function scoreRound(ghost, mapId, room, deaths) { writeFact(`result:${party().round}`, { ghost: ghost || null, map: mapId || null, room: room || null, deaths, by: myName(), at: now() }); }
function unscoreRound() { writeFact(`result:${party().round}`, null); }
function spin(level, team) {
  const v = party(); const all = v.players; if (!all.length) return;
  const deadNow = v.dead(v.round);
  const alive = all.filter((p) => !deadNow.includes(p.pid)); const pool0 = alive.length ? alive : all;
  const targets = team ? all : [pool0[Math.floor(Math.random() * pool0.length)]];
  const recent = new Set(v.challenges.slice(-10).map((c) => c.id));
  const pool = PARTY_CHALLENGES.filter((c) => (level === 0 || c.level === level) && (c.scope === "ANY" || (team && c.scope === "TEAM") || (!team && c.scope === "PERSONAL")));
  const fresh = pool.filter((c) => !recent.has(c.id)); const from = fresh.length ? fresh : pool; if (!from.length) return;
  const pick = from[Math.floor(Math.random() * from.length)];
  const n = (v.currentChallenge ? v.currentChallenge.n : 0) + 1;
  writeFact(`challenge:${n}`, { id: pick.id, level: pick.level, team, targets: targets.map((p) => p.pid), names: targets.map((p) => p.name), text: pick.en, status: STATUS_ACTIVE, by: myName(), at: now() });
}
function setChallengeStatus(n, status) { const o = S.state[`challenge:${n}`]; if (!o) return; writeFact(`challenge:${n}`, Object.assign({}, o, { status, statusBy: myName(), statusAt: now() })); }
function spinRoles() {
  const ps = party().players; if (!ps.length) return;
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const roles = shuffle(ROLES), order = shuffle(ps); const assignments = {}, names = {};
  order.forEach((p, i) => { assignments[p.pid] = roles[i % roles.length].id; names[p.pid] = p.name; });
  writeFact("roles", { assignments, names, by: myName(), at: now() });
}
function setDead(dead) { writeFact(`dead:${party().round}:${S.pid}`, dead ? { name: myName(), at: now() } : null); }
function newBingo(shared) { writeFact("bingo", { seed: now(), shared, by: myName(), at: now() }); }
function endBingo() { const p = { bingo: null }; for (const k of Object.keys(S.state)) if (k.startsWith("bingomark:")) p[k] = null; patch(p); }
function toggleBingoCell(i) {
  const v = party(); if (v.bingoSeed == null || i === BINGO_FREE) return;
  const mine = v.bingoMarks.find((m) => m.pid === S.pid); const cells = new Set(mine ? mine.cells : []);
  cells.has(i) ? cells.delete(i) : cells.add(i);
  writeFact(`bingomark:${S.pid}`, { name: myName(), seed: v.bingoSeed, cells: [...cells].sort((a, b) => a - b), at: now() });
}

/* ------------------------------------------------------------------ rendering */
function showJoin() {
  $("main").classList.add("hidden"); $("join").classList.remove("hidden");
  const last = params.get("room") || store.get("lastCode", "");
  $("join").innerHTML = `
    <div class="row between"><div class="logo">👻</div><div class="row"><button id="jLang">${S.lang === "el" ? "EN" : "EL"}</button></div></div>
    <h1>Spectral Journal</h1><p class="tag">${L.tagline}</p>
    <div class="card">
      <label class="f" for="jName">${L.name}</label><input id="jName" type="text" maxlength="24" autocomplete="nickname" value="${esc(S.name)}">
      <label class="f" for="jCode">${L.code}</label><input id="jCode" class="code-input" type="text" maxlength="5" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="ABCDE" value="${esc(last)}">
      <div id="joinError"></div>
      <button id="jJoin" class="primary" style="width:100%;margin-top:6px">${L.join}</button>
      <div class="or">${L.or}</div>
      <button id="jCreate" style="width:100%">${L.create}</button>
    </div>
    <div class="card"><h3>${L.howTitle}</h3><ul><li>${L.how1}</li><li>${L.how2}</li><li>${L.how3}</li></ul><p class="muted small" style="margin:8px 0 0">${L.androidNote}</p></div>
    <p class="muted tiny">${L.footer}</p>`;
  $("jLang").onclick = () => { setLang(S.lang === "el" ? "en" : "el"); showJoin(); };
  $("jCode").addEventListener("input", (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5); });
  const go = (create) => { unlockAudio(); S.name = $("jName").value.trim().slice(0, 24); const c = $("jCode").value.trim().toUpperCase(); if (!create && !CODE_RE.test(c)) { $("joinError").textContent = L.badCode; return; } join(c, create); };
  $("jJoin").onclick = () => go(false); $("jCreate").onclick = () => go(true);
  $("jCode").addEventListener("keydown", (e) => { if (e.key === "Enter") go(false); });
}
function showMain() { $("join").classList.add("hidden"); $("main").classList.remove("hidden"); renderHeader(); renderTabs(); render(); }

function setLang(l) { S.lang = l; L = T[l] || T.en; store.set("lang", l); document.documentElement.lang = l; $("btnLang").textContent = l === "el" ? "EN" : "EL"; }

function renderHeader() {
  if (!S.code) return;
  $("hdrCode").textContent = S.code;
  const dot = $("dot"); dot.className = "dot " + (S.status === "live" ? "live" : S.status === "idle" ? "" : "wait");
  const names = S.members.map((m) => (S.me && m.id === S.me.id ? `${esc(m.name)} (${L.you})` : esc(m.name)));
  $("hdrMembers").innerHTML = S.status === "live" ? names.join(", ") : `<span class="amber">${L[S.status] || S.status}</span>`;
  $("btnSound").textContent = S.sound ? "🔔" : "🔕";
  $("btnLang").textContent = S.lang === "el" ? "EN" : "EL";
}
function renderTabs() {
  $("tabs").innerHTML = [["journal", "📓", L.tabJournal], ["timers", "⏱", L.tabTimers], ["party", "🎉", L.tabParty]]
    .map(([id, ic, label]) => `<button data-tab="${id}" class="${S.tab === id ? "on" : ""}"><span>${ic}</span>${label}</button>`).join("");
}

/** Re-renders the current tab; skipped while an input is focused (the next change re-renders). */
function render() {
  if (!S.code) return;
  renderHeader();
  const a = document.activeElement;
  if (a && $("content").contains(a) && (a.tagName === "INPUT" || a.tagName === "SELECT")) { S.dirty = true; return; }
  S.dirty = false;
  const html = S.tab === "journal" ? renderJournal() : S.tab === "timers" ? renderTimers() : renderParty();
  $("content").innerHTML = html;
  if (S.tab === "party") {
    // selects cannot carry their value in markup – restore my locked bet and sensible result defaults
    const v = party(); const mine = v.bets(v.round).find((b) => b.pid === S.pid);
    const set = (id, val) => { const el = $(id); if (el && val != null) el.value = val; };
    if (mine) { set("betGhost", mine.ghost || ""); set("betMap", mine.mapId || ""); set("betDeath", mine.death || ""); }
    const single = candidates(); if (single.length === 1) set("resGhost", single[0].id);
    set("resMap", mine?.mapId || "");
    set("spinLevel", S.spinLevel || "0"); set("spinTeam", S.spinTeam || "0");
  }
  tick();
}

function renderJournal() {
  const ev = evStates(), count = evCount(), cands = candidates();
  const phones = Array.isArray(S.state.possible) && othersInRoom() > 0 ? new Set(S.state.possible) : null;
  const shown = phones ? cands.filter((g) => phones.has(g.id)) : cands;
  const head = shown.length === 0 ? `<span class="red">${L.noMatch}</span>` : shown.length === 1 ? `<span class="green">${L.identified}: <b>${esc(shown[0].name)}</b></span>` : L.possible(shown.length);
  return `
    <div class="card">
      <div class="muted small" style="margin-bottom:6px">${L.evidenceCount}</div>
      <div class="seg">${[3, 2, 1, 0].map((n) => `<button data-count="${n}" class="${count === n ? "on" : ""}">${n}</button>`).join("")}</div>
      <div class="muted tiny" style="margin-top:6px">${L.tapHint}</div>
      <div class="evgrid" style="margin-top:10px">${EVIDENCE.map((e) => `<button class="ev ${ev[e.id] === FOUND ? "found" : ev[e.id] === RULED_OUT ? "out" : ""}" data-ev="${e.id}"><span class="k">${ev[e.id] === FOUND ? "✓" : ev[e.id] === RULED_OUT ? "✕" : e.letter}</span>${esc(greek() ? e.el : e.en)}</button>`).join("")}</div>
      <div class="row between" style="margin-top:10px"><div>${head}</div><button class="ghost" data-act="clear">${L.clear}</button></div>
    </div>
    <div class="ggrid">${GHOSTS.map((g) => {
      const ok = cands.some((c) => c.id === g.id); const dim = ok && phones && !phones.has(g.id);
      return `<button class="g ${!ok ? "out" : dim ? "dim" : ""} ${shown.length === 1 && shown[0].id === g.id ? "one" : ""}" data-ghost="${g.id}"><span class="n">${esc(g.name)}</span><span class="e">${letters(g)}${g.fakeOrb ? "+o" : ""} · ${g.huntAt}%</span></button>`;
    }).join("")}</div>
    ${phones ? `<p class="muted tiny" style="margin-top:8px">${L.phonesFilter}</p>` : ""}`;
}

function renderTimers() {
  const timers = S.state.timers || {}; const cands = candidates();
  const plans = { SMUDGE: incensePlan(cands, L.others), COOLDOWN: cooldownPlan(cands, L.others) };
  const diff = S.state.difficulty || "PROFESSIONAL", size = S.state.mapSize || "MEDIUM";
  const tcard = (kind) => {
    const t = timers[kind]; const running = t && t.endAt && t.endAt > Date.now();
    let sub = "";
    if (kind === "SMUDGE" || kind === "COOLDOWN") { const p = running ? t : plans[kind]; sub = (p.milestones || []).length ? `<span class="ms">${p.milestones.map(([s, l]) => `<b>${clock(p.total - s)}</b> ${esc(l)}`).join(" · ")}</span>` : esc(p.label || ""); }
    else if (kind === "HUNT") sub = `<span class="ms">${esc(diff.toLowerCase())} · ${esc(size.toLowerCase())} · ${running ? t.total : huntDuration(diff, size, S.cursed)} s</span>`;
    else sub = `<span class="ms">${running ? t.total : uvSeconds(diff)} s${uvMilestones(cands, 120).length ? ` · <b>Obake ½</b>` : ""}</span>`;
    return `<div class="t ${running ? "run" : t && t.endAt ? "done" : ""}"><div class="n">${L["t" + kind]}</div><div class="c" data-clock="${kind}">${t && t.endAt ? "" : clock(kind === "HUNT" ? huntDuration(diff, size, S.cursed) : kind === "UV" ? uvSeconds(diff) : plans[kind].total)}</div><div class="l">${sub}</div>
      ${running ? `<button class="danger" data-stop="${kind}">${L.stop}</button>` : `<button class="ok" data-start="${kind}">${L.start}</button>`}</div>`;
  };
  const sanity = typeof S.state.sanity === "number" ? Math.round(S.state.sanity) : 100;
  const notes = S.state.notes || {};
  return `
    <div class="timers">${TIMER_KINDS.map(tcard).join("")}</div>
    <div class="row between" style="margin:8px 2px"><label class="row small"><input type="checkbox" id="cursed" ${S.cursed ? "checked" : ""}> ${L.cursed}</label><span class="muted tiny" data-setup></span></div>
    <p class="muted tiny" style="margin:0 2px 12px">${L.timerNote}</p>
    <div class="card"><h3>${L.pings}</h3><div class="pings">
      <button data-ping="hunt"><span>🏃</span>${L.pHunt}</button><button data-ping="come"><span>📍</span>${L.pCome}</button><button data-ping="evidence"><span>🔍</span>${L.pEvidence}</button><button data-ping="help"><span>🆘</span>${L.pHelp}</button></div></div>
    <div class="card"><div class="row between"><h3 style="margin:0">${L.sanity}</h3><b id="sanityVal" class="amber">${sanity} %</b></div><input type="range" id="sanity" min="0" max="100" step="1" value="${sanity}"></div>
    <div class="card"><h3>${L.notes}</h3>
      <label class="f">${L.ghostName}</label><input type="text" id="noteGhost" maxlength="40" value="${esc(notes.ghostName || "")}">
      <label class="f">${L.roomName}</label><input type="text" id="noteRoom" maxlength="40" value="${esc(notes.room || "")}"></div>`;
}

function renderParty() {
  const v = party(); const r = v.round; const deadNow = v.dead(r); const amDead = deadNow.includes(S.pid);
  const res = v.result(r); const bets = v.bets(r); const mine = bets.find((b) => b.pid === S.pid);
  const playerOpts = v.players.map((p) => `<option value="${esc(p.pid)}">${esc(p.name)}</option>`).join("");
  const ghostOpts = `<option value="">${L.unknown}</option>` + GHOSTS.slice().sort((a, b) => a.name.localeCompare(b.name)).map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
  const mapOpts = `<option value="">${L.unknown}</option>` + MAPS.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  const c = v.currentChallenge;
  const betText = (b) => [b.ghost ? ghostById[b.ghost]?.name : null, b.mapId ? mapName(b.mapId) : null, b.room, b.death ? (b.death === NONE ? L.nobody : `☠ ${v.playerName(b.death)}`) : null].filter(Boolean).join(" · ");

  const scoreRows = v.scores.map((s, i) => `<tr><td>${i + 1}. ${esc(s.name)}${s.pid === S.pid ? ` <span class="violet tiny">${L.you}</span>` : ""}</td><td class="r">${s.bets}</td><td class="r">${s.challenges}</td><td class="r">${s.mini}</td><td class="r">${s.bingo}</td><td class="r"><b>${s.total}</b></td></tr>`).join("");

  let bingoHtml;
  if (v.bingoSeed == null) bingoHtml = `<p class="muted small">${L.noBingo}</p><div class="row"><button class="ok" data-act="bingo-shared">${L.newBingoShared}</button><button data-act="bingo-own">${L.newBingoOwn}</button></div>`;
  else {
    const card = dealCard(BINGO, v.bingoSeed, v.bingoShared ? null : S.pid, BINGO_SIDE, BINGO_FREE);
    const mineM = v.bingoMarks.find((m) => m.pid === S.pid); const cells = new Set(mineM ? mineM.cells : []);
    const lines = bingoLines(cells), full = bingoFull(cells);
    const lineCells = completedLineCells(cells);
    bingoHtml = `<div class="row between" style="margin-bottom:8px"><span class="small">${v.bingoShared ? L.newBingoShared : L.newBingoOwn} · <b class="green">${L.lines(lines)}</b>${full ? ` · <b class="amber">${L.fullCard}</b>` : ""} · ${L.pointsFmt(bingoPoints(lines, full))}</span><button class="ghost small" data-act="bingo-end">${L.endBingo}</button></div>
      <div class="bingo">${card.map((e, i) => e === null ? `<button class="free" disabled>★<br>${L.free}</button>` : `<button data-cell="${i}" class="${cells.has(i) ? "on" : ""} ${lineCells.has(i) ? "line" : ""}">${esc(greek() ? e.el : e.en)}</button>`).join("")}</div>
      <p class="muted tiny" style="margin:8px 0 0">${L.bingoNote}</p>
      ${v.bingoMarks.filter((m) => m.pid !== S.pid).map((m) => `<div class="small muted">${esc(m.name)}: ${m.cells.size}/24 · ${L.lines(bingoLines(m.cells))}</div>`).join("")}`;
  }

  return `
    <div class="card"><div class="row between"><h3 style="margin:0">${L.round} ${r}</h3><div class="row"><button class="${amDead ? "ok" : "danger"}" data-act="dead">${amDead ? L.alive : L.iDied}</button><button data-act="new-round">${L.newRound}</button></div></div>
      <div class="chips" style="margin-top:10px">${v.players.map((p) => `<span class="chip ${p.pid === S.pid ? "me" : ""} ${deadNow.includes(p.pid) ? "dead" : ""}">${esc(p.name)}${v.roles[p.pid] ? ` ${roleOf(v.roles[p.pid])?.emoji || ""}` : ""}</span>`).join("")}</div></div>
    <div class="card"><h3>${L.scoreboard}</h3><table><thead><tr><th>${L.players}</th><th class="r">${L.betsCol}</th><th class="r">${L.chalCol}</th><th class="r">${L.miniCol}</th><th class="r">${L.bingoCol}</th><th class="r">${L.total}</th></tr></thead><tbody>${scoreRows}</tbody></table></div>
    <div class="card"><h3>${L.challenge}</h3>
      ${c ? `<div style="margin-bottom:10px"><span class="stars">${"★".repeat(c.level)}</span> <b>${esc(challengeText(c))}</b><div class="muted small">${L.forWho} ${c.team ? L.team : esc(c.names.join(", "))} · ${c.status === STATUS_DONE ? `<span class="green">✓ ${L.done}</span>` : c.status === STATUS_FAILED ? `<span class="red">✕ ${L.failed}</span>` : L.active}</div>
        ${c.status === STATUS_ACTIVE ? `<div class="row" style="margin-top:8px"><button class="ok" data-status="done">${L.done}</button><button class="danger" data-status="failed">${L.failed}</button></div>` : ""}</div>` : `<p class="muted small">${L.noChallenge}</p>`}
      <div class="row"><select id="spinLevel" style="flex:1"><option value="0">${L.level}: ${L.any}</option><option value="1">★</option><option value="2">★★</option><option value="3">★★★</option></select><select id="spinTeam" style="flex:1"><option value="0">${L.one}</option><option value="1">${L.team}</option></select><button class="primary" data-act="spin">🎲 ${L.spin}</button></div></div>
    <div class="card"><div class="row between"><h3 style="margin:0">${L.roles}</h3><button data-act="roles">${L.spinRoles}</button></div>
      ${Object.keys(v.roles).length ? `<div style="margin-top:8px">${Object.entries(v.roles).map(([pid, rid]) => { const ro = roleOf(rid); return `<div class="small" style="margin:4px 0">${ro ? ro.emoji : ""} <b>${esc(v.playerName(pid))}</b> – ${ro ? esc(greek() ? ro.el : ro.en) : esc(rid)}<div class="muted tiny">${ro ? esc(greek() ? ro.descEl : ro.descEn) : ""}</div></div>`; }).join("")}</div>` : `<p class="muted small" style="margin:8px 0 0">${L.noRoles}</p>`}</div>
    <div class="card"><h3>${L.bets} <small>${L.round} ${r}</small></h3>
      ${res ? `<div class="small" style="margin-bottom:8px"><b>${L.result}:</b> ${esc(betText({ ghost: res.ghost, mapId: res.mapId, room: res.room, death: null }))}${res.deaths.length ? ` · ☠ ${res.deaths.map((d) => esc(v.playerName(d))).join(", ")}` : ` · ${L.nobody}`} <button class="ghost tiny" data-act="unscore">${L.undo}</button></div>` : ""}
      ${bets.length ? bets.map((b) => `<div class="small" style="margin:3px 0">${esc(b.name)}: ${res || mine || b.pid === S.pid ? esc(betText(b)) : `<span class="muted">${L.hidden}</span>`}${res ? ` <b class="green">+${betPoints(b, res)}</b>` : ""}</div>`).join("") : `<p class="muted small">${L.noBets}</p>`}
      ${!res ? `<div style="margin-top:10px"><div class="muted small">${mine ? `✓ ${L.locked}` : L.myBet}</div>
        <label class="f">${L.ghostPick}</label><select id="betGhost">${ghostOpts}</select>
        <label class="f">${L.mapPick}</label><select id="betMap">${mapOpts}</select>
        <label class="f">${L.roomPick}</label><input type="text" id="betRoom" maxlength="30" value="${esc(mine?.room || "")}">
        <label class="f">${L.deathPick}</label><select id="betDeath"><option value="">${L.unknown}</option><option value="${NONE}">${L.nobody}</option>${playerOpts}</select>
        <button class="primary" style="margin-top:10px;width:100%" data-act="lock">${L.lock}</button></div>
        <div style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px"><div class="muted small">${L.result}</div>
        <label class="f">${L.ghostPick}</label><select id="resGhost">${ghostOpts}</select>
        <label class="f">${L.mapPick}</label><select id="resMap">${mapOpts}</select>
        <label class="f">${L.roomPick}</label><input type="text" id="resRoom" maxlength="30" value="${esc(S.state.notes?.room || "")}">
        <label class="f">${L.deaths}</label><div class="chips" id="resDeaths">${v.players.map((p) => `<button class="chip ${deadNow.includes(p.pid) ? "on" : ""}" data-death="${esc(p.pid)}">${deadNow.includes(p.pid) ? "☠ " : ""}${esc(p.name)}</button>`).join("")}</div>
        <button class="ok" style="margin-top:10px;width:100%" data-act="score">${L.confirm}</button></div>` : ""}</div>
    <div class="card"><h3>${L.bingo}</h3>${bingoHtml}</div>`;
}

function completedLineCells(marked) {
  const n = BINGO_SIDE, has = (c) => c === BINGO_FREE || marked.has(c), out = new Set();
  const lines = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  lines.push(Array.from({ length: n }, (_, i) => i * n + i)); lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  for (const l of lines) if (l.every(has)) l.forEach((c) => out.add(c));
  return out;
}

function ghostSheet(id) {
  const g = ghostById[id]; if (!g) return;
  const gr = greek();
  $("sheet").innerHTML = `<div class="sheet-bg" id="sheetBg"><div class="sheet">
    <div class="row between"><h2>${esc(g.name)}${g.isNew ? ' <span class="amber small">new</span>' : ""}</h2><button class="ghost" id="sheetClose">✕</button></div>
    <dl>
      <dt>${L.ghosts}</dt><dd>${g.evidence.map((e) => esc(evName(e)) + (g.guaranteed === e ? " ★" : "")).join(", ")}${g.fakeOrb ? ` <span class="muted small">(${L.fakeOrb})</span>` : ""}${g.guaranteed ? `<div class="muted tiny">★ ${L.guaranteed}</div>` : ""}</dd>
      <dt>${L.huntAt}</dt><dd>${g.huntAt} % – ${esc(gr ? g.huntEl : g.huntEn)}</dd>
      <dt>${L.speed}</dt><dd>${g.speedMin === g.speedMax ? g.speedMin : `${g.speedMin}–${g.speedMax}`} m/s – ${esc(gr ? g.speedEl : g.speedEn)}<div class="muted tiny">${g.los ? L.los : L.noLos}</div></dd>
      <dt>${L.incense} / ${L.cooldown}</dt><dd>${g.smudge} s / ${g.cooldown} s</dd>
      <dt>${L.tells}</dt><dd><ul>${(gr ? g.tellsEl : g.tellsEn).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></dd>
    </dl></div></div>`;
  $("sheetClose").onclick = () => ($("sheet").innerHTML = "");
  $("sheetBg").addEventListener("click", (e) => { if (e.target.id === "sheetBg") $("sheet").innerHTML = ""; });
}

/* ------------------------------------------------------------------ events */
$("tabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (!b) return; S.tab = b.dataset.tab; store.set("tab", S.tab); renderTabs(); render(); window.scrollTo(0, 0); });
$("btnLang").onclick = () => { setLang(S.lang === "el" ? "en" : "el"); renderTabs(); render(); };
$("btnSound").onclick = () => { S.sound = !S.sound; store.set("sound", S.sound ? "1" : "0"); unlockAudio(); renderHeader(); toast(S.sound ? L.soundOn : L.soundOff, 1200); if (S.sound) beep(1); };
$("btnLeave").onclick = () => { if (confirm(L.leave)) leave(); };
$("hdrCode").onclick = () => { try { navigator.clipboard.writeText(S.code); toast(L.copied, 1200); } catch (_) { /* ignore */ } };
$("pingBanner").onclick = () => $("pingBanner").classList.add("hidden");

$("content").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  unlockAudio();
  const d = b.dataset;
  if (d.ev) return cycleEvidence(d.ev);
  if (d.count) return setCount(parseInt(d.count, 10));
  if (d.ghost) return ghostSheet(d.ghost);
  if (d.start) return startTimer(d.start);
  if (d.stop) return stopTimer(d.stop);
  if (d.ping) return sendPing(d.ping);
  if (d.status) { const c = party().currentChallenge; if (c) setChallengeStatus(c.n, d.status); return; }
  if (d.cell != null) return toggleBingoCell(parseInt(d.cell, 10));
  if (d.death) { b.classList.toggle("on"); return; }
  switch (d.act) {
    case "clear": return clearJournal();
    case "new-round": return newRound();
    case "dead": return setDead(!party().dead(party().round).includes(S.pid));
    case "spin": return spin(parseInt($("spinLevel").value, 10), $("spinTeam").value === "1");
    case "roles": return spinRoles();
    case "lock": return lockBet($("betGhost").value || null, $("betMap").value || null, $("betRoom").value.trim() || null, $("betDeath").value || null);
    case "score": return scoreRound($("resGhost").value || null, $("resMap").value || null, $("resRoom").value.trim() || null, [...document.querySelectorAll("#resDeaths .chip.on")].map((x) => x.dataset.death));
    case "unscore": return unscoreRound();
    case "bingo-shared": return newBingo(true);
    case "bingo-own": return newBingo(false);
    case "bingo-end": return endBingo();
  }
});
$("content").addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "sanity") setSanity(parseInt(t.value, 10));
  else if (t.id === "noteGhost") setNotes("ghostName", t.value);
  else if (t.id === "noteRoom") setNotes("room", t.value);
  else if (t.id === "cursed") { S.cursed = t.checked; render(); }
  else if (t.id === "spinLevel") S.spinLevel = t.value;
  else if (t.id === "spinTeam") S.spinTeam = t.value;
});
$("content").addEventListener("focusout", () => { if (S.dirty) setTimeout(render, 50); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.wantRoom && (!S.ws || S.ws.readyState > 1)) connect(); });

/* ------------------------------------------------------------------ boot */
document.documentElement.lang = S.lang;
if (params.get("room") && CODE_RE.test(params.get("room").toUpperCase()) && S.name) join(params.get("room").toUpperCase(), false).catch(() => showJoin());
else showJoin();
