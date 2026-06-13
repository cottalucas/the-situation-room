import React, { useState, useCallback, useEffect, useRef } from "react";
import { useStore } from "../hooks/useStore.js";
import { interpretRoomCommand, askStrategist, buildContext, generatePlay, classifyIntent, captureExample } from "../lib/context.js";
import { checkPlayReadiness, buildPlayCoaching, nextCoachingStep, playStamp, playSituation } from "../lib/play-readiness.js";
import { trackEvent, trackNetwork } from "../lib/firebase.js";
import { consumeOnboardingPending } from "../lib/auth.js";
import { resolvePersonRef, splitLeadingPersonRef } from "../lib/person-ref.js";
import { autoReadEligible, AUTO_READ_QUESTION } from "../lib/auto-read.js";
import { screenOpenMessage } from "../lib/chat-guard.js";
import { commandCapabilities, influenceDecision, planClassificationAction, serverCommandForControllerCommand } from "../lib/room-command-contract.js";
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
// Plain-text routing. OFF in production: plain text runs through the controller
// and surfaces as a tappable suggestion pill, never routed silently and never
// mutating state. Flip to true (VITE_ENABLE_PLAIN_TEXT_ROUTING=true) only once
// the offline evals and live trace review say the controller is good enough to
// act on its own.
const ENABLE_PLAIN_TEXT_ROUTING = import.meta.env.VITE_ENABLE_PLAIN_TEXT_ROUTING === "true";

// One-line description of a controller plan, for pills and "treated as" labels.
function describeControllerPlan(plan) {
  if (plan.intent === "advise") return "@ask";
  if (plan.intent === "both") return `@${plan.command} plus advice`;
  return `@${plan.command}`;
}

// Content-free analytics value: where the controller routed, never what was said.
function controllerRoutedTo(plan) {
  if (plan.intent === "advise") return "strategist";
  if (plan.intent === "both") return `${plan.command}+strategist`;
  if (plan.intent === "map") return plan.command;
  return "none";
}

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
import { AddParticipant } from "../components/modals/AddParticipant.jsx";
import { NewDecision } from "../components/modals/NewDecision.jsx";
import { CommandsModal } from "../components/modals/CommandsModal.jsx";
import { ConfirmModal } from "../components/modals/ConfirmModal.jsx";

const TABS = [
  { id: "people", label: "People", hint: "Who you are dealing with" },
  { id: "grid", label: "Energy", hint: "Who to spend energy on" },
  { id: "network", label: "Network", hint: "Who moves whom" },
];
const TAB_IDS = new Set(TABS.map((tab) => tab.id));
const BROWSER_UI_STATE_KEY = "situation-room-ui-state-v1";
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function readBrowserUiState() {
  if (typeof window === "undefined") return {};
  try {
    const storage = window.localStorage;
    if (!storage) return {};
    const raw = storage.getItem(BROWSER_UI_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const state = {};
    if (typeof parsed.activeRoomId === "string" || parsed.activeRoomId === null) state.activeRoomId = parsed.activeRoomId;
    if (typeof parsed.activeDecisionId === "string" || parsed.activeDecisionId === null) {
      state.activeDecisionId = parsed.activeDecisionId;
    }
    if (TAB_IDS.has(parsed.activeTab)) state.activeTab = parsed.activeTab;
    return state;
  } catch {
    return {};
  }
}

function writeBrowserUiState(patch) {
  if (typeof window === "undefined") return;
  try {
    const storage = window.localStorage;
    if (!storage) return;
    const next = { ...readBrowserUiState(), ...patch };
    storage.setItem(BROWSER_UI_STATE_KEY, JSON.stringify(next));
  } catch {
    // Browser persistence is a convenience. The account settings restore still
    // works when localStorage is unavailable.
  }
}

/* Hash routes for the linkable person, person notes, and frameworks pages. */
function parseHash(hash) {
  if (hash === "#/frameworks") return { view: "frameworks", personId: null };
  if (hash.startsWith("#/decision/")) {
    const decisionId = decodeURIComponent(hash.slice("#/decision/".length));
    return { view: "lenses", personId: null, decisionId };
  }
  if (hash.startsWith("#/person/")) {
    const rest = hash.slice("#/person/".length);
    if (rest.endsWith("/notes")) {
      return { view: "personNotes", personId: rest.slice(0, -"/notes".length), decisionId: null };
    }
    return { view: "person", personId: rest, decisionId: null };
  }
  return { view: "lenses", personId: null, decisionId: null };
}

function replaceDecisionHash(decisionId) {
  if (typeof window === "undefined" || !decisionId) return;
  const nextHash = `#/decision/${encodeURIComponent(decisionId)}`;
  if (window.location.hash === nextHash) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
}

// Drop a stale #/decision/ hash when no decision is active, so a refresh does not
// try to restore a decision that is gone. Leaves person/frameworks hashes alone.
function clearDecisionHash() {
  if (typeof window === "undefined") return;
  if (!window.location.hash.startsWith("#/decision/")) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
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

// Map a calibrated grid value to its band label, so a captured example stores the
// qualitative read ("high") rather than a brittle exact number. Mirrors the
// calibration rubric: very low 10-20, low 25-35, moderate 45-55, high 70-80,
// very high 85-95.
function gridBand(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 20) return "very low";
  if (n <= 35) return "low";
  if (n <= 55) return "moderate";
  if (n <= 80) return "high";
  return "very high";
}

// Names to redact from a captured phrasing: every participant's full name and
// first name. The Function redacts these to [person] before storing, so the raw
// names never persist.
function redactNamesFor(participants) {
  const names = new Set();
  for (const p of participants || []) {
    const full = (p?.name || "").trim();
    if (!full) continue;
    names.add(full);
    const first = full.split(/\s+/)[0];
    if (first) names.add(first);
  }
  return [...names];
}

// Was this submission a correction of a prior suggestion? In the conversational
// flow there are no Accept/Adjust/Skip buttons: the model proposes and applies,
// and a follow-up that answers a soft-confirm or clarification (the last assistant
// turn carried questions) is the adjust signal. Otherwise it is an accept.
function lastTurnHadQuestions(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.type === "user") continue;
    return Array.isArray(m.questions) && m.questions.length > 0;
  }
  return false;
}

// Capture the mappings that committed from a user note as per-user examples. The
// phrasing is the user's own note; the Function redacts names at write time. One
// content-free analytics event per submission, enums only.
function captureLearnedMappings({ message, noteText, participants, priorMessages }) {
  const learned = message?.learned;
  if (!Array.isArray(learned) || !learned.length || !noteText) return;
  const wasAdjusted = lastTurnHadQuestions(priorMessages || []);
  const action = wasAdjusted ? "adjust" : "accept";
  const redactNames = redactNamesFor(participants);
  learned.forEach((item) => {
    captureExample({
      phrasing: noteText,
      redactNames,
      mappingOutcome: item.outcome,
      axis: item.axis,
      action,
      confidence: item.confidence,
      wasAdjusted,
    });
  });
  trackNetwork("example_captured", { action_type: action, was_adjusted: wasAdjusted });
}

// influence clarification copy stays about the ring, never about power/interest.
function influenceClarification(person) {
  return `Does ${person.name || "this person"} actually have a say on this decision, or are they just kept informed? Tell me high, medium, or low influence.`;
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
  const [initialBrowserUi] = useState(readBrowserUiState);
  const [initialRoute] = useState(() =>
    typeof window === "undefined" ? { view: "lenses", personId: null, decisionId: null } : parseHash(window.location.hash)
  );
  const browserStartedWithRoom = hasOwn(initialBrowserUi, "activeRoomId");
  const browserStartedWithDecision = hasOwn(initialBrowserUi, "activeDecisionId");
  const routeStartedWithDecision = Boolean(initialRoute.decisionId);
  const [profileOpen, setProfileOpen] = useState(false);

  const [activeRoomId, setActiveRoomId] = useState(() =>
    browserStartedWithRoom ? initialBrowserUi.activeRoomId : "mobile"
  );
  const [activeDecisionId, setActiveDecisionId] = useState(() =>
    routeStartedWithDecision ? initialRoute.decisionId : browserStartedWithDecision ? initialBrowserUi.activeDecisionId : "salesforce"
  );
  const [activeTab, setActiveTab] = useState(() => initialBrowserUi.activeTab || "people");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [nodeSummaryId, setNodeSummaryId] = useState(null);
  const [route, setRoute] = useState(initialRoute);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // When @play is blocked, the next free-text reply is parsed back through @map to
  // close the gap. Cleared when the decision changes or the gap is filled.
  const [playCoaching, setPlayCoaching] = useState(null);
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
  const lastPlayResponse = lastPlay?.response || (() => {
    try {
      return JSON.parse(lastPlay?.body || "null");
    } catch {
      return null;
    }
  })();
  const sequence = lastPlayResponse?.sequence;
  const roomHasPeople = (room?.rosterIds?.length || 0) > 0;
  const userSettingsReady = store.getPref("userSettingsReady") !== false;
  const remoteReady = store.getPref("remoteReady") !== false;
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

  /* @play: deterministic readiness gate, then either a coaching turn that closes
     the biggest gap, or a grounded, pinned, immutable play card. */
  const runPlay = useCallback(async () => {
    if (!decision) return;
    const currentParticipants = store.getParticipants(decision.id);
    const currentDecision = store.getDecision(decision.id);
    const readiness = checkPlayReadiness({ participants: currentParticipants, decision: currentDecision });
    if (!readiness.ready) {
      trackNetwork("play_blocked", { reason: readiness.reason });
      const coaching = buildPlayCoaching(readiness, currentParticipants);
      store.pushMessage(decision.id, { type: "coach", body: coaching.body, questions: coaching.questions, grounded: true });
      setPlayCoaching({ decisionId: decision.id, reason: readiness.reason, missing: readiness.missing, attempts: 0 });
      return;
    }
    setPlayCoaching(null);
    setIsGenerating(true);
    try {
      const edges = store.getEdges(decision.id);
      const ctx = buildContext({ decision: currentDecision, participants: currentParticipants, edges });
      const resp = await generatePlay(playSituation(currentDecision), ctx);
      if (resp.kind === "play") {
        // Freeze the generating inputs into the card so it stays readable after
        // the room changes or a reload. Body is encrypted at rest like other text.
        const snapshot = {
          headline: resp.headline,
          steps: resp.steps,
          sequence: resp.sequence,
          risk: resp.risk,
          reasoning: resp.reasoning,
          people: currentParticipants.map((p) => ({ id: p.id, name: p.isSelf ? "You" : p.name })),
          situation: playSituation(currentDecision),
          generatedAt: new Date().toISOString(),
        };
        store.pushMessage(decision.id, { type: "play", label: `PLAY · ${playStamp()}`, response: snapshot, body: JSON.stringify(snapshot) });
        store.savePlay(decision.id, { situation: snapshot.situation, output: snapshot });
        // Analytics logs the event only, never play content.
        trackNetwork("play_generated", { participants: currentParticipants.length, edges: edges.length });
      } else {
        store.pushMessage(decision.id, { type: "fallback", body: resp.body });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [decision, store]);

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

  // Make the signed-in user a first-class participant once their account has
  // loaded. Idempotent: seeds the self record and migrates existing rooms once.
  useEffect(() => {
    if (!userId || !remoteReady) return;
    const profile = store.getProfile();
    store.ensureSelf({ name: profile.name || userName || "", position: profile.position || "" });
  }, [userId, userName, remoteReady, store]);

  // Hash is the single source for the Tier 2 person page and Tier 3 frameworks
  // page, so they are linkable and the browser back button works.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const apply = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Same-browser restore happens before Firestore/user settings finish loading,
  // so a hard refresh returns to the room, decision, and lens that were visible.
  useEffect(() => {
    const ready = userSettingsReady && remoteReady;
    if (!ready && !browserStartedWithRoom) return;
    if (activeRoomId && !store.getRoom(activeRoomId)) return;
    if (activeDecisionId) {
      const currentDecision = store.getDecision(activeDecisionId);
      if (!currentDecision || currentDecision.status !== "active") return;
    }
    writeBrowserUiState({ activeRoomId, activeDecisionId, activeTab });
  }, [activeRoomId, activeDecisionId, activeTab, browserStartedWithRoom, remoteReady, store, userSettingsReady]);

  // Keep the URL hash carrying the active decision while the lenses own the hash.
  // Selecting a decision already writes it, but an auto-restored or auto-selected
  // decision never went through selectDecision, so without this a refresh lands on
  // the room with no decision. The hash is the most durable restore source (it
  // survives in the URL itself and is read synchronously at init), so a refresh
  // then reliably restores the exact decision through the route path. We read the
  // live hash instead of route state so we never clobber a person/frameworks
  // sub-page that owns the hash.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash && !hash.startsWith("#/decision/")) return;
    if (decision && decision.status === "active") replaceDecisionHash(decision.id);
    else if (!activeDecisionId) clearDecisionHash();
  }, [decision, activeDecisionId]);

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

  // Dismissing guided setup lands the user in the live empty room with the rail
  // and command surface visible, never in a modal. Manual room editing stays
  // reachable through the existing room-settings entry point (rail, empty state).
  const dismissOnboarding = useCallback(() => {
    store.setPref("onboardingPrompted", true);
    store.setPref("railCollapsed", false);
    trackNetwork("onboarding_dismissed", { mode: onboarding.mode });
    setOnboarding((current) => ({ ...current, active: false, phase: "questions", thinking: false, busy: false, error: "" }));
    const emptyRoom = store.getRooms().find((r) => !hasUsableRoom([r], (roomId) => store.getDecisions(roomId)));
    const roomId = emptyRoom?.id || store.createRoom();
    setActiveRoomId(roomId);
    setActiveDecisionId(null);
    setActiveTab("people");
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
      setPlayCoaching(null);
      store.setUserSetting("lastRoomId", id);
      const first = store.getDecisions(id).find((d) => d.status === "active");
      if (first) {
        store.ensureChat(first.id);
        setActiveDecisionId(first.id);
        store.setUserSetting("lastDecisionId", first.id);
        replaceDecisionHash(first.id);
      } else {
        setActiveDecisionId(null);
        store.setUserSetting("lastDecisionId", null);
      }
      setShowPath(false);
      setActiveTab("people");
      writeBrowserUiState({ activeRoomId: id, activeDecisionId: first?.id || null, activeTab: "people" });
    },
    [store]
  );
  const selectDecision = useCallback(
    (id) => {
      const selected = store.getDecision(id);
      const selectedRoomId = selected?.roomId || activeRoomId;
      store.ensureChat(id);
      setPlayCoaching(null);
      if (selected?.roomId && selected.roomId !== activeRoomId) setActiveRoomId(selected.roomId);
      setActiveDecisionId(id);
      store.setUserSetting("lastRoomId", selectedRoomId);
      store.setUserSetting("lastDecisionId", id);
      setShowPath(false);
      setActiveTab("people");
      replaceDecisionHash(id);
      writeBrowserUiState({ activeRoomId: selectedRoomId, activeDecisionId: id, activeTab: "people" });
    },
    [store, activeRoomId]
  );
  const selectTab = useCallback((id) => {
    if (!TAB_IDS.has(id)) return;
    setActiveTab(id);
    setNodeSummaryId(null);
  }, []);

  // Restore the last browser-visible room and decision once data is available.
  // Same-browser state wins; synced settings are the fallback for cold devices.
  const restoredSelection = useRef(false);
  const storedRoomId = store.getPref("lastRoomId");
  const storedDecisionId = store.getPref("lastDecisionId");
  useEffect(() => {
    if (restoredSelection.current || !rooms.length) return;
    const routeDecision = routeStartedWithDecision ? store.getDecision(initialRoute.decisionId) : null;
    if (routeStartedWithDecision && !routeDecision && !remoteReady) return;
    const browserRoomId = browserStartedWithRoom ? initialBrowserUi.activeRoomId : null;
    const browserRoom = browserRoomId ? store.getRoom(browserRoomId) : null;
    if (browserStartedWithRoom && !browserRoom && !remoteReady) return;
    const canUseSyncedSettings = userSettingsReady && remoteReady;
    const syncedRoom = canUseSyncedSettings && storedRoomId ? store.getRoom(storedRoomId) : null;
    const restoredRoomId =
      routeDecision && routeDecision.status === "active"
        ? routeDecision.roomId
        : browserRoom
          ? browserRoomId
          : syncedRoom
            ? storedRoomId
            : null;
    const browserDecisionId = browserRoom && browserStartedWithDecision ? initialBrowserUi.activeDecisionId : undefined;
    if (browserDecisionId && !store.getDecision(browserDecisionId) && !remoteReady) return;
    if (!restoredRoomId) {
      if (!canUseSyncedSettings) return;
      restoredSelection.current = true;
      return;
    }
    restoredSelection.current = true;
    setActiveRoomId(restoredRoomId);
    store.setUserSetting("lastRoomId", restoredRoomId);

    const restoredDecisionId = routeDecision && routeDecision.status === "active" ? routeDecision.id : browserDecisionId !== undefined ? browserDecisionId : storedDecisionId;
    if (restoredDecisionId === null) {
      setActiveDecisionId(null);
      store.setUserSetting("lastDecisionId", null);
      return;
    }
    const stored = restoredDecisionId ? store.getDecision(restoredDecisionId) : null;
    if (stored && stored.roomId === restoredRoomId && stored.status === "active") {
      store.ensureChat(stored.id);
      setActiveDecisionId(stored.id);
      store.setUserSetting("lastDecisionId", stored.id);
    } else {
      const first = store.getDecisions(restoredRoomId).find((d) => d.status === "active") || null;
      setActiveDecisionId(first?.id || null);
      if (first) store.ensureChat(first.id);
      store.setUserSetting("lastDecisionId", first?.id || null);
    }
  }, [
    browserStartedWithDecision,
    browserStartedWithRoom,
    initialBrowserUi.activeDecisionId,
    initialBrowserUi.activeRoomId,
    initialRoute.decisionId,
    remoteReady,
    routeStartedWithDecision,
    rooms,
    storedDecisionId,
    storedRoomId,
    store,
    userSettingsReady,
  ]);

  useEffect(() => {
    if (!restoredSelection.current && (!userSettingsReady || !remoteReady)) return;
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
      store.setUserSetting("lastRoomId", firstRoom.id);
      store.setUserSetting("lastDecisionId", firstDecision?.id || null);
      setShowPath(false);
      setActiveTab("people");
      return;
    }
    const currentDecision = activeDecisionId ? store.getDecision(activeDecisionId) : null;
    if (activeDecisionId && (!currentDecision || currentDecision.status !== "active")) {
      const firstDecision = store.getDecisions(activeRoomId).find((d) => d.status === "active") || null;
      setActiveDecisionId(firstDecision?.id || null);
      if (firstDecision) store.ensureChat(firstDecision.id);
      store.setUserSetting("lastDecisionId", firstDecision?.id || null);
      setShowPath(false);
      setActiveTab("people");
    }
  }, [rooms, activeRoomId, activeDecisionId, remoteReady, store, userSettingsReady]);

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
      let influenced = 0;
      const clarificationQuestions = [];
      const confirmQuestions = [];
      // Mappings that actually committed, surfaced so the caller can capture them
      // as per-user learning examples. Each is { axis, outcome, confidence }.
      const learned = [];
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
          if (item.position !== "unknown") learned.push({ axis: "stance", outcome: item.position, confidence: item.confidence });
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
          const powerBand = gridBand(item.power);
          const interestBand = gridBand(item.interest);
          if (powerBand) learned.push({ axis: "power", outcome: powerBand, confidence: item.confidence });
          if (interestBand) learned.push({ axis: "interest", outcome: interestBand, confidence: item.confidence });
          if (item.confidence === "low" && !confirmQuestions.length) {
            confirmQuestions.push(softGridConfirm(store.getPerson(id) || item, item.power, item.interest));
          }
        }
        // Influence is owned by @network, @map, and @create. Never set it for the
        // self user, and never overwrite a level the user set by hand on the ring.
        // @network gates on confidence: an uncertain read asks instead of writing.
        if (caps.influence && item.influenceLevel) {
          const target = store.getPerson(id);
          const current = { isSelf: target?.isSelf, overridden: store.getInfluence(targetDecisionId, id).overridden };
          const verdict = influenceDecision(item, current, sourceCommand);
          if (verdict === "write") {
            store.setInfluence(targetDecisionId, id, item.influenceLevel, false);
            influenced += 1;
            learned.push({ axis: "influence", outcome: item.influenceLevel, confidence: item.confidence });
          } else if (verdict === "ask" && clarificationQuestions.length < 2) {
            clarificationQuestions.push(influenceClarification(store.getPerson(id) || item));
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
      if (caps.influence && influenced) {
        const pts = store.getParticipants(targetDecisionId);
        const inf = store.getDecision(targetDecisionId)?.influence || {};
        const leveled = (id) => ["high", "medium", "low"].includes(inf[id]?.level);
        const nonSelf = pts.filter((p) => !p.isSelf);
        trackNetwork("influence_inferred", {
          roomId: targetRoomId,
          participantCount: pts.length,
          inferredCount: nonSelf.filter((p) => leveled(p.id)).length,
          nullCount: nonSelf.filter((p) => !leveled(p.id)).length,
        });
      }
      if (edges || (caps.influence && influenced)) setActiveTab("network");
      else if (placements || positions) setActiveTab("grid");

      const parts = [
        created ? `${created} ${created === 1 ? "person" : "people"}` : "",
        notes ? `${notes} ${notes === 1 ? "note" : "notes"}` : "",
        profiles ? `${profiles} ${profiles === 1 ? "read" : "reads"}` : "",
        placements || positions ? "grid" : "",
        edges ? "network" : "",
        influenced ? `${influenced} influence ${influenced === 1 ? "level" : "levels"}` : "",
      ].filter(Boolean);
      let body = update.summary || (parts.length ? `Updated ${parts.join(", ")}.` : "No clear update found.");
      if (sourceCommand === "network") {
        // @network owns edges and influence. Name whichever it changed.
        const bits = [];
        if (edges) bits.push(`${edges} ${edges === 1 ? "relationship" : "relationships"}`);
        if (influenced) bits.push(`${influenced} influence ${influenced === 1 ? "level" : "levels"}`);
        if (bits.length) body = `Updated ${bits.join(" and ")}.`;
        else if (clarificationQuestions.length) body = "Before I move anyone on the ring, one quick check.";
      } else if (clarificationQuestions.length && !placements && !positions) {
        body = "I need a quick check before moving the grid.";
      } else if (clarificationQuestions.length) {
        body = `Updated ${parts.join(", ") || "the room"}, but held one extreme grid value for confirmation.`;
      }
      const concreteChanges = created + notes + profiles + placements + positions + edges + influenced;
      const modelQuestions = concreteChanges || clarificationQuestions.length ? [] : update.openQuestions || [];

      return {
        label: commandResultLabel(sourceCommand),
        body,
        questions: [...clarificationQuestions, ...confirmQuestions, ...modelQuestions].slice(0, 2),
        learned,
      };
    },
    [decision, ensurePersonForUpdate, findPersonRef, room, store]
  );

  // Sequenced dispatch for a controller plan: mapper first, then (for "both")
  // the strategist on the UPDATED room. A state machine, never an LLM-to-LLM
  // loop: each expert runs at most once, and the only relay back is the mapper's
  // single clarification, which the controller hands to the user.
  const dispatchControllerPlan = useCallback(
    async (plan, text, priorMessages) => {
      if (!decision || !plan) return;
      setIsGenerating(true);
      try {
        if (plan.intent === "map" || plan.intent === "both") {
          // @energy is the user-facing name; "grid" is the internal command. The
          // single source for this translation lives in the contract so it stays
          // testable and never reaches the server as "energy".
          let command = serverCommandForControllerCommand(plan.command);
          let focusPerson = null;
          if (command === "note") {
            // A note needs a resolvable focus person. Without one, fall back to
            // the broad @map intake (the safe minimum) instead of guessing.
            const split = splitLeadingPersonRef(text, [participants, Object.values(store.getAllPeople())]);
            if (split.person) focusPerson = split.person;
            else command = "map";
          }
          const resp = await interpretRoomCommand({
            command,
            text,
            instruction: plan.cleanedIntent || null,
            room,
            decision,
            participants,
            edges: store.getEdges(decision.id),
            focusPerson,
            messages: priorMessages,
          });
          if (resp.kind !== "update") {
            store.pushMessage(decision.id, { type: "fallback", body: resp.body });
            return;
          }
          const message = applyRoomUpdate(resp.update, command) || { label: "Room updated", body: "Updated the room." };
          // One voice, one pass: the controller relays at most one mapper
          // clarification, never a question chain.
          message.questions = (message.questions || []).slice(0, 1);
          trackEvent("room_map_update", { command });
          captureLearnedMappings({ message, noteText: text, participants: store.getParticipants(decision.id), priorMessages });
          store.pushMessage(decision.id, { type: "updated", ...message });
        }
        if (plan.intent === "advise" || plan.intent === "both") {
          // Advice reads the room AFTER the mapper write: fresh decision,
          // participants, and edges from the store.
          const freshDecision = store.getDecision(decision.id) || decision;
          const freshParticipants = store.getParticipants(decision.id);
          const resp = await askStrategist({
            question: text,
            room,
            decision: freshDecision,
            participants: freshParticipants,
            edges: store.getEdges(decision.id),
            messages: store.getChat(decision.id),
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
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [applyRoomUpdate, decision, participants, room, store]
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
    async (eOrText) => {
      // Accept a form event (reads the draft) or a string (a suggestion pill tap
      // re-running the text as a prefixed command through this same path).
      const fromPill = typeof eOrText === "string";
      if (!fromPill) eOrText.preventDefault();
      const q = (fromPill ? eOrText : draft).trim();
      if (!q || !decision || isGenerating) {
        if (!fromPill) setDraft("");
        return;
      }
      if (!fromPill) setDraft("");
      setShowPath(false);
      // Capture prior turns before the new user message lands, for anaphora.
      const priorMessages = store.getChat(decision.id);
      store.pushMessage(decision.id, { type: "user", body: q });

      // @play gap-closing: a free-text reply to a coaching question is parsed back
      // through the same @map command path, then readiness is re-checked.
      if (playCoaching && playCoaching.decisionId === decision.id && !q.startsWith("@")) {
        setDraft("");
        setIsGenerating(true);
        try {
          const resp = await interpretRoomCommand({
            command: "map",
            text: q,
            room,
            decision,
            participants,
            edges: store.getEdges(decision.id),
            messages: priorMessages,
          });
          if (resp.kind === "update") {
            const message = applyRoomUpdate(resp.update, "map") || { label: "Room updated", body: "Updated the room." };
            captureLearnedMappings({ message, noteText: q, participants: store.getParticipants(decision.id), priorMessages });
            store.pushMessage(decision.id, { type: "updated", ...message });
            let nextParticipants = store.getParticipants(decision.id);
            let recheck = checkPlayReadiness({ participants: nextParticipants, decision: store.getDecision(decision.id) });
            let step = nextCoachingStep({ readiness: recheck, prev: playCoaching });
            // Graceful exit: if the user answered twice without a clear stance,
            // read the still-unknown people as neutral so the loop terminates.
            if (step.kind === "neutralize") {
              step.ids.forEach((id) => store.setPosition(decision.id, id, "neutral"));
              const names = step.ids.map((id) => store.getPerson(id)).filter(Boolean).map((p) => (p.isSelf ? "you" : p.name.split(/\s+/)[0]));
              store.pushMessage(decision.id, {
                type: "updated",
                label: "Reading as neutral",
                body: `I could not pin a clear stance for ${names.join(" and ") || "them"}, so I will read them as neutral for the play. Adjust on the Energy lens if that is off.`,
              });
              nextParticipants = store.getParticipants(decision.id);
              recheck = checkPlayReadiness({ participants: nextParticipants, decision: store.getDecision(decision.id) });
              step = nextCoachingStep({ readiness: recheck, prev: null });
            }
            if (recheck.ready || step.kind === "ready") {
              setPlayCoaching(null);
              store.pushMessage(decision.id, { type: "updated", label: "Ready for a play", body: "That closes the gap. Send @play and I will lay out the move." });
            } else if (step.kind === "manual") {
              setPlayCoaching(null);
              const tip =
                recheck.reason === "missing_grid"
                  ? "Place the remaining people on the Energy lens by dragging their chip, then send @play."
                  : "Add who else is in the room with @add Name, role, then send @play.";
              store.pushMessage(decision.id, { type: "updated", label: "One more step", body: tip });
            } else {
              const coaching = buildPlayCoaching(recheck, nextParticipants);
              store.pushMessage(decision.id, { type: "coach", body: coaching.body, questions: coaching.questions, grounded: true });
              setPlayCoaching({ decisionId: decision.id, reason: recheck.reason, missing: recheck.missing, attempts: step.attempts || 0 });
            }
          } else {
            store.pushMessage(decision.id, { type: "fallback", body: resp.body });
          }
        } finally {
          setIsGenerating(false);
        }
        return;
      }

      if (/^@play\b/i.test(q)) {
        setDraft("");
        await runPlay();
        return;
      }

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
              captureLearnedMappings({ message, noteText: body, participants: store.getParticipants(decision.id), priorMessages });
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
      // @create is retired as a user command; @add covers adding people and @map
      // covers prose intake. The internal "create" path still backs onboarding.
      const mapCommand = q.match(/^@(map|energy|grid|network|net)\s+([\s\S]+)$/i);
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
            captureLearnedMappings({ message, noteText: text, participants: store.getParticipants(decision.id), priorMessages });
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

      // Plain text (no command prefix). When live reasoning is off, only commands
      // run. Otherwise the controller reads the intent and, in production
      // (routing flag off), surfaces a tappable suggestion pill. Nothing mutates
      // here: state changes only when the user taps the pill, which dispatches
      // the controller plan.
      if (!OPEN_CHAT) {
        store.pushMessage(decision.id, {
          type: "fallback",
          body: "Use @note, @energy, @network, @map, @ask, @read, or @add to work the room.",
        });
        return;
      }
      const screen = screenOpenMessage(q);
      if (screen.blocked) {
        trackEvent("open_chat_blocked", { reason: screen.reason });
        store.pushMessage(decision.id, { type: "fallback", body: screen.reply });
        return;
      }
      setIsGenerating(true);
      let plan = null;
      try {
        const { classification } = await classifyIntent(q);
        plan = planClassificationAction(classification, ENABLE_PLAIN_TEXT_ROUTING);
        // Privacy-safe analytics: route and resolution enums only, never the raw
        // text and never the cleaned digest.
        trackNetwork("plain_text_classified", {
          intent: plan.intent,
          command: plan.command || null,
          confidence: plan.confidence,
          routed_to: controllerRoutedTo(plan),
          resolution: plan.action,
          acted: plan.action === "route" || plan.action === "confirm",
        });
      } finally {
        setIsGenerating(false);
      }
      if (!plan) return;
      if (plan.action === "clarify") {
        // The controller asks its one clarifying question and never guesses.
        // The reply comes back through this same handler as fresh plain text.
        if (plan.question) store.pushMessage(decision.id, { type: "fallback", body: plan.question });
        else store.pushMessage(decision.id, { type: "suggest-list", body: "I'm not sure how to use this. Did you mean to:" });
      } else if (plan.action === "pill") {
        store.pushMessage(decision.id, {
          type: "suggest",
          intent: plan.intent,
          command: plan.command,
          cleanedIntent: plan.cleanedIntent,
          confidence: plan.confidence,
          text: q,
          body: `Looks like ${describeControllerPlan(plan)}. Tap to run it.`,
        });
      } else if (plan.action === "route" || plan.action === "confirm") {
        // Routing flag on: dispatch the plan, labeling it so the user sees the call.
        const label =
          plan.action === "route"
            ? `↳ treated as ${describeControllerPlan(plan)}`
            : `I read this as ${describeControllerPlan(plan)}, running it. Tell me if that was wrong.`;
        store.pushMessage(decision.id, { type: "fallback", body: label });
        await dispatchControllerPlan(plan, q, priorMessages);
      }
    },
    [applyRoomUpdate, decision, dispatchControllerPlan, draft, findPersonRef, generateRead, isGenerating, openPersonPage, participants, playCoaching, room, runPlay, store]
  );
  // A suggestion pill tap dispatches the stored controller plan: same mapper and
  // strategist path as silent routing, but only on an explicit user tap.
  const onRunSuggestion = useCallback(
    (message) => {
      if (!message?.text || !message?.intent) return;
      const plan = { intent: message.intent, command: message.command || null, cleanedIntent: message.cleanedIntent || "" };
      trackNetwork("plain_text_classified", {
        intent: plan.intent,
        command: plan.command,
        confidence: message.confidence || "medium",
        routed_to: controllerRoutedTo(plan),
        resolution: "pill_tapped",
        acted: true,
      });
      dispatchControllerPlan(plan, message.text, store.getChat(decision?.id));
    },
    [decision, dispatchControllerPlan, store]
  );
  const showOnNetwork = useCallback(() => {
    setShowPath(true);
    selectTab("network");
  }, [selectTab]);

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
    onRunSuggestion,
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
                  onDismiss={dismissOnboarding}
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
                            onClick={() => selectTab(t.id)}
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
                            onAddPerson={() => setModal({ type: "addParticipant" })}
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
                            roomId={activeRoomId}
                            selectedId={nodeSummaryId}
                            onOpenProfile={openNodeSummary}
                            onSetInfluence={(personId, level, angle) => store.setInfluence(decision.id, personId, level, true, angle)}
                            onPersistAngle={(personId, angle) => store.setInfluenceAngle(decision.id, personId, angle)}
                            onCreateEdge={(from, to, type) => store.addEdge(decision.id, { from, to, type })}
                            onRemoveEdge={(index) => store.removeEdge(decision.id, index)}
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
      {modal?.type === "addParticipant" && decision && room && (
        <AddParticipant
          rosterAvailable={(room.rosterIds || [])
            .map((id) => store.getPerson(id))
            .filter(Boolean)
            .filter((p) => ![...decision.participantIds, ...decision.externalIds].includes(p.id))}
          onAddExisting={(id) => {
            store.addParticipant(decision.id, id);
            trackNetwork("decision_participant_add", { source: "roster" });
          }}
          onAddExternal={(name, role) => {
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
