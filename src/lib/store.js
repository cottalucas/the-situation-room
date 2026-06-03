/**
 * Data access layer.
 *
 * The seam between the UI and where data lives. Today: an in memory store
 * seeded from data/seed.js, fronted by an encrypted IndexedDB cache (lib/cache.js)
 * for fast load and session consistency. Firebase becomes the store of record at
 * the auth pass; it slots in behind these same functions.
 *
 * - subscribe()      mirrors a Firestore onSnapshot.
 * - query funcs      become getDoc / getDocs.
 * - mutation funcs   become setDoc / updateDoc / addDoc.
 *
 * TODO: replace the in memory implementation with Firestore. See lib/firebase.js.
 */

import { peopleBase, histories, seedRooms, seedDecisions, networkEdges } from "../data/seed.js";
import { saveCache, loadCache, clearCache } from "./cache.js";

export const WELCOME =
  "Select a participant to open their profile, or ask below for a play.";

let _seq = 0;
const mid = () => `m${++_seq}`;

function buildPeople() {
  const map = {};
  peopleBase.forEach((p) => {
    map[p.id] = { ...p, notes: [], history: histories[p.id] || [] };
  });
  return map;
}

function initialState() {
  const chats = {};
  seedDecisions
    .filter((d) => d.status === "active")
    .forEach((d) => (chats[d.id] = [{ id: mid(), type: "welcome", body: WELCOME }]));
  return {
    people: buildPeople(),
    rooms: seedRooms.map((r) => ({ ...r, rosterIds: [...r.rosterIds] })),
    decisions: seedDecisions.map((d) => ({
      ...d,
      participantIds: [...d.participantIds],
      externalIds: [...d.externalIds],
      positions: { ...d.positions },
    })),
    edges: networkEdges.map((e) => ({ ...e })),
    chats,
    prefs: { railCollapsed: false },
  };
}

let state = initialState();
const listeners = new Set();

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

/** Subscribe to any change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Snapshot for useSyncExternalStore. Identity changes on every commit. */
export function getSnapshot() {
  return state;
}

/** Load the encrypted cache and replace state if present. Call once on mount. */
export async function hydrate() {
  const cached = await loadCache();
  if (cached && cached.rooms && cached.people) {
    commit({ ...initialState(), ...cached });
  }
}

/** Wipe the cache and reset to seed. Used on sign out. */
export async function reset() {
  await clearCache();
  commit(initialState());
}

/* ---------------- queries ---------------- */

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
export function getEdges() {
  return state.edges;
}
export function getChat(decisionId) {
  return state.chats[decisionId] || [];
}
export function getParticipants(decisionId) {
  const d = getDecision(decisionId);
  if (!d) return [];
  return [...d.participantIds, ...d.externalIds].map((id) => state.people[id]).filter(Boolean);
}
export function getPref(key) {
  return state.prefs?.[key];
}

/* ---------------- preferences ---------------- */

export function setPref(key, value) {
  commit({ ...state, prefs: { ...state.prefs, [key]: value } });
}

/* ---------------- people ---------------- */

export function savePerson(person) {
  commit({ ...state, people: { ...state.people, [person.id]: { ...person } } });
}
export function updatePerson(id, patch) {
  const p = state.people[id];
  if (!p) return;
  commit({ ...state, people: { ...state.people, [id]: { ...p, ...patch } } });
}
export function movePerson(id, power, interest) {
  updatePerson(id, { power, interest });
}
export function addNote(id, text) {
  const p = state.people[id];
  if (!p) return;
  updatePerson(id, { notes: [...(p.notes || []), text] });
}

/* ---------------- rooms ---------------- */

export function createRoom(name = "New room") {
  const id = `room-${Date.now()}`;
  commit({ ...state, rooms: [...state.rooms, { id, name, rosterIds: [] }] });
  return id;
}
export function updateRoom(id, patch) {
  commit({ ...state, rooms: state.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
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

/** Delete a room and its decisions, edges scope, and chats. Person profiles
 *  stay in the global directory. */
export function deleteRoom(roomId) {
  const decisionIds = state.decisions.filter((d) => d.roomId === roomId).map((d) => d.id);
  const chats = { ...state.chats };
  decisionIds.forEach((id) => delete chats[id]);
  commit({
    ...state,
    rooms: state.rooms.filter((r) => r.id !== roomId),
    decisions: state.decisions.filter((d) => d.roomId !== roomId),
    chats,
  });
}

/* ---------------- decisions ---------------- */

/** Create a decision. Participants default to the whole room roster. */
export function createDecision(roomId, { title, context, participants }) {
  const room = getRoom(roomId);
  const ids = participants && participants.length ? participants : [...(room?.rosterIds || [])];
  const id = `deci-${Date.now()}`;
  const positions = {};
  ids.forEach((pid) => (positions[pid] = "unknown"));
  const decision = {
    id,
    roomId,
    title,
    context: context || { deciding: "", goal: "", constraint: "" },
    deadline: "",
    status: "active",
    participantIds: [...ids],
    externalIds: [],
    positions,
  };
  commit({
    ...state,
    decisions: [...state.decisions, decision],
    chats: { ...state.chats, [id]: [{ id: mid(), type: "welcome", body: WELCOME }] },
  });
  return id;
}
export function updateDecision(id, patch) {
  commit({ ...state, decisions: state.decisions.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
}
export function archiveDecision(id) {
  updateDecision(id, { status: "archived" });
}
export function deleteDecision(id) {
  const chats = { ...state.chats };
  delete chats[id];
  commit({ ...state, decisions: state.decisions.filter((d) => d.id !== id), chats });
}
export function setPosition(decisionId, personId, position) {
  const d = getDecision(decisionId);
  if (!d) return;
  updateDecision(decisionId, { positions: { ...d.positions, [personId]: position } });
}
export function addParticipant(decisionId, personId) {
  const d = getDecision(decisionId);
  if (!d || d.participantIds.includes(personId)) return;
  updateDecision(decisionId, {
    participantIds: [...d.participantIds, personId],
    positions: { ...d.positions, [personId]: "unknown" },
  });
}
export function removeParticipant(decisionId, personId) {
  const d = getDecision(decisionId);
  if (!d) return;
  const positions = { ...d.positions };
  delete positions[personId];
  updateDecision(decisionId, {
    participantIds: d.participantIds.filter((x) => x !== personId),
    externalIds: d.externalIds.filter((x) => x !== personId),
    positions,
  });
}

/** Create a decision scoped external person and attach them. Returns id. */
export function addExternal(decisionId, { name, role }) {
  const d = getDecision(decisionId);
  if (!d) return null;
  const participants = getParticipants(decisionId);
  const base = participants.length
    ? {
        power: Math.round(participants.reduce((a, p) => a + p.power, 0) / participants.length),
        interest: Math.round(participants.reduce((a, p) => a + p.interest, 0) / participants.length),
      }
    : { power: 50, interest: 60 };
  const id = `ext-${Date.now()}`;
  const person = {
    id,
    name,
    role: role || "External",
    power: Math.max(15, Math.min(85, base.power - 10)),
    interest: Math.max(15, Math.min(90, base.interest + 8)),
    goal: "",
    context: "",
    fresh: true,
    external: true,
    scarfDimensions: [],
    tkiStyle: "",
    cialdiniLever: "",
    fuTeaser: "",
    scarf: "",
    tki: "",
    cialdini: "",
    fisherUry: "",
    notes: [],
    history: [],
  };
  commit({
    ...state,
    people: { ...state.people, [id]: person },
    decisions: state.decisions.map((dd) =>
      dd.id === decisionId
        ? { ...dd, externalIds: [...dd.externalIds, id], positions: { ...dd.positions, [id]: "unknown" } }
        : dd
    ),
  });
  return id;
}

/* ---------------- network and chat ---------------- */

export function removeEdge(index) {
  commit({ ...state, edges: state.edges.filter((_, i) => i !== index) });
}
export function pushMessage(decisionId, message) {
  const list = state.chats[decisionId] || [];
  commit({ ...state, chats: { ...state.chats, [decisionId]: [...list, { id: mid(), ...message }] } });
}
export function ensureChat(decisionId) {
  if (state.chats[decisionId]) return;
  commit({ ...state, chats: { ...state.chats, [decisionId]: [{ id: mid(), type: "welcome", body: WELCOME }] } });
}
