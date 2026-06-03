/**
 * Firestore repository. Maps the synchronous store mirror to the schema in
 * docs/architecture.md.
 *
 * Firestore is the source of record in configured mode. The store keeps an
 * optimistic in memory mirror and subscribes here with onSnapshot. Personal
 * free text is encrypted before write and decrypted after read:
 *   person.goal, person.context, person.baseRead text, visual tag teasers,
 *   decision.context strings, decisionNotes[].text, derivedSummary,
 *   observation.text, and generated play text.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase.js";
import { decryptText, encryptText } from "./crypto.js";

const log = (e) => console.error("[firestore]", e);
const SOURCE_VALUES = new Set(["note", "chat", "history"]);

function cleanSource(source) {
  return SOURCE_VALUES.has(source) ? source : "note";
}

async function mapObject(obj = {}, fn) {
  const pairs = await Promise.all(Object.entries(obj || {}).map(async ([key, value]) => [key, await fn(value)]));
  return Object.fromEntries(pairs);
}

async function encryptBaseRead(baseRead = {}) {
  return mapObject(baseRead, (value) => encryptText(value || ""));
}

async function decryptBaseRead(baseRead = {}) {
  return mapObject(baseRead, (value) => decryptText(value || ""));
}

async function encryptVisualTags(tags = {}) {
  return {
    scarfDimensions: tags.scarfDimensions || [],
    tkiStyle: tags.tkiStyle || "",
    cialdiniLever: await encryptText(tags.cialdiniLever || ""),
    fuTeaser: await encryptText(tags.fuTeaser || ""),
  };
}

async function decryptVisualTags(tags = {}) {
  return {
    scarfDimensions: tags.scarfDimensions || [],
    tkiStyle: tags.tkiStyle || "",
    cialdiniLever: await decryptText(tags.cialdiniLever || ""),
    fuTeaser: await decryptText(tags.fuTeaser || ""),
  };
}

async function encryptContext(context = {}) {
  return {
    deciding: await encryptText(context.deciding || ""),
    goal: await encryptText(context.goal || ""),
    constraint: await encryptText(context.constraint || ""),
  };
}

async function decryptContext(context = {}) {
  return {
    deciding: await decryptText(context.deciding || ""),
    goal: await decryptText(context.goal || ""),
    constraint: await decryptText(context.constraint || ""),
  };
}

async function encryptDecisionNotes(notes = []) {
  return Promise.all((notes || []).map(async (n) => ({ ...n, text: await encryptText(n.text || "") })));
}

async function decryptDecisionNotes(notes = []) {
  return Promise.all((notes || []).map(async (n) => ({ ...n, text: await decryptText(n.text || "") })));
}

async function personToFirestore(uid, person) {
  return {
    ownerId: uid,
    name: person.name || "",
    role: person.role || "",
    goal: await encryptText(person.goal || ""),
    context: await encryptText(person.context || ""),
    baseRead: await encryptBaseRead(person.baseRead || {}),
    visualTags: await encryptVisualTags(person.visualTags || {}),
    relationships: person.relationships || [],
    fresh: !!person.fresh,
    external: !!person.external,
    createdAt: person.createdAt || serverTimestamp(),
  };
}

async function personFromFirestore(id, data, observations = []) {
  return {
    id,
    ...data,
    goal: await decryptText(data.goal || ""),
    context: await decryptText(data.context || ""),
    baseRead: await decryptBaseRead(data.baseRead || {}),
    visualTags: await decryptVisualTags(data.visualTags || {}),
    relationships: data.relationships || [],
    observations,
  };
}

async function observationFromFirestore(id, data) {
  return {
    id,
    ...data,
    source: data.source || "note",
    decisionId: data.decisionId || null,
    text: await decryptText(data.text || ""),
  };
}

async function decisionToFirestore(decision) {
  return {
    title: decision.title || "",
    context: await encryptContext(decision.context || {}),
    decisionNotes: await encryptDecisionNotes(decision.decisionNotes || []),
    derivedSummary: await encryptText(decision.derivedSummary || ""),
    deadline: decision.deadline || "",
    status: decision.status || "active",
    participantIds: decision.participantIds || [],
    externalIds: decision.externalIds || [],
    positions: decision.positions || {},
    placements: decision.placements || {},
    createdAt: decision.createdAt || serverTimestamp(),
  };
}

async function decisionFromFirestore(id, roomId, data, edges = []) {
  return {
    id,
    roomId,
    ...data,
    context: await decryptContext(data.context || {}),
    decisionNotes: await decryptDecisionNotes(data.decisionNotes || []),
    derivedSummary: await decryptText(data.derivedSummary || ""),
    edges,
  };
}

/* Chat messages. Free text (body, text, questions) is encrypted; role, type,
 * label, personName, command, and ts stay plaintext so the thread can render and
 * sort without decrypting structure. Welcome, loading, and play cards are not
 * persisted (see store.pushMessage). */
async function messageToFirestore(message) {
  return {
    role: message.role || (message.type === "user" ? "user" : "assistant"),
    type: message.type || "updated",
    body: await encryptText(message.body || ""),
    text: await encryptText(message.text || ""),
    label: message.label || "",
    personName: message.personName || "",
    command: message.command || "",
    questions: await Promise.all((message.questions || []).map((q) => encryptText(q || ""))),
    ts: serverTimestamp(),
  };
}

async function messageFromFirestore(id, data) {
  return {
    id,
    role: data.role || "assistant",
    type: data.type || "updated",
    body: await decryptText(data.body || ""),
    text: await decryptText(data.text || ""),
    label: data.label || "",
    personName: data.personName || "",
    command: data.command || "",
    questions: await Promise.all((data.questions || []).map((q) => decryptText(q || ""))),
    ts: data.ts || null,
  };
}

function tsToMs(ts) {
  if (!ts) return Number.MAX_SAFE_INTEGER; // pending serverTimestamp sorts last (newest)
  if (typeof ts.toMillis === "function") return ts.toMillis();
  return Number(ts) || Number.MAX_SAFE_INTEGER;
}

async function messagesFromSnap(snap) {
  const messages = await Promise.all(snap.docs.map((m) => messageFromFirestore(m.id, m.data())));
  return messages.sort((a, b) => tsToMs(a.ts) - tsToMs(b.ts));
}

function stateFromMaps(peopleDocs, observationsByPerson, roomDocs, decisionDocs, edgesByDecision, chatsByDecision = {}) {
  return Promise.all([
    Promise.all(
      Object.entries(peopleDocs).map(async ([id, data]) => [
        id,
        await personFromFirestore(id, data, observationsByPerson[id] || []),
      ])
    ),
    Promise.all(
      Object.entries(decisionDocs).map(async ([id, entry]) =>
        decisionFromFirestore(id, entry.roomId, entry.data, edgesByDecision[id] || [])
      )
    ),
  ]).then(([peoplePairs, decisions]) => ({
    people: Object.fromEntries(peoplePairs),
    rooms: Object.entries(roomDocs).map(([id, data]) => ({ id, ...data })),
    decisions,
    chats: chatsByDecision,
  }));
}

/* ------------------------------------------------------------------ */
/* One shot load                                                       */
/* ------------------------------------------------------------------ */

export async function loadAll(uid) {
  const peopleDocs = {};
  const observationsByPerson = {};
  const roomDocs = {};
  const decisionDocs = {};
  const edgesByDecision = {};
  const chatsByDecision = {};

  const peopleSnap = await getDocs(query(collection(db, "people"), where("ownerId", "==", uid)));
  for (const p of peopleSnap.docs) {
    peopleDocs[p.id] = p.data();
    const obsSnap = await getDocs(collection(db, "people", p.id, "observations"));
    observationsByPerson[p.id] = await Promise.all(obsSnap.docs.map((o) => observationFromFirestore(o.id, o.data())));
  }

  const roomsSnap = await getDocs(query(collection(db, "rooms"), where("ownerId", "==", uid)));
  for (const r of roomsSnap.docs) {
    roomDocs[r.id] = r.data();
    const decSnap = await getDocs(collection(db, "rooms", r.id, "decisions"));
    for (const d of decSnap.docs) {
      decisionDocs[d.id] = { roomId: r.id, data: d.data() };
      const edgeSnap = await getDocs(collection(db, "rooms", r.id, "decisions", d.id, "edges"));
      edgesByDecision[d.id] = edgeSnap.docs.map((e) => ({ id: e.id, ...e.data() }));
      const msgSnap = await getDocs(collection(db, "rooms", r.id, "decisions", d.id, "messages"));
      chatsByDecision[d.id] = await messagesFromSnap(msgSnap);
    }
  }

  return stateFromMaps(peopleDocs, observationsByPerson, roomDocs, decisionDocs, edgesByDecision, chatsByDecision);
}

/* ------------------------------------------------------------------ */
/* Live load                                                           */
/* ------------------------------------------------------------------ */

export function watchAll(uid, onChange, onError = log) {
  const peopleDocs = {};
  const observationsByPerson = {};
  const roomDocs = {};
  const decisionDocs = {};
  const edgesByDecision = {};
  const chatsByDecision = {};
  const unsubs = [];
  const obsUnsubs = new Map();
  const decUnsubs = new Map();
  const edgeUnsubs = new Map();
  const msgUnsubs = new Map();
  let version = 0;

  const emit = async () => {
    const current = ++version;
    try {
      const next = await stateFromMaps(peopleDocs, observationsByPerson, roomDocs, decisionDocs, edgesByDecision, chatsByDecision);
      if (current === version) onChange(next);
    } catch (e) {
      onError(e);
    }
  };

  const stopEdgeWatch = (decisionId) => {
    edgeUnsubs.get(decisionId)?.();
    edgeUnsubs.delete(decisionId);
    delete edgesByDecision[decisionId];
  };

  const stopMessageWatch = (decisionId) => {
    msgUnsubs.get(decisionId)?.();
    msgUnsubs.delete(decisionId);
    delete chatsByDecision[decisionId];
  };

  const stopDecisionWatch = (roomId) => {
    decUnsubs.get(roomId)?.();
    decUnsubs.delete(roomId);
    Object.entries(decisionDocs).forEach(([decisionId, entry]) => {
      if (entry.roomId === roomId) {
        delete decisionDocs[decisionId];
        stopEdgeWatch(decisionId);
        stopMessageWatch(decisionId);
      }
    });
  };

  unsubs.push(
    onSnapshot(
      query(collection(db, "people"), where("ownerId", "==", uid)),
      (snap) => {
        const seen = new Set();
        snap.docs.forEach((personDoc) => {
          seen.add(personDoc.id);
          peopleDocs[personDoc.id] = personDoc.data();
          if (!obsUnsubs.has(personDoc.id)) {
            obsUnsubs.set(
              personDoc.id,
              onSnapshot(
                collection(db, "people", personDoc.id, "observations"),
                async (obsSnap) => {
                  observationsByPerson[personDoc.id] = await Promise.all(
                    obsSnap.docs.map((o) => observationFromFirestore(o.id, o.data()))
                  );
                  emit();
                },
                onError
              )
            );
          }
        });
        Object.keys(peopleDocs).forEach((personId) => {
          if (!seen.has(personId)) {
            delete peopleDocs[personId];
            delete observationsByPerson[personId];
            obsUnsubs.get(personId)?.();
            obsUnsubs.delete(personId);
          }
        });
        emit();
      },
      onError
    )
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, "rooms"), where("ownerId", "==", uid)),
      (snap) => {
        const seenRooms = new Set();
        snap.docs.forEach((roomDoc) => {
          seenRooms.add(roomDoc.id);
          roomDocs[roomDoc.id] = roomDoc.data();
          if (!decUnsubs.has(roomDoc.id)) {
            decUnsubs.set(
              roomDoc.id,
              onSnapshot(
                collection(db, "rooms", roomDoc.id, "decisions"),
                (decSnap) => {
                  const seenDecisions = new Set();
                  decSnap.docs.forEach((decisionDoc) => {
                    seenDecisions.add(decisionDoc.id);
                    decisionDocs[decisionDoc.id] = { roomId: roomDoc.id, data: decisionDoc.data() };
                    if (!edgeUnsubs.has(decisionDoc.id)) {
                      edgeUnsubs.set(
                        decisionDoc.id,
                        onSnapshot(
                          collection(db, "rooms", roomDoc.id, "decisions", decisionDoc.id, "edges"),
                          (edgeSnap) => {
                            edgesByDecision[decisionDoc.id] = edgeSnap.docs.map((e) => ({ id: e.id, ...e.data() }));
                            emit();
                          },
                          onError
                        )
                      );
                    }
                    if (!msgUnsubs.has(decisionDoc.id)) {
                      msgUnsubs.set(
                        decisionDoc.id,
                        onSnapshot(
                          collection(db, "rooms", roomDoc.id, "decisions", decisionDoc.id, "messages"),
                          async (msgSnap) => {
                            chatsByDecision[decisionDoc.id] = await messagesFromSnap(msgSnap);
                            emit();
                          },
                          onError
                        )
                      );
                    }
                  });
                  Object.entries(decisionDocs).forEach(([decisionId, entry]) => {
                    if (entry.roomId === roomDoc.id && !seenDecisions.has(decisionId)) {
                      delete decisionDocs[decisionId];
                      stopEdgeWatch(decisionId);
                      stopMessageWatch(decisionId);
                    }
                  });
                  emit();
                },
                onError
              )
            );
          }
        });
        Object.keys(roomDocs).forEach((roomId) => {
          if (!seenRooms.has(roomId)) {
            delete roomDocs[roomId];
            stopDecisionWatch(roomId);
          }
        });
        emit();
      },
      onError
    )
  );

  return () => {
    unsubs.forEach((fn) => fn());
    obsUnsubs.forEach((fn) => fn());
    decUnsubs.forEach((fn) => fn());
    edgeUnsubs.forEach((fn) => fn());
    msgUnsubs.forEach((fn) => fn());
  };
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function putPerson(uid, person) {
  try {
    const { observations, id, ...rest } = person;
    await setDoc(doc(db, "people", id), await personToFirestore(uid, { id, ...rest }), { merge: true });
  } catch (e) {
    log(e);
  }
}

export async function addObservation(personId, { text, source, decisionId }) {
  try {
    await addDoc(collection(db, "people", personId, "observations"), {
      text: await encryptText(text || ""),
      source: cleanSource(source),
      decisionId: decisionId || null,
      ts: serverTimestamp(),
    });
  } catch (e) {
    log(e);
  }
}

export async function putRoom(uid, room) {
  try {
    const { id, ...rest } = room;
    await setDoc(doc(db, "rooms", id), { ownerId: uid, ...rest, createdAt: rest.createdAt || serverTimestamp() }, { merge: true });
  } catch (e) {
    log(e);
  }
}

function decRef(roomId, decId) {
  return doc(db, "rooms", roomId, "decisions", decId);
}

export async function putDecision(roomId, decision) {
  try {
    const { id } = decision;
    await setDoc(decRef(roomId, id), await decisionToFirestore(decision), { merge: true });
  } catch (e) {
    log(e);
  }
}

export async function updateDecisionFields(roomId, decId, fields) {
  try {
    await updateDoc(decRef(roomId, decId), fields);
  } catch (e) {
    log(e);
  }
}

async function deleteNestedCollection(ref, name) {
  const snap = await getDocs(collection(ref, name));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

export async function deleteDecision(roomId, decId) {
  try {
    const ref = decRef(roomId, decId);
    await deleteNestedCollection(ref, "edges");
    await deleteNestedCollection(ref, "plays");
    await deleteNestedCollection(ref, "messages");
    await deleteDoc(ref);
  } catch (e) {
    log(e);
  }
}

export async function deletePersonDocument(personId) {
  try {
    const personRef = doc(db, "people", personId);
    await deleteNestedCollection(personRef, "observations");
    await deleteDoc(personRef);
  } catch (e) {
    log(e);
  }
}

export async function deleteRoom(roomId, personIds = []) {
  try {
    const roomRef = doc(db, "rooms", roomId);
    const decSnap = await getDocs(collection(roomRef, "decisions"));
    for (const decisionDoc of decSnap.docs) {
      await deleteNestedCollection(decisionDoc.ref, "edges");
      await deleteNestedCollection(decisionDoc.ref, "plays");
      await deleteNestedCollection(decisionDoc.ref, "messages");
      await deleteDoc(decisionDoc.ref);
    }
    await deleteDoc(roomRef);
    await Promise.all(personIds.map((personId) => deletePersonDocument(personId)));
  } catch (e) {
    log(e);
  }
}

export async function addEdge(roomId, decId, edge) {
  try {
    const ref = await addDoc(collection(decRef(roomId, decId), "edges"), edge);
    return ref.id;
  } catch (e) {
    log(e);
    return null;
  }
}

export async function removeEdgeDoc(roomId, decId, edgeId) {
  try {
    await deleteDoc(doc(decRef(roomId, decId), "edges", edgeId));
  } catch (e) {
    log(e);
  }
}

export async function addMessage(roomId, decId, message) {
  try {
    const ref = await addDoc(collection(decRef(roomId, decId), "messages"), await messageToFirestore(message));
    return ref.id;
  } catch (e) {
    log(e);
    return null;
  }
}

export async function addPlay(roomId, decId, { situation, output }) {
  try {
    await addDoc(collection(decRef(roomId, decId), "plays"), {
      situation: await encryptText(situation || ""),
      output: await encryptText(typeof output === "string" ? output : JSON.stringify(output || "")),
      ts: serverTimestamp(),
    });
  } catch (e) {
    log(e);
  }
}
