/**
 * Data access layer.
 *
 * Keeps a synchronous in memory mirror so components read without awaiting.
 * In local mode the mirror comes from seed plus the encrypted cache. In
 * Firestore mode connect(uid) loads the account into the mirror, writes go to
 * Firestore (fire and forget) with optimistic mirror updates, and the encrypted
 * cache stays in front for fast load.
 *
 * Per docs/architecture.md the situational overlay (positions, placements,
 * edges) lives on the decision; stable traits and observations live on the
 * person. getEdges, removeEdge, and setPlacement carry a decisionId for that
 * reason; every other signature is unchanged.
 */

import { peopleBase, seedObservations, seedRooms, seedDecisions, DEFAULT_PLACEMENT } from "../data/seed.js";
import { buildPlacement } from "./placement.js";
import { saveCache, loadCache, clearCache } from "./cache.js";
import { isConfigured } from "./firebase.js";
import * as repo from "./firestore-repo.js";

export const WELCOME = "Select a participant to open their profile, or map the room below with a command.";

let _seq = 0;
const mid = () => `m${++_seq}`;

let mode = "local"; // "local" | "firestore"
let uid = null;
let remoteUnsubscribe = null;
let connectionToken = 0;
let connectingUid = null;
const DEFAULT_PREFS = { railCollapsed: false, userSettingsReady: !isConfigured, remoteReady: false };

function withDefaultPrefs(prefs = {}) {
  return { ...DEFAULT_PREFS, ...prefs };
}

/* ------------------------------------------------------------------ */
/* Initial mirror (seed)                                               */
/* ------------------------------------------------------------------ */

function buildLocalState() {
  const people = {};
  peopleBase.forEach((p) => {
    people[p.id] = { ...p, observations: (seedObservations[p.id] || []).map((o) => ({ ...o })) };
  });
  const chats = {};
  seedDecisions.filter((d) => d.status === "active").forEach((d) => (chats[d.id] = [{ id: mid(), type: "welcome", body: WELCOME }]));
  return {
    people,
    rooms: seedRooms.map((r) => ({ ...r, rosterIds: [...r.rosterIds] })),
    decisions: seedDecisions.map((d) => ({
      ...d,
      participantIds: [...d.participantIds],
      externalIds: [...d.externalIds],
      positions: { ...d.positions },
      placements: JSON.parse(JSON.stringify(d.placements)),
      decisionNotes: [...d.decisionNotes],
      edges: d.edges.map((e) => ({ ...e })),
    })),
    chats,
    prefs: withDefaultPrefs(),
    profile: {},
  };
}

let state = buildLocalState();
const listeners = new Set();

function emptyState(prefs = DEFAULT_PREFS) {
  return { people: {}, rooms: [], decisions: [], chats: {}, prefs: withDefaultPrefs(prefs), profile: {} };
}

let persistTimer = null;
function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => saveCache(state), 250);
}
function commit(next) {
  state = next;
  schedulePersist();
  listeners.forEach((fn) => fn());
}

/** Message types persisted to Firestore and rehydrated on load. Welcome, play,
 * and loading cards stay transient UI only. */
const PERSISTED_MESSAGE_TYPES = new Set(["user", "updated", "note", "added", "fallback", "coach", "read"]);

function welcomeMessage() {
  return [{ id: mid(), type: "welcome", body: WELCOME }];
}

/** Resolve the chat for each decision. Existing in-memory chat wins (keeps
 * optimistic turns and avoids flicker); otherwise seed from the persisted
 * Firestore history, falling back to the welcome card. */
function chatsFor(decisions, loadedChats = {}) {
  const chats = {};
  decisions.forEach((d) => {
    const persisted = loadedChats[d.id];
    chats[d.id] = state.chats[d.id] || (persisted && persisted.length ? persisted : welcomeMessage());
  });
  return chats;
}

function makeId(prefix) {
  const rand = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getSnapshot() {
  return state;
}

/* ------------------------------------------------------------------ */
/* Connection lifecycle                                                */
/* ------------------------------------------------------------------ */

/** Local mode: hydrate from the encrypted cache if present. */
export async function hydrate() {
  if (mode === "firestore") return;
  const cached = await loadCache();
  const readyPrefs = withDefaultPrefs({ ...(cached?.prefs || {}), userSettingsReady: true, remoteReady: true });
  commit(cached?.rooms && cached?.people ? { ...buildLocalState(), ...cached, prefs: readyPrefs } : { ...buildLocalState(), prefs: readyPrefs });
}

/** Firestore mode: load the account into the mirror. New accounts start empty. */
export async function connect(authedUid) {
  if (!isConfigured) return;
  if (mode === "firestore" && uid === authedUid && (connectingUid === authedUid || remoteUnsubscribe)) return;
  const token = ++connectionToken;
  remoteUnsubscribe?.();
  remoteUnsubscribe = null;
  mode = "firestore";
  uid = authedUid;
  connectingUid = authedUid;
  const prefs = withDefaultPrefs({ ...(state.prefs || {}), userSettingsReady: false, remoteReady: false });
  const cached = await loadCache();
  if (token !== connectionToken) return;
  const cachedPrefs = withDefaultPrefs({ ...(cached?.prefs || prefs), userSettingsReady: false, remoteReady: false });
  commit(cached?.rooms && cached?.people ? { ...emptyState(prefs), ...cached, prefs: cachedPrefs } : emptyState(prefs));
  // Restore the user's synced UI settings (last room and decision) so a reload
  // lands where they left off, even on a fresh device with a cold cache.
  repo
    .getUserSettings(authedUid)
    .then((settings) => {
      if (token !== connectionToken) return;
      commit({ ...state, prefs: withDefaultPrefs({ ...state.prefs, ...(settings || {}), userSettingsReady: true }) });
    })
    .catch(() => {
      if (token !== connectionToken) return;
      commit({ ...state, prefs: withDefaultPrefs({ ...state.prefs, userSettingsReady: true }) });
    });
  // Account profile (name, email, position) for the account menu and profile view.
  repo
    .getUserProfile(authedUid)
    .then((profile) => {
      if (token !== connectionToken || !profile) return;
      commit({ ...state, profile: { ...state.profile, ...profile } });
    })
    .catch(() => {});
  try {
    remoteUnsubscribe = repo.watchAll(
      uid,
      (loaded) => {
        if (token !== connectionToken) return;
        commit({
          ...loaded,
          chats: chatsFor(loaded.decisions, loaded.chats),
          prefs: withDefaultPrefs({ ...(state.prefs || prefs), remoteReady: true }),
          profile: state.profile || {},
        });
      },
      (e) => console.error("[store] listen failed", e)
    );
  } catch (e) {
    console.error("[store] connect failed", e);
  } finally {
    if (token === connectionToken) connectingUid = null;
  }
}

/** Sign out: drop Firestore data from memory, clear cache, back to seed. */
export async function disconnect() {
  connectionToken++;
  remoteUnsubscribe?.();
  remoteUnsubscribe = null;
  connectingUid = null;
  mode = "local";
  uid = null;
  await clearCache();
  commit(buildLocalState());
}

export async function reset() {
  connectionToken++;
  remoteUnsubscribe?.();
  remoteUnsubscribe = null;
  connectingUid = null;
  mode = "local";
  uid = null;
  await clearCache();
  commit(buildLocalState());
}

const fs = () => mode === "firestore";

/* ------------------------------------------------------------------ */
/* Queries                                                             */
/* ------------------------------------------------------------------ */

export function getRooms() {
  return state.rooms;
}
export function getRoom(id) {
  return state.rooms.find((r) => r.id === id) || null;
}
export function getDecisions(roomId) {
  return state.decisions.filter((d) => d.roomId === roomId);
}
export function getDecision(id) {
  return state.decisions.find((d) => d.id === id) || null;
}
export function getPerson(id) {
  return state.people[id] || null;
}
export function getAllPeople() {
  return state.people;
}
export function getEdges(decisionId) {
  return getDecision(decisionId)?.edges || [];
}
export function getChat(decisionId) {
  return state.chats[decisionId] || [];
}
export function getParticipants(decisionId) {
  const d = getDecision(decisionId);
  if (!d) return [];
  return [...d.participantIds, ...d.externalIds].map((id) => state.people[id]).filter(Boolean);
}
export function getPlacement(decisionId, personId) {
  return getDecision(decisionId)?.placements?.[personId] || DEFAULT_PLACEMENT;
}
export function getPref(key) {
  return state.prefs?.[key];
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export function setPref(key, value) {
  commit({ ...state, prefs: { ...state.prefs, [key]: value } });
}

/* Settings synced to the signed-in user in Firestore (last room and decision),
   so the app restores them on reload and across devices. They also live in the
   local prefs mirror for synchronous reads and fast cold load. */
const USER_SETTING_KEYS = ["lastRoomId", "lastDecisionId"];

export function setUserSetting(key, value) {
  const prefs = { ...state.prefs, [key]: value };
  commit({ ...state, prefs });
  if (fs() && uid) {
    const synced = {};
    USER_SETTING_KEYS.forEach((k) => {
      synced[k] = prefs[k] ?? null;
    });
    repo.putUserSettings(uid, synced);
  }
}

/* Account profile. Name and position are editable and persist to the user
   document under the signed-in uid; email is read-only and sourced from Auth. */
export function getProfile() {
  return state.profile || {};
}

export async function saveProfile({ name, position } = {}) {
  const profile = { ...state.profile, name, position };
  commit({ ...state, profile });
  if (fs() && uid) {
    const ok = await repo.putUserProfile(uid, { name, position });
    if (!ok) throw new Error("Profile could not be saved.");
  }
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export function savePerson(person) {
  commit({ ...state, people: { ...state.people, [person.id]: { ...person } } });
  if (fs()) repo.putPerson(uid, person);
}
export function createPerson({ name, role = "", goal = "", context = "" } = {}) {
  const id = makeId(fs() && uid ? `${uid}_person` : "person");
  const person = {
    id,
    name: name || "Unnamed person",
    role,
    goal,
    context,
    fresh: true,
    external: false,
    baseRead: { scarf: "", tki: "", cialdini: "", fisherUry: "" },
    visualTags: { scarfDimensions: [], tkiStyle: "", cialdiniLever: "", fuTeaser: "" },
    relationships: [],
    observations: [],
  };
  savePerson(person);
  return id;
}
export function updatePerson(id, patch) {
  const p = state.people[id];
  if (!p) return;
  const next = { ...p, ...patch };
  commit({ ...state, people: { ...state.people, [id]: next } });
  if (fs()) repo.putPerson(uid, next);
}
export function addObservation(personId, { text, source = "note", decisionId } = {}) {
  const p = state.people[personId];
  if (!p) return;
  const obs = { id: mid(), text, source, decisionId };
  commit({ ...state, people: { ...state.people, [personId]: { ...p, observations: [...(p.observations || []), obs] } } });
  if (fs()) repo.addObservation(personId, { text, source, decisionId });
}
/** Kept for the chat command path. A note is an observation. */
export function addNote(id, text) {
  addObservation(id, { text, source: "note" });
}
function referencedPeopleAfter({ excludedRoomId = null } = {}) {
  const refs = new Set();
  state.rooms.forEach((room) => {
    if (room.id === excludedRoomId) return;
    (room.rosterIds || []).forEach((id) => refs.add(id));
  });
  state.decisions.forEach((decision) => {
    if (decision.roomId === excludedRoomId) return;
    [...(decision.participantIds || []), ...(decision.externalIds || [])].forEach((id) => refs.add(id));
    (decision.edges || []).forEach((edge) => {
      refs.add(edge.from);
      refs.add(edge.to);
    });
  });
  return refs;
}

function peopleWithout(idsToDelete) {
  const ids = new Set(idsToDelete);
  const people = {};
  const changedRelations = [];
  Object.entries(state.people).forEach(([id, person]) => {
    if (ids.has(id)) return;
    const relationships = (person.relationships || []).filter((rel) => !ids.has(rel.personId));
    const next = relationships.length === (person.relationships || []).length ? person : { ...person, relationships };
    people[id] = next;
    if (next !== person) changedRelations.push(next);
  });
  return { people, changedRelations };
}

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export function createRoom(name = "New room") {
  const id = makeId(fs() && uid ? `${uid}_room` : "room");
  const room = { id, name, rosterIds: [] };
  commit({ ...state, rooms: [...state.rooms, room] });
  if (fs()) repo.putRoom(uid, room);
  return id;
}
export function updateRoom(id, patch) {
  const r = getRoom(id);
  commit({ ...state, rooms: state.rooms.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  if (fs() && r) repo.putRoom(uid, { ...r, ...patch });
}
export function addToRoster(roomId, personId) {
  const r = getRoom(roomId);
  if (!r || r.rosterIds.includes(personId)) return;
  updateRoom(roomId, { rosterIds: [...r.rosterIds, personId] });
}
export function removeFromRoster(roomId, personId) {
  const r = getRoom(roomId);
  if (!r) return;
  updateRoom(roomId, { rosterIds: r.rosterIds.filter((x) => x !== personId) });
}
export function deleteRoom(roomId) {
  const room = getRoom(roomId);
  if (!room) return;
  const roomDecisions = state.decisions.filter((d) => d.roomId === roomId);
  const decisionIds = roomDecisions.map((d) => d.id);
  const roomPeople = new Set(room.rosterIds || []);
  roomDecisions.forEach((d) => {
    [...(d.participantIds || []), ...(d.externalIds || [])].forEach((id) => roomPeople.add(id));
    (d.edges || []).forEach((edge) => {
      roomPeople.add(edge.from);
      roomPeople.add(edge.to);
    });
  });
  const stillReferenced = referencedPeopleAfter({ excludedRoomId: roomId });
  const peopleToDelete = [...roomPeople].filter((id) => !stillReferenced.has(id));
  const { people, changedRelations } = peopleWithout(peopleToDelete);
  const chats = { ...state.chats };
  decisionIds.forEach((id) => delete chats[id]);
  commit({
    ...state,
    people,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    decisions: state.decisions.filter((d) => d.roomId !== roomId),
    chats,
  });
  if (fs()) {
    repo.deleteRoom(roomId, peopleToDelete);
    changedRelations.forEach((person) => repo.putPerson(uid, person));
  }
}

export function deletePerson(personId, roomId) {
  const touchedRooms = state.rooms
    .filter((room) => (!roomId || room.id === roomId) && (room.rosterIds || []).includes(personId))
    .map((room) => ({ ...room, rosterIds: room.rosterIds.filter((id) => id !== personId) }));
  if (!touchedRooms.length) return;
  const byId = Object.fromEntries(touchedRooms.map((room) => [room.id, room]));
  const rooms = state.rooms.map((room) => byId[room.id] || room);
  commit({ ...state, rooms });
  if (fs()) touchedRooms.forEach((room) => repo.putRoom(uid, room));
}

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

export function createDecision(roomId, { title, context, participants }) {
  const room = getRoom(roomId);
  const ids = participants && participants.length ? participants : [...(room?.rosterIds || [])];
  const id = makeId(fs() && uid ? `${uid}_deci` : "deci");
  const positions = {};
  const placements = {};
  ids.forEach((pid) => {
    positions[pid] = "unknown";
    placements[pid] = { ...DEFAULT_PLACEMENT };
  });
  const decision = {
    id, roomId, title,
    context: context || { deciding: "", goal: "", constraint: "" },
    decisionNotes: [], derivedSummary: "", deadline: "", status: "active",
    participantIds: [...ids], externalIds: [], positions, placements, edges: [],
  };
  commit({ ...state, decisions: [...state.decisions, decision], chats: { ...state.chats, [id]: [{ id: mid(), type: "welcome", body: WELCOME }] } });
  if (fs()) repo.putDecision(roomId, decision);
  return id;
}
export function updateDecision(id, patch) {
  const d = getDecision(id);
  if (!d) return;
  const next = { ...d, ...patch };
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === id ? next : x)) });
  if (fs()) repo.putDecision(d.roomId, next);
}
export function archiveDecision(id) {
  const d = getDecision(id);
  if (!d) return;
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === id ? { ...x, status: "archived" } : x)) });
  if (fs()) repo.updateDecisionFields(d.roomId, id, { status: "archived" });
}
export function deleteDecision(id) {
  const d = getDecision(id);
  const chats = { ...state.chats };
  delete chats[id];
  commit({ ...state, decisions: state.decisions.filter((x) => x.id !== id), chats });
  if (fs() && d) repo.deleteDecision(d.roomId, id);
}
export function addDecisionNote(decisionId, text) {
  const d = getDecision(decisionId);
  if (!d) return;
  const notes = [...(d.decisionNotes || []), { text, ts: Date.now() }];
  updateDecision(decisionId, { decisionNotes: notes });
}
export function setPosition(decisionId, personId, position) {
  const d = getDecision(decisionId);
  if (!d) return;
  const positions = { ...d.positions, [personId]: position };
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, positions } : x)) });
  if (fs()) repo.updateDecisionFields(d.roomId, decisionId, { positions });
}
export function setPlacement(decisionId, personId, power, interest, confidence) {
  const d = getDecision(decisionId);
  if (!d) return;
  const placements = { ...d.placements, [personId]: buildPlacement(power, interest, confidence) };
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, placements } : x)) });
  if (fs()) repo.updateDecisionFields(d.roomId, decisionId, { placements });
}
export function movePerson(decisionId, personId, power, interest, confidence) {
  setPlacement(decisionId, personId, power, interest, confidence);
}
export function addParticipant(decisionId, personId) {
  const d = getDecision(decisionId);
  if (!d || d.participantIds.includes(personId)) return;
  const participantIds = [...d.participantIds, personId];
  const positions = { ...d.positions, [personId]: "unknown" };
  const placements = { ...d.placements, [personId]: { ...DEFAULT_PLACEMENT } };
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, participantIds, positions, placements } : x)) });
  if (fs()) repo.updateDecisionFields(d.roomId, decisionId, { participantIds, positions, placements });
}
export function removeParticipant(decisionId, personId) {
  const d = getDecision(decisionId);
  if (!d) return;
  const positions = { ...d.positions };
  const placements = { ...d.placements };
  delete positions[personId];
  delete placements[personId];
  const next = {
    ...d,
    participantIds: d.participantIds.filter((x) => x !== personId),
    externalIds: d.externalIds.filter((x) => x !== personId),
    positions, placements,
  };
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? next : x)) });
  if (fs()) repo.updateDecisionFields(d.roomId, decisionId, { participantIds: next.participantIds, externalIds: next.externalIds, positions, placements });
}

/** Create a decision scoped external and attach them. Returns id. */
export function addExternal(decisionId, { name, role }) {
  const d = getDecision(decisionId);
  if (!d) return null;
  const id = makeId(fs() && uid ? `${uid}_ext` : "ext");
  const person = {
    id, name, role: role || "External", goal: "", context: "", fresh: true, external: true,
    baseRead: { scarf: "", tki: "", cialdini: "", fisherUry: "" },
    visualTags: { scarfDimensions: [], tkiStyle: "", cialdiniLever: "", fuTeaser: "" },
    relationships: [], observations: [],
  };
  const positions = { ...d.positions, [id]: "unknown" };
  const placements = { ...d.placements, [id]: { ...DEFAULT_PLACEMENT } };
  const externalIds = [...d.externalIds, id];
  commit({
    ...state,
    people: { ...state.people, [id]: person },
    decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, externalIds, positions, placements } : x)),
  });
  if (fs()) {
    repo.putPerson(uid, person);
    repo.updateDecisionFields(d.roomId, decisionId, { externalIds, positions, placements });
  }
  return id;
}

/* ------------------------------------------------------------------ */
/* Network edges                                                       */
/* ------------------------------------------------------------------ */

export function addEdge(decisionId, { from, to, type = "defers" }) {
  const d = getDecision(decisionId);
  if (!d || !from || !to || from === to) return null;
  const safeType = ["ally", "conflict", "defers"].includes(type) ? type : "defers";
  const exists = (d.edges || []).some((edge) => edge.from === from && edge.to === to && edge.type === safeType);
  if (exists) return null;
  const edge = { id: mid(), from, to, type: safeType };
  const edges = [...(d.edges || []), edge];
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, edges } : x)) });
  if (fs()) repo.addEdge(d.roomId, decisionId, { from, to, type: safeType });
  return edge.id;
}

export function removeEdge(decisionId, index) {
  const d = getDecision(decisionId);
  if (!d) return;
  const edge = d.edges[index];
  const edges = d.edges.filter((_, i) => i !== index);
  commit({ ...state, decisions: state.decisions.map((x) => (x.id === decisionId ? { ...x, edges } : x)) });
  if (fs() && edge?.id) repo.removeEdgeDoc(d.roomId, decisionId, edge.id);
}

/* ------------------------------------------------------------------ */
/* Chat (transient) and plays (durable)                                */
/* ------------------------------------------------------------------ */

export function pushMessage(decisionId, message) {
  const list = state.chats[decisionId] || [];
  commit({ ...state, chats: { ...state.chats, [decisionId]: [...list, { id: mid(), ...message }] } });
  if (fs() && PERSISTED_MESSAGE_TYPES.has(message.type)) {
    const d = getDecision(decisionId);
    if (d) repo.addMessage(d.roomId, decisionId, message);
  }
}
export function ensureChat(decisionId) {
  if (state.chats[decisionId]) return;
  commit({ ...state, chats: { ...state.chats, [decisionId]: welcomeMessage() } });
}
/** Persist a generated play. Durable record, separate from the chat stream. */
export function savePlay(decisionId, { situation, output }) {
  const d = getDecision(decisionId);
  if (fs() && d) repo.addPlay(d.roomId, decisionId, { situation, output });
}
