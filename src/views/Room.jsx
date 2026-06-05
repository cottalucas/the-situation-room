import React, { useState, useCallback, useEffect, useRef } from "react";
import { useStore } from "../hooks/useStore.js";
import { interpretRoomCommand, askStrategist } from "../lib/context.js";
import { trackEvent } from "../lib/firebase.js";
import { consumeOnboardingPending } from "../lib/auth.js";
import { resolvePersonRef, splitLeadingPersonRef } from "../lib/person-ref.js";
import { autoReadEligible, AUTO_READ_QUESTION } from "../lib/auto-read.js";
import { screenOpenMessage } from "../lib/chat-guard.js";
import {
  ONBOARDING_INTRO,
  ONBOARDING_INTRO_RETURNING,
  ONBOARDING_QUESTIONS,
  buildClosingSummary,
  buildOnboardingCommandPlan,
  decisionSeedNeedsConfirm,
  deriveDecisionSeed,
  deriveDecisionTitle,
  forceCreatePeople,
  hasUsableRoom,
  namingPrompt,
  reflectOnAnswer,
  shouldAutoStartOnboarding,
} from "../lib/onboarding.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// A brief thinking beat between the user's send and the assistant's reflection,
// so the conversation feels considered rather than instant and canned.
const REFLECT_DELAY_MS = 600;

const LIVE_LLM = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";
// Open (non-command) chat is experimental and routes to the grounded strategist
// behind the input guard. It rides on the live LLM flag.
const OPEN_CHAT = LIVE_LLM;

import { Rail } from "../components/Rail.jsx";
import { Chat } from "../components/Chat.jsx";
import { OnboardingChat } from "../components/OnboardingChat.jsx";
import { PersonPage } from "../components/PersonPage.jsx";
import { PersonNotesPage } from "../components/PersonNotesPage.jsx";
import { FrameworksPage } from "../components/FrameworksPage.jsx";
import { NodeSummary } from "../components/NodeSummary.jsx";
import { MobileDrawer } from "../components/MobileDrawer.jsx";
import { CommandCompanion } from "../components/CommandCompanion.jsx";
import { AccountMenu } from "../components/AccountMenu.jsx";
import { ProfileModal } from "../components/ProfileModal.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { PeopleTab } from "../components/tabs/PeopleTab.jsx";
import { GridTab } from "../components/tabs/GridTab.jsx";
import { NetworkTab } from "../components/tabs/NetworkTab.jsx";
import { RoomSettings } from "../components/modals/RoomSettings.jsx";
import { DecisionSettings } from "../components/modals/DecisionSettings.jsx";
import { AddExternal } from "../components/modals/AddExternal.jsx";
import { NewDecision } from "../components/modals/NewDecision.jsx";
import { CommandsModal } from "../components/modals/CommandsModal.jsx";
import { ConfirmModal } from "../components/modals/ConfirmModal.jsx";

const TABS = [
  { id: "people", label: "People", hint: "Who you are dealing with" },
  { id: "grid", label: "Energy", hint: "Who to spend energy on" },
  { id: "network", label: "Network", hint: "Who moves whom" },
];

/* Hash routes for the linkable person, person notes, and frameworks pages. */
function parseHash(hash) {
  if (hash === "#/frameworks") return { view: "frameworks", personId: null };
  if (hash.startsWith("#/person/")) {
    const rest = hash.slice("#/person/".length);
    if (rest.endsWith("/notes")) {
      return { view: "personNotes", personId: rest.slice(0, -"/notes".length) };
    }
    return { view: "person", personId: rest };
  }
  return { view: "lenses", personId: null };
}

function gridValueIsExtreme(value) {
  return value != null && (value <= 10 || value >= 90);
}

function gridValueChanged(current, next) {
  if (next == null) return false;
  if (current == null) return true;
  return Math.round(Number(current)) !== Math.round(Number(next));
}

function gridClarification(person, axis, value) {
  const label = axis === "power" ? "power" : "interest";
  const direction = value >= 90 ? "near the top" : "near zero";
  return `${person.name}'s ${label} landed ${direction}. Is that literal, or should it be more moderate?`;
}

function softGridConfirm(person, power, interest) {
  return `I read ${person.name} as roughly ${power} power and ${interest} interest, but I was not certain. Adjust if that is off.`;
}

function commandCapabilities(sourceCommand) {
  return {
    notes: sourceCommand === "note" || sourceCommand === "map" || sourceCommand === "create",
    profile: sourceCommand === "note" || sourceCommand === "map" || sourceCommand === "create",
    grid: sourceCommand === "grid" || sourceCommand === "map" || sourceCommand === "create",
    edges: sourceCommand === "network" || sourceCommand === "map" || sourceCommand === "create",
  };
}

function commandResultLabel(sourceCommand) {
  if (sourceCommand === "note") return "Note saved";
  if (sourceCommand === "grid") return "Grid updated";
  if (sourceCommand === "network") return "Network updated";
  if (sourceCommand === "create") return "People updated";
  return "Room updated";
}

function cleanShortNote(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 220 ? `${clean.slice(0, 217).trim()}...` : clean;
}

function mergePersonPatch(person, profilePatch) {
  if (!profilePatch) return null;
  const next = { ...profilePatch };
  if (profilePatch.baseRead) next.baseRead = { ...(person.baseRead || {}), ...profilePatch.baseRead };
  if (profilePatch.visualTags) next.visualTags = { ...(person.visualTags || {}), ...profilePatch.visualTags };
  return { ...next, fresh: false };
}

export default function Room({ onExit, userId, userName, userEmail }) {
  const store = useStore();
  const isMobile = useIsMobile();
  const [profileOpen, setProfileOpen] = useState(false);

  const [activeRoomId, setActiveRoomId] = useState("mobile");
  const [activeDecisionId, setActiveDecisionId] = useState("salesforce");
  const [activeTab, setActiveTab] = useState("people");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [nodeSummaryId, setNodeSummaryId] = useState(null);
  const [route, setRoute] = useState(() =>
    typeof window === "undefined" ? { view: "lenses", personId: null } : parseHash(window.location.hash)
  );
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const [modal, setModal] = useState(null); // { type, id }
  const [pendingOnboarding, setPendingOnboarding] = useState(false);
  const [onboarding, setOnboarding] = useState({
    active: false,
    mode: "first-run", // "first-run" | "guided"
    phase: "questions", // "questions" | "naming" | "done"
    step: 0,
    answers: {},
    draft: "",
    nameDraft: "",
    messages: [],
    thinking: false,
    busy: false,
    error: "",
  });

  const rooms = store.getRooms();
  const collapsed = !!store.getPref("railCollapsed");
  const room = store.getRoom(activeRoomId);
  const decisions = store.getDecisions(activeRoomId);
  const decision = store.getDecision(activeDecisionId);
  const usableRoom = hasUsableRoom(rooms, (roomId) => store.getDecisions(roomId));
  const participants = activeDecisionId ? store.getParticipants(activeDecisionId) : [];
  const messages = activeDecisionId ? store.getChat(activeDecisionId) : [];
  const lastPlay = [...messages].reverse().find((m) => m.type === "play");
  const sequence = lastPlay?.response?.sequence;
  const roomHasPeople = (room?.rosterIds?.length || 0) > 0;
  /* The Read: a grounded read of the room. It runs only from the explicit @read
     command, so selecting a room or decision never reads by surprise. */
  const generateRead = useCallback(
    async ({ decisionId, auto } = {}) => {
      const id = decisionId || activeDecisionId;
      const d = store.getDecision(id);
      if (!d) return;
      const people = store.getParticipants(id);
      const edges = store.getEdges(id);
      if (!autoReadEligible(people.length, edges.length)) {
        if (!auto) {
          store.pushMessage(id, {
            type: "fallback",
            body: "Basic insights only for now. I need a few more people and at least a couple of relationships before I can read the room. Map them with @energy and @network, then run @read.",
          });
        }
        return;
      }
      if (!LIVE_LLM) {
        if (!auto) store.pushMessage(id, { type: "fallback", body: "Live reasoning is off, so I cannot read the room right now." });
        return;
      }
      setIsGenerating(true);
      trackEvent("read_generated", { auto: !!auto });
      try {
        const resp = await askStrategist({
          question: AUTO_READ_QUESTION,
          room: store.getRoom(d.roomId),
          decision: d,
          participants: people,
          edges,
          messages: [],
        });
        if (resp.kind === "coach") {
          trackEvent("read_shown");
          store.pushMessage(id, {
            type: "read",
            body: resp.answer.answer,
            questions: resp.answer.moves,
            cites: resp.answer.cites,
            grounded: resp.answer.grounded,
          });
        } else if (!auto) {
          store.pushMessage(id, { type: "fallback", body: resp.body });
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [activeDecisionId, store]
  );

  const startOnboarding = useCallback(
    ({ auto = false, mode = "first-run" } = {}) => {
      store.setPref("onboardingPrompted", true);
      // First-run opens with the rooms rail collapsed so the conversation owns
      // the screen; Phase C expands it again on "Open room".
      if (auto) store.setPref("railCollapsed", true);
      const intro = mode === "guided" ? ONBOARDING_INTRO_RETURNING : ONBOARDING_INTRO;
      setOnboarding({
        active: true,
        mode,
        phase: "questions",
        step: 0,
        answers: {},
        draft: "",
        nameDraft: "",
        messages: [
          { role: "assistant", body: intro },
          { role: "assistant", body: ONBOARDING_QUESTIONS[0].prompt },
        ],
        thinking: false,
        busy: false,
        error: "",
      });
      trackEvent("onboarding_started", { auto, mode });
    },
    [store]
  );

  useEffect(() => {
    if (!userId) return;
    setPendingOnboarding(consumeOnboardingPending(userId));
  }, [userId]);

  // Hash is the single source for the Tier 2 person page and Tier 3 frameworks
  // page, so they are linkable and the browser back button works.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const apply = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Guided setup owns the screen, so close the mobile drawer whenever it
  // activates (e.g. "+ New room" started from inside the drawer).
  useEffect(() => {
    if (onboarding.active) setDrawerOpen(false);
  }, [onboarding.active]);

  const openPersonPage = useCallback((id) => {
    setNodeSummaryId(null);
    window.location.hash = `#/person/${id}`;
  }, []);
  const openPersonNotes = useCallback((id) => {
    setNodeSummaryId(null);
    window.location.hash = `#/person/${id}/notes`;
  }, []);
  const openFrameworks = useCallback(() => {
    window.location.hash = "#/frameworks";
  }, []);
  const openMobileMenu = useCallback(() => {
    setDrawerOpen(true);
  }, []);
  const pageBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "#/";
  }, []);

  useEffect(() => {
    if (
      shouldAutoStartOnboarding({
        pending: pendingOnboarding,
        prompted: Boolean(store.getPref("onboardingPrompted")),
        usableRoom,
      })
    ) {
      setPendingOnboarding(false);
      startOnboarding({ auto: true });
    }
  }, [pendingOnboarding, startOnboarding, store, usableRoom]);

  const skipOnboarding = useCallback(() => {
    store.setPref("onboardingPrompted", true);
    store.setPref("railCollapsed", false);
    trackEvent("onboarding_skipped", { mode: onboarding.mode });
    setOnboarding((current) => ({ ...current, active: false, phase: "questions", thinking: false, busy: false, error: "" }));
    // Connect guided and manual: "I'll set it up myself" drops into the existing
    // Room Settings modal. Reuse an empty room if one exists, else create one.
    const emptyRoom = store.getRooms().find((r) => !hasUsableRoom([r], (roomId) => store.getDecisions(roomId)));
    const roomId = emptyRoom?.id || store.createRoom();
    setActiveRoomId(roomId);
    setActiveDecisionId(null);
    setActiveTab("people");
    setModal({ type: "roomSettings", id: roomId });
  }, [store, onboarding.mode]);

  const openOnboardingRoom = useCallback(() => {
    // Expand the rooms rail and land in the now-populated room.
    store.setPref("railCollapsed", false);
    setOnboarding((current) => ({ ...current, active: false, busy: false }));
  }, [store]);

  /* navigation */
  const selectRoom = useCallback(
    (id) => {
      setActiveRoomId(id);
      store.setUserSetting("lastRoomId", id);
      const first = store.getDecisions(id).find((d) => d.status === "active");
      if (first) {
        store.ensureChat(first.id);
        setActiveDecisionId(first.id);
        store.setUserSetting("lastDecisionId", first.id);
      } else {
        setActiveDecisionId(null);
        store.setUserSetting("lastDecisionId", null);
      }
      setShowPath(false);
      setActiveTab("people");
    },
    [store]
  );
  const selectDecision = useCallback(
    (id) => {
      store.ensureChat(id);
      setActiveDecisionId(id);
      store.setUserSetting("lastRoomId", activeRoomId);
      store.setUserSetting("lastDecisionId", id);
      setShowPath(false);
      setActiveTab("people");
    },
    [store, activeRoomId]
  );

  // Restore the last room and decision once the synced settings load, so a
  // reload returns the user where they left off (Task 5). Runs once when a
  // valid stored room becomes available.
  const restoredSelection = useRef(false);
  const storedRoomId = store.getPref("lastRoomId");
  const storedDecisionId = store.getPref("lastDecisionId");
  useEffect(() => {
    if (restoredSelection.current || !rooms.length) return;
    if (!storedRoomId || !store.getRoom(storedRoomId)) return;
    restoredSelection.current = true;
    setActiveRoomId(storedRoomId);
    const stored = storedDecisionId ? store.getDecision(storedDecisionId) : null;
    if (stored && stored.roomId === storedRoomId && stored.status === "active") {
      store.ensureChat(stored.id);
      setActiveDecisionId(stored.id);
    } else {
      const first = store.getDecisions(storedRoomId).find((d) => d.status === "active") || null;
      setActiveDecisionId(first?.id || null);
      if (first) store.ensureChat(first.id);
    }
  }, [rooms, storedRoomId, storedDecisionId, store]);

  useEffect(() => {
    if (!rooms.length) {
      if (activeRoomId !== null) setActiveRoomId(null);
      if (activeDecisionId !== null) setActiveDecisionId(null);
      return;
    }
    if (!store.getRoom(activeRoomId)) {
      const firstRoom = rooms[0];
      const firstDecision = store.getDecisions(firstRoom.id).find((d) => d.status === "active") || null;
      setActiveRoomId(firstRoom.id);
      setActiveDecisionId(firstDecision?.id || null);
      if (firstDecision) store.ensureChat(firstDecision.id);
      setShowPath(false);
      setActiveTab("people");
      return;
    }
    const currentDecision = activeDecisionId ? store.getDecision(activeDecisionId) : null;
    if (activeDecisionId && (!currentDecision || currentDecision.status !== "active")) {
      const firstDecision = store.getDecisions(activeRoomId).find((d) => d.status === "active") || null;
      setActiveDecisionId(firstDecision?.id || null);
      if (firstDecision) store.ensureChat(firstDecision.id);
      setShowPath(false);
      setActiveTab("people");
    }
  }, [rooms, activeRoomId, activeDecisionId, store]);

  const newRoom = useCallback(() => {
    const id = store.createRoom();
    trackEvent("room_create");
    setActiveRoomId(id);
    setActiveDecisionId(null);
    setActiveTab("people");
    setModal({ type: "roomSettings", id });
  }, [store]);
  // The "+ New room" door reuses the same guided engine with returning-user
  // framing (no product intro). Skipping it drops into manual Room Settings.
  const startGuidedRoom = useCallback(() => startOnboarding({ auto: false, mode: "guided" }), [startOnboarding]);
  const newDecision = useCallback(() => {
    if (!room?.rosterIds?.length) {
      setModal({ type: "roomSettings", id: activeRoomId });
      return;
    }
    setModal({ type: "newDecision" });
  }, [room, activeRoomId]);

  /* lifecycle */
  const archive = useCallback(
    (id) => {
      store.archiveDecision(id);
      trackEvent("decision_archive");
      if (id === activeDecisionId) {
        const next = store.getDecisions(activeRoomId).find((d) => d.status === "active" && d.id !== id);
        setActiveDecisionId(next ? next.id : null);
        if (next) store.ensureChat(next.id);
      }
    },
    [store, activeDecisionId, activeRoomId]
  );
  const confirmDeleteRoom = useCallback(
    (id) => {
      store.deleteRoom(id);
      trackEvent("room_delete");
      const remaining = store.getRooms();
      const nextRoom = remaining[0] || null;
      setActiveRoomId(nextRoom?.id || null);
      const firstDec = nextRoom ? store.getDecisions(nextRoom.id).find((d) => d.status === "active") : null;
      setActiveDecisionId(firstDec?.id || null);
      setModal(null);
    },
    [store]
  );
  const confirmDeleteDecision = useCallback(
    (id) => {
      const wasActive = id === activeDecisionId;
      store.deleteDecision(id);
      trackEvent("decision_delete");
      if (wasActive) {
        const next = store.getDecisions(activeRoomId).find((d) => d.status === "active");
        setActiveDecisionId(next?.id || null);
      }
      setModal(null);
    },
    [store, activeDecisionId, activeRoomId]
  );
  const confirmDeletePerson = useCallback(
    (id) => {
      store.deletePerson(id, activeRoomId);
      trackEvent("person_roster_remove");
      setModal(null);
    },
    [store, activeRoomId]
  );

  /* Profile surfaces. Graph taps open the small node summary first; people,
     read chips, and summary taps open the single person profile page. */
  const openNodeSummary = useCallback((id) => {
    setNodeSummaryId(id);
  }, []);

  const openReadChip = useCallback(
    (id) => {
      trackEvent("read_chip_clicked", { personId: id });
      openPersonPage(id);
    },
    [openPersonPage]
  );

  const findPersonRef = useCallback(
    (ref, currentParticipants = participants) => {
      const allPeople = store.getAllPeople();
      return resolvePersonRef(ref, [currentParticipants, Object.values(allPeople)]);
    },
    [participants, store]
  );

  const ensurePersonForUpdate = useCallback(
    (item, currentRoom, currentDecision, currentParticipants = participants) => {
      const existing = findPersonRef(item.id || item.name, currentParticipants);
      if (existing) {
        if (currentRoom && !currentRoom.rosterIds.includes(existing.id)) store.addToRoster(currentRoom.id, existing.id);
        if (currentDecision && ![...currentDecision.participantIds, ...currentDecision.externalIds].includes(existing.id)) {
          store.addParticipant(currentDecision.id, existing.id);
        }
        return existing.id;
      }
      if (!item.create || !item.name || !currentRoom) return null;
      const id = store.createPerson({ name: item.name, role: item.role || "" });
      store.addToRoster(currentRoom.id, id);
      if (currentDecision) store.addParticipant(currentDecision.id, id);
      trackEvent("person_create", { source: "chat_map" });
      return id;
    },
    [findPersonRef, participants, store]
  );

  const applyRoomUpdate = useCallback(
    (update, sourceCommand, target = {}) => {
      const targetDecisionId = target.decisionId || decision?.id;
      const targetRoomId = target.roomId || room?.id;
      if (!targetDecisionId || !targetRoomId || !update) return null;
      let currentDecision = store.getDecision(targetDecisionId);
      const currentRoom = store.getRoom(targetRoomId);
      if (!currentDecision || !currentRoom) return null;
      let currentParticipants = store.getParticipants(targetDecisionId);
      let notes = 0;
      let profiles = 0;
      let placements = 0;
      let positions = 0;
      let edges = 0;
      let created = 0;
      const clarificationQuestions = [];
      const confirmQuestions = [];
      const caps = commandCapabilities(sourceCommand);

      update.people.forEach((item) => {
        const existed = Boolean(findPersonRef(item.id || item.name, currentParticipants));
        const id = ensurePersonForUpdate(item, currentRoom, currentDecision, currentParticipants);
        if (!id) return;
        if (!existed && item.create) created += 1;
        const person = store.getPerson(id);
        if (item.role && person && !person.role) store.updatePerson(id, { role: item.role });
        if (caps.notes && item.note) {
          store.addObservation(id, { text: item.note, source: "chat", decisionId: targetDecisionId });
          notes += 1;
        }
        const patch = person ? mergePersonPatch(person, item.profilePatch) : null;
        if (caps.profile && patch) {
          store.updatePerson(id, patch);
          profiles += 1;
        }
        if (caps.grid && item.position && item.position !== currentDecision?.positions?.[id]) {
          store.setPosition(targetDecisionId, id, item.position);
          positions += 1;
        }
        if (caps.grid && item.power != null && item.interest != null) {
          const currentPlacement = currentDecision?.placements?.[id] || {};
          const extremePower = gridValueChanged(currentPlacement.power, item.power) && gridValueIsExtreme(item.power);
          const extremeInterest = gridValueChanged(currentPlacement.interest, item.interest) && gridValueIsExtreme(item.interest);
          if (extremePower || extremeInterest) {
            const axis = extremePower ? "power" : "interest";
            clarificationQuestions.push(gridClarification(store.getPerson(id) || item, axis, extremePower ? item.power : item.interest));
            currentDecision = store.getDecision(targetDecisionId);
            currentParticipants = store.getParticipants(targetDecisionId);
            return;
          }
          store.setPlacement(targetDecisionId, id, item.power, item.interest, item.confidence);
          placements += 1;
          if (item.confidence === "low" && !confirmQuestions.length) {
            confirmQuestions.push(softGridConfirm(store.getPerson(id) || item, item.power, item.interest));
          }
        }
        currentDecision = store.getDecision(targetDecisionId);
        currentParticipants = store.getParticipants(targetDecisionId);
      });

      if (caps.edges) update.edges.forEach((edge) => {
        const from = ensurePersonForUpdate({ id: edge.from, name: edge.from, create: sourceCommand !== "grid" }, currentRoom, currentDecision, currentParticipants);
        const to = ensurePersonForUpdate({ id: edge.to, name: edge.to, create: sourceCommand !== "grid" }, currentRoom, currentDecision, currentParticipants);
        if (!from || !to || from === to) return;
        const id = store.addEdge(targetDecisionId, { from, to, type: edge.type });
        if (id) edges += 1;
        if (edge.note) store.addDecisionNote(targetDecisionId, edge.note);
        currentDecision = store.getDecision(targetDecisionId);
        currentParticipants = store.getParticipants(targetDecisionId);
      });

      if (update.decisionNote) store.addDecisionNote(targetDecisionId, update.decisionNote);
      if (edges) setActiveTab("network");
      else if (placements || positions) setActiveTab("grid");

      const parts = [
        created ? `${created} ${created === 1 ? "person" : "people"}` : "",
        notes ? `${notes} ${notes === 1 ? "note" : "notes"}` : "",
        profiles ? `${profiles} ${profiles === 1 ? "read" : "reads"}` : "",
        placements || positions ? "grid" : "",
        edges ? "network" : "",
      ].filter(Boolean);
      let body = update.summary || (parts.length ? `Updated ${parts.join(", ")}.` : "No clear update found.");
      if (sourceCommand === "network" && edges) body = `Added ${edges} network ${edges === 1 ? "relationship" : "relationships"}.`;
      if (clarificationQuestions.length && !placements && !positions) body = "I need a quick check before moving the grid.";
      else if (clarificationQuestions.length) body = `Updated ${parts.join(", ") || "the room"}, but held one extreme grid value for confirmation.`;
      const concreteChanges = created + notes + profiles + placements + positions + edges;
      const modelQuestions = concreteChanges || clarificationQuestions.length ? [] : update.openQuestions || [];

      return {
        label: commandResultLabel(sourceCommand),
        body,
        questions: [...clarificationQuestions, ...confirmQuestions, ...modelQuestions].slice(0, 2),
      };
    },
    [decision, ensurePersonForUpdate, findPersonRef, room, store]
  );

  const completeOnboarding = useCallback(
    async (answers, nameOverride) => {
      if (!LIVE_LLM) {
        throw new Error("Guided setup needs live local reasoning. Turn on VITE_ENABLE_LIVE_LLM, then try again.");
      }

      const seed = deriveDecisionSeed(answers.decision, nameOverride);
      const emptyRoom = rooms.find((r) => !hasUsableRoom([r], (roomId) => store.getDecisions(roomId)));
      const roomId = emptyRoom?.id || store.createRoom(seed.roomName);
      if (emptyRoom) store.updateRoom(roomId, { name: seed.roomName });
      trackEvent("onboarding_room_created", { reused: Boolean(emptyRoom) });

      const decisionId = store.createDecision(roomId, {
        title: seed.title,
        context: seed.context,
        participants: [],
      });
      store.ensureChat(decisionId);
      setActiveRoomId(roomId);
      setActiveDecisionId(decisionId);
      setActiveTab("people");
      setShowPath(false);

      const plan = buildOnboardingCommandPlan(answers);
      for (const item of plan) {
        const currentDecision = store.getDecision(decisionId);
        const currentRoom = store.getRoom(roomId);
        const resp = await interpretRoomCommand({
          command: item.command,
          text: item.text,
          room: currentRoom,
          decision: currentDecision,
          participants: store.getParticipants(decisionId),
          edges: store.getEdges(decisionId),
          messages: [],
        });
        if (resp.kind !== "update") throw new Error(resp.body || "The mapping pass failed.");
        // The @create pass must never silently drop a named person, or the room
        // can land on "No participants". Force-create guarantees each extracted
        // person is added; apply-time resolution still prevents duplicates.
        const update = item.command === "create" ? forceCreatePeople(resp.update) : resp.update;
        applyRoomUpdate(update, item.command, { roomId, decisionId });
      }

      const finalDecision = store.getDecision(decisionId);
      const finalParticipants = store.getParticipants(decisionId);
      if (!finalParticipants.length) throw new Error("I could not map any people from that answer. Try names with short roles.");
      setActiveTab("people");

      const placedCount = Object.keys(finalDecision?.placements || {}).filter(
        (id) => finalParticipants.some((p) => p.id === id)
      ).length;
      const edgeCount = (finalDecision?.edges || []).length;

      store.pushMessage(decisionId, {
        type: "updated",
        label: "Room ready",
        body: "Your first map is ready. Run @read for the first room read, or ask @ask who to talk to first.",
      });
      trackEvent("onboarding_completed", { people: finalParticipants.length, edges: edgeCount });

      return {
        names: finalParticipants.map((p) => p.name),
        placedCount,
        edgeCount,
      };
    },
    [applyRoomUpdate, rooms, store]
  );

  const submitOnboarding = useCallback(
    async (e) => {
      e.preventDefault();
      if (onboarding.thinking || onboarding.busy) return;

      // Naming confirm: build the room with the chosen name, then close.
      if (onboarding.phase === "naming") {
        const name = onboarding.nameDraft.trim();
        if (!name) return;
        const answers = onboarding.answers;
        setOnboarding((current) => ({
          ...current,
          messages: [...current.messages, { role: "user", body: name }],
          busy: true,
          error: "",
        }));
        try {
          const summary = await completeOnboarding(answers, name);
          setOnboarding((current) => ({
            ...current,
            busy: false,
            phase: "done",
            messages: [...current.messages, { role: "assistant", body: buildClosingSummary(summary) }],
          }));
        } catch (err) {
          setOnboarding((current) => ({
            ...current,
            busy: false,
            error: err?.message || "Guided setup failed. You can try again or set up the room yourself.",
          }));
        }
        return;
      }

      // Question phase. The relationships step is skippable with an empty answer.
      const question = ONBOARDING_QUESTIONS[onboarding.step];
      const raw = onboarding.draft.trim();
      const skipped = !raw && question.skippable;
      if (!raw && !skipped) return;
      const answer = skipped ? "skip" : raw;
      const answers = { ...onboarding.answers, [question.id]: answer };
      const isLast = onboarding.step >= ONBOARDING_QUESTIONS.length - 1;

      // Show the user turn, then a brief thinking beat before the reflection.
      setOnboarding((current) => ({
        ...current,
        answers,
        draft: "",
        thinking: true,
        error: "",
        messages: [...current.messages, { role: "user", body: skipped ? "Skip" : answer }],
      }));

      await sleep(REFLECT_DELAY_MS);

      const reflection = reflectOnAnswer(question.id, answer);
      if (isLast) {
        const prefill = decisionSeedNeedsConfirm(answers.decision) ? "" : deriveDecisionTitle(answers.decision);
        setOnboarding((current) => ({
          ...current,
          thinking: false,
          phase: "naming",
          nameDraft: prefill,
          messages: [
            ...current.messages,
            ...(reflection ? [{ role: "assistant", body: reflection }] : []),
            { role: "assistant", body: namingPrompt(answers.decision) },
          ],
        }));
        return;
      }

      const nextStep = onboarding.step + 1;
      setOnboarding((current) => ({
        ...current,
        step: nextStep,
        thinking: false,
        messages: [
          ...current.messages,
          ...(reflection ? [{ role: "assistant", body: reflection }] : []),
          { role: "assistant", body: ONBOARDING_QUESTIONS[nextStep].prompt },
        ],
      }));
    },
    [completeOnboarding, onboarding]
  );

  /* chat */
  const onSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const q = draft.trim();
      if (!q || !decision || isGenerating) {
        setDraft("");
        return;
      }
      setShowPath(false);
      // Capture prior turns before the new user message lands, for anaphora.
      const priorMessages = store.getChat(decision.id);
      store.pushMessage(decision.id, { type: "user", body: q });

      const note = q.match(/^@notes?\s+([\s\S]+)$/i);
      if (note) {
        const remainder = note[1].trim();
        const { person: target, body } = splitLeadingPersonRef(remainder, [
          participants,
          Object.values(store.getAllPeople()),
        ]);
        if (target && body) {
          setDraft("");
          setIsGenerating(true);
          try {
            const resp = await interpretRoomCommand({
              command: "note",
              text: body,
              room,
              decision,
              participants,
              edges: store.getEdges(decision.id),
              focusPerson: target,
              messages: priorMessages,
            });
            if (resp.kind === "update") {
              const message = applyRoomUpdate(resp.update, "note") || { label: "Note saved", body: `Updated ${target.name}.` };
              trackEvent("observation_create", { source: "chat_note" });
              store.pushMessage(decision.id, { type: "updated", ...message });
            } else {
              const text = cleanShortNote(body);
              store.addObservation(target.id, { text, source: "note", decisionId: decision.id });
              store.pushMessage(decision.id, { type: "note", personName: target.name, text });
            }
          } finally {
            setIsGenerating(false);
          }
        } else if (target && !body) {
          setDraft("");
          store.pushMessage(decision.id, { type: "fallback", body: `Add the note after ${target.name}. Try "@note ${target.name.split(/\\s+/)[0]} <what you observed>".` });
        } else {
          setDraft("");
          store.pushMessage(decision.id, {
            type: "fallback",
            body: "I could not match that person. Use a name, first name, or a role like CEO, head of sales, or PM of web.",
          });
        }
        return;
      }
      const add = q.match(/^@add\s+([^,]+)(?:,\s*([\s\S]+))?$/i);
      if (add) {
        const name = add[1].trim();
        const role = (add[2] || "").trim();
        const id = store.addExternal(decision.id, { name, role });
        trackEvent("external_add");
        store.pushMessage(decision.id, { type: "added", body: `${name} added as an external participant. First pass read, sharpen it with notes.` });
        if (id) openPersonPage(id);
        setDraft("");
        return;
      }
      const mapCommand = q.match(/^@(map|energy|grid|network|net|create)\s+([\s\S]+)$/i);
      if (mapCommand) {
        const rawCommand = mapCommand[1].toLowerCase();
        // @energy is the user-facing name; @grid stays as a hidden alias. Both
        // route to the internal "grid" command and the grid data fields.
        const command = rawCommand === "net" ? "network" : rawCommand === "energy" ? "grid" : rawCommand;
        const text = mapCommand[2].trim();
        setDraft("");
        setIsGenerating(true);
        try {
          const resp = await interpretRoomCommand({
            command,
            text,
            room,
            decision,
            participants,
            edges: store.getEdges(decision.id),
            messages: priorMessages,
          });
          if (resp.kind === "update") {
            const message = applyRoomUpdate(resp.update, command) || { label: "Map updated", body: "Updated the room." };
            trackEvent("room_map_update", { command });
            store.pushMessage(decision.id, { type: "updated", ...message });
          } else {
            store.pushMessage(decision.id, { type: "fallback", body: resp.body });
          }
        } finally {
          setIsGenerating(false);
        }
        return;
      }
      const ask = q.match(/^@(ask|coach)\s+([\s\S]+)$/i);
      if (ask) {
        const question = ask[2].trim();
        setDraft("");
        setIsGenerating(true);
        try {
          const resp = await askStrategist({
            question,
            room,
            decision,
            participants,
            edges: store.getEdges(decision.id),
            messages: priorMessages,
          });
          if (resp.kind === "coach") {
            trackEvent("strategist_ask");
            store.pushMessage(decision.id, {
              type: "coach",
              body: resp.answer.answer,
              questions: resp.answer.moves,
              cites: resp.answer.cites,
              grounded: resp.answer.grounded,
            });
          } else {
            store.pushMessage(decision.id, { type: "fallback", body: resp.body });
          }
        } finally {
          setIsGenerating(false);
        }
        return;
      }

      if (/^@read\b/i.test(q)) {
        setDraft("");
        await generateRead({ auto: false });
        return;
      }

      // Open chat (experimental): plain text routes to the grounded strategist
      // behind the input guard. Anything off-topic is declined by the strategist.
      if (!OPEN_CHAT) {
        setDraft("");
        store.pushMessage(decision.id, {
          type: "fallback",
          body: "Use @note, @energy, @network, @map, @create, @ask, @read, or @add to work the room.",
        });
        return;
      }
      setDraft("");
      const screen = screenOpenMessage(q);
      if (screen.blocked) {
        trackEvent("open_chat_blocked", { reason: screen.reason });
        store.pushMessage(decision.id, { type: "fallback", body: screen.reply });
        return;
      }
      setIsGenerating(true);
      try {
        const resp = await askStrategist({
          question: q,
          room,
          decision,
          participants,
          edges: store.getEdges(decision.id),
          messages: priorMessages,
        });
        if (resp.kind === "coach") {
          trackEvent("open_chat");
          store.pushMessage(decision.id, {
            type: "coach",
            body: resp.answer.answer,
            questions: resp.answer.moves,
            cites: resp.answer.cites,
            grounded: resp.answer.grounded,
          });
        } else {
          store.pushMessage(decision.id, { type: "fallback", body: resp.body });
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [applyRoomUpdate, decision, draft, findPersonRef, generateRead, isGenerating, openPersonPage, participants, room, store]
  );
  const showOnNetwork = useCallback(() => {
    setShowPath(true);
    setActiveTab("network");
  }, []);

  const modalRoom = modal?.id ? store.getRoom(modal.id) : null;
  const modalDecision = modal?.id ? store.getDecision(modal.id) : null;
  const modalPerson = modal?.id ? store.getPerson(modal.id) : null;

  const personPagePerson = (route.view === "person" || route.view === "personNotes") && route.personId ? store.getPerson(route.personId) : null;
  const personPagePosition = personPagePerson ? decision?.positions?.[personPagePerson.id] || "unknown" : "unknown";
  const personPagePlacement = personPagePerson && decision ? store.getPlacement(decision.id, personPagePerson.id) : null;
  const summaryPerson = nodeSummaryId ? store.getPerson(nodeSummaryId) : null;
  const summaryPosition = summaryPerson ? decision?.positions?.[summaryPerson.id] || "unknown" : "unknown";
  const summaryPlacement = summaryPerson && decision ? store.getPlacement(decision.id, summaryPerson.id) : null;
  const onGraphLens = activeTab === "grid" || activeTab === "network";
  const routePageOpen =
    route.view === "frameworks" ||
    ((route.view === "person" || route.view === "personNotes") && Boolean(personPagePerson));

  // Account identity: the saved profile name wins over the Auth display name in
  // the greeting and everywhere the name is shown.
  const accountProfile = store.getProfile();
  const accountName = accountProfile.name || userName || (userEmail ? userEmail.split("@")[0] : "") || "Account";
  const accountEmail = userEmail || accountProfile.email || "";
  const saveProfile = useCallback(
    async ({ name, position }) => {
      await store.saveProfile({ name, position });
      trackEvent("profile_save");
    },
    [store]
  );

  const railProps = {
    rooms,
    activeRoomId,
    activeDecisionId,
    onSelectRoom: selectRoom,
    onNewRoom: startGuidedRoom,
    onEditRoom: (id) => setModal({ type: "roomSettings", id }),
    onDeleteRoom: (id) => setModal({ type: "deleteRoom", id }),
    decisions,
    onSelectDecision: selectDecision,
    onNewDecision: newDecision,
    onEditDecision: (id) => setModal({ type: "decisionSettings", id }),
    onArchiveDecision: archive,
    onDeleteDecision: (id) => setModal({ type: "deleteDecision", id }),
  };
  const chatProps = {
    messages,
    participants,
    decision,
    onShowNetwork: showOnNetwork,
    onOpenProfile: openPersonPage,
    onCiteClick: openReadChip,
    onOpenCommands: () => setModal({ type: "commands" }),
    draft,
    setDraft,
    onSubmit,
    isGenerating,
    openChat: OPEN_CHAT,
  };

  // The chat column already explains a missing decision. Keep the main
  // workspace quiet unless mobile has no visible rail and no room is selected.
  const quietWorkspace = <div className="workspace-blank" aria-hidden="true" />;
  const selectCard = (
    <div className="select-room">
      <h2 className="select-room-title">Select your room</h2>
      <p className="select-room-sub">Open a room to pick up where you left off, or set one up.</p>
      <div className="empty-actions">
        <button className="btn-primary" onClick={() => setDrawerOpen(true)}>
          Open rooms
        </button>
        <button className="btn-secondary" onClick={() => startOnboarding({ auto: false })}>
          Start guided setup
        </button>
      </div>
    </div>
  );

  return (
    <div className={`app ${collapsed ? "app-rail-collapsed" : ""} app-tab-${activeTab}`}>
      {!routePageOpen && (
        <>
          <header className="header">
            <div className="brand-lockup" aria-label="The Situation Room">
              <span className="brand">The Situation Room</span>
            </div>
            <div className="account-desktop">
              <AccountMenu
                name={accountName}
                email={accountEmail}
                onProfile={() => setProfileOpen(true)}
                onFrameworks={openFrameworks}
                onSignOut={onExit}
              />
            </div>
            <button className="burger" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
              <span />
              <span />
              <span />
            </button>
          </header>

          <div className="body">
            <Rail
              {...railProps}
              collapsed={collapsed}
              onToggleCollapse={() => store.setPref("railCollapsed", !collapsed)}
            />

            {onboarding.active ? (
              <main className="onboarding-panel">
                <OnboardingChat
                  messages={onboarding.messages}
                  thinking={onboarding.thinking}
                  phase={onboarding.phase}
                  step={onboarding.step}
                  totalSteps={ONBOARDING_QUESTIONS.length}
                  question={ONBOARDING_QUESTIONS[onboarding.step]}
                  skippable={Boolean(ONBOARDING_QUESTIONS[onboarding.step]?.skippable)}
                  draft={onboarding.draft}
                  setDraft={(value) => setOnboarding((current) => ({ ...current, draft: value }))}
                  nameDraft={onboarding.nameDraft}
                  setNameDraft={(value) => setOnboarding((current) => ({ ...current, nameDraft: value }))}
                  busy={onboarding.busy}
                  error={onboarding.error}
                  headline={onboarding.mode === "guided" ? "Set up a new room" : "Build your first room"}
                  onSubmit={submitOnboarding}
                  onSkip={skipOnboarding}
                  onOpenRoom={openOnboardingRoom}
                />
              </main>
            ) : (
              <>
                <main className="workspace">
                  {!rooms.length ? (
                    <div className="empty-state">
                      <div className="empty-icon">◦</div>
                      <p className="empty-title">Set up your first room</p>
                      <p className="empty-sub">Map the people behind a decision in a couple of minutes.</p>
                      <div className="empty-actions">
                        <button className="btn-primary" onClick={() => startOnboarding({ auto: false })}>
                          Start guided setup
                        </button>
                        <button className="btn-secondary" onClick={newRoom}>
                          New room
                        </button>
                      </div>
                    </div>
                  ) : !room ? (
                    isMobile ? selectCard : quietWorkspace
                  ) : !roomHasPeople ? (
                    <div className="empty-state">
                      <div className="empty-icon">◦</div>
                      <p className="empty-title">No one in this room yet</p>
                      <p className="empty-sub">Add your team to the roster. They become available across every decision in this room.</p>
                      <div className="empty-actions">
                        <button className="btn-primary" onClick={() => startOnboarding({ auto: false })}>
                          Start guided setup
                        </button>
                        <button className="btn-secondary" onClick={() => setModal({ type: "roomSettings", id: activeRoomId })}>
                          Add people
                        </button>
                      </div>
                    </div>
                  ) : !decision ? (
                    quietWorkspace
                  ) : (
                    <>
                      <div className="tabs">
                        {TABS.map((t) => (
                          <button
                            key={t.id}
                            className={`tab ${activeTab === t.id ? "tab-active" : ""}`}
                            onClick={() => {
                              setActiveTab(t.id);
                              setNodeSummaryId(null);
                            }}
                          >
                            <span className="tab-label">{t.label}</span>
                            <span className="tab-hint">{t.hint}</span>
                          </button>
                        ))}
                      </div>
                      <div className="tab-body">
                        {activeTab === "people" && (
                          <PeopleTab
                            participants={participants}
                            decision={decision}
                            onOpenProfile={openPersonPage}
                            onAddExternal={() => setModal({ type: "external" })}
                            onRemoveParticipant={(id) => {
                              store.removeParticipant(decision.id, id);
                              trackEvent("decision_participant_remove");
                            }}
                          />
                        )}
                        {activeTab === "grid" && (
                          <GridTab
                            participants={participants}
                            decision={decision}
                            selectedId={nodeSummaryId}
                            onOpenProfile={openNodeSummary}
                            onMove={(personId, power, interest) => store.setPlacement(decision.id, personId, power, interest)}
                          />
                        )}
                        {activeTab === "network" && (
                          <NetworkTab
                            participants={participants}
                            decision={decision}
                            edges={store.getEdges(decision.id)}
                            onRemoveEdge={(index) => store.removeEdge(decision.id, index)}
                            selectedId={nodeSummaryId}
                            onOpenProfile={openNodeSummary}
                            sequence={sequence}
                            showPath={showPath}
                          />
                        )}
                      </div>
                    </>
                  )}
                </main>

                <Chat {...chatProps} autoFocusInput={!isMobile} />
              </>
            )}
          </div>
        </>
      )}

      {/* Mobile shell: the burger drawer and the floating command companion. */}
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSignOut={onExit}
        onProfile={() => setProfileOpen(true)}
        onFrameworks={openFrameworks}
        accountName={accountName}
        railProps={railProps}
      />
      {!routePageOpen && !onboarding.active && decision && (
        <CommandCompanion
          open={companionOpen}
          onOpen={() => setCompanionOpen(true)}
          onClose={() => setCompanionOpen(false)}
          chatProps={{ ...chatProps, autoFocusInput: true }}
        />
      )}

      {/* Task 8: floating node summary on the graph lens. */}
      {!routePageOpen && summaryPerson && onGraphLens && (
        <NodeSummary
          person={summaryPerson}
          position={summaryPosition}
          placement={summaryPlacement}
          decisionTitle={decision?.title}
          onOpen={openPersonPage}
          onClose={() => setNodeSummaryId(null)}
        />
      )}

      {/* Person, person notes, and frameworks pages, full-screen and linkable. */}
      {route.view === "person" && personPagePerson && (
        <PersonPage
          key={personPagePerson.id}
          person={personPagePerson}
          position={personPagePosition}
          placement={personPagePlacement}
          onBack={pageBack}
          onSave={(patch) => {
            store.updatePerson(personPagePerson.id, patch);
            trackEvent("person_update");
          }}
          onDelete={room?.rosterIds?.includes(personPagePerson.id) ? (id) => setModal({ type: "deletePerson", id }) : null}
          onOpenFrameworks={openFrameworks}
          onOpenNotes={openPersonNotes}
          onOpenMenu={openMobileMenu}
        />
      )}
      {route.view === "personNotes" && personPagePerson && (
        <PersonNotesPage
          key={`${personPagePerson.id}-notes`}
          person={personPagePerson}
          onBack={() => {
            window.location.hash = `#/person/${personPagePerson.id}`;
          }}
          onOpenMenu={openMobileMenu}
        />
      )}
      {route.view === "frameworks" && <FrameworksPage onBack={pageBack} onOpenMenu={openMobileMenu} />}

      {profileOpen && (
        <ProfileModal
          name={accountProfile.name || userName || ""}
          email={accountEmail}
          position={accountProfile.position || ""}
          onSave={saveProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}

      {modal?.type === "roomSettings" && modalRoom && (
        <RoomSettings
          room={modalRoom}
          allPeople={store.getAllPeople()}
          onClose={() => setModal(null)}
          onRename={(name) => {
            store.updateRoom(modalRoom.id, { name });
            trackEvent("room_update");
          }}
          onCreatePerson={(person) => {
            const id = store.createPerson(person);
            store.addToRoster(modalRoom.id, id);
            trackEvent("person_create");
            return id;
          }}
          onAddToRoster={(id) => {
            store.addToRoster(modalRoom.id, id);
            trackEvent("room_roster_add");
          }}
          onRemoveFromRoster={(id) => {
            store.removeFromRoster(modalRoom.id, id);
            trackEvent("room_roster_remove");
          }}
        />
      )}
      {modal?.type === "decisionSettings" && modalDecision && (
        <DecisionSettings
          decision={modalDecision}
          onClose={() => setModal(null)}
          onSave={(patch) => {
            store.updateDecision(modalDecision.id, patch);
            trackEvent("decision_update");
            setModal(null);
          }}
          onArchive={() => {
            archive(modalDecision.id);
            setModal(null);
          }}
        />
      )}
      {modal?.type === "external" && decision && (
        <AddExternal
          onAdd={(name, role) => {
            const id = store.addExternal(decision.id, { name, role });
            trackEvent("external_add");
            setModal(null);
            if (id) openPersonPage(id);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "newDecision" && room && (
        <NewDecision
          rosterCount={room.rosterIds.length}
          onCreate={({ title, context }) => {
            const id = store.createDecision(activeRoomId, { title, context });
            trackEvent("decision_create", { roster_count: room.rosterIds.length });
            setModal(null);
            selectDecision(id);
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "commands" && <CommandsModal onClose={() => setModal(null)} />}
      {modal?.type === "deleteRoom" && modalRoom && (
        <ConfirmModal
          title="Delete room"
          body={`This deletes ${modalRoom.name}, its decisions, network, chat history, and roster people that belong only to this room. This cannot be undone.`}
          phrase="delete"
          confirmLabel="Delete room"
          onConfirm={() => confirmDeleteRoom(modalRoom.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "deleteDecision" && modalDecision && (
        <ConfirmModal
          title="Delete decision"
          body={`This deletes ${modalDecision.title}, its network, generated plays, and chat history. People and their notes stay. This cannot be undone.`}
          phrase="delete"
          confirmLabel="Delete decision"
          onConfirm={() => confirmDeleteDecision(modalDecision.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "deletePerson" && modalPerson && (
        <ConfirmModal
          title="Remove from roster"
          body={`This removes ${modalPerson.name} from ${room?.name || "this room"}'s roster. Their notes, placements, relationships, and influence in existing decisions stay.`}
          phrase="delete"
          confirmLabel="Remove from roster"
          onConfirm={() => confirmDeletePerson(modalPerson.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
