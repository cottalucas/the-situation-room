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
import { EXAMPLE_PROMPTS } from "../lib/reasoning.js";
import {
  ONBOARDING_INTRO,
  ONBOARDING_INTRO_RETURNING,
  ONBOARDING_QUESTIONS,
  buildClosingSummary,
  buildOnboardingCommandPlan,
  deriveDecisionSeed,
  forceCreatePeople,
  hasUsableRoom,
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
// Plain-text routing. ON by default: bare text in a room runs through the Mapper
// (the comprehensive @map extraction in one pass) and the reply names the specific
// changes across lenses. Set VITE_ENABLE_PLAIN_TEXT_ROUTING=false to fall back to
// the older write-nothing suggestion pill (kept as a rollback). The Strategist is
// never invoked by bare text.
const ENABLE_PLAIN_TEXT_ROUTING = import.meta.env.VITE_ENABLE_PLAIN_TEXT_ROUTING !== "false";

// Novus (Pendo) agent analytics. Guarded and fire-and-forget, so a missing Pendo
// agent never throws and never blocks a command. Content is intentionally
// omitted: client-side redaction over the current participants cannot cover
// colleague names that are not yet in the roster (for example a bare-text message
// that names a new person before mapping creates them), and sending unredacted
// colleague text to a third party is a hard no. Novus still receives the
// interaction structure (agent, conversation, message, suggestedPrompt).
const NOVUS_AGENT_ID = "WkiKqyltqL9FcGinfGf0CpxLkls";
function trackAgentEvent(kind, extra) {
  try {
    if (typeof window !== "undefined" && window.pendo && typeof window.pendo.trackAgent === "function") {
      window.pendo.trackAgent(kind, {
        agentId: NOVUS_AGENT_ID,
        messageId: crypto.randomUUID(),
        ...extra,
      });
    }
  } catch {
    // Novus is best-effort; never block the UI on analytics.
  }
}

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
// The selected room and decision live in the URL hash, never in localStorage, so
// refresh and shared links are the single source of truth. Only the lens
// (People/Energy/Network) is a view preference we keep across a refresh.
const STORED_LENS_KEY = "situation-room-lens-v1";

// One-time cleanup: older builds persisted room/decision selection in localStorage.
// The URL owns that now, so drop the stale key rather than leave a dead selection.
if (typeof window !== "undefined") {
  try {
    window.localStorage?.removeItem("situation-room-ui-state-v1");
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function readStoredLens() {
  if (typeof window === "undefined") return null;
  try {
    const lens = window.localStorage?.getItem(STORED_LENS_KEY);
    return TAB_IDS.has(lens) ? lens : null;
  } catch {
    return null;
  }
}

function writeStoredLens(lens) {
  if (typeof window === "undefined" || !TAB_IDS.has(lens)) return;
  try {
    window.localStorage?.setItem(STORED_LENS_KEY, lens);
  } catch {
    // Lens persistence is a convenience; the URL still restores room and decision.
  }
}

/* Hash routes. The lenses view encodes the selection (#/room/:roomId and
   #/room/:roomId/decision/:decisionId) so a refresh or a shared link restores
   the exact room and decision. Person, notes, and frameworks are linkable
   sub-pages that hold the hash while open. */
function parseHash(hash) {
  if (hash === "#/frameworks") return { view: "frameworks", roomId: null, decisionId: null, personId: null };
  if (hash.startsWith("#/person/")) {
    const rest = hash.slice("#/person/".length);
    if (rest.endsWith("/notes")) {
      return { view: "personNotes", roomId: null, decisionId: null, personId: rest.slice(0, -"/notes".length) };
    }
    return { view: "person", roomId: null, decisionId: null, personId: rest };
  }
  if (hash.startsWith("#/room/")) {
    const rest = hash.slice("#/room/".length);
    const sep = rest.indexOf("/decision/");
    if (sep === -1) {
      return { view: "lenses", roomId: decodeURIComponent(rest) || null, decisionId: null, personId: null };
    }
    return {
      view: "lenses",
      roomId: decodeURIComponent(rest.slice(0, sep)) || null,
      decisionId: decodeURIComponent(rest.slice(sep + "/decision/".length)) || null,
      personId: null,
    };
  }
  // Legacy decision-only links keep working; the room resolves from the decision.
  if (hash.startsWith("#/decision/")) {
    return { view: "lenses", roomId: null, decisionId: decodeURIComponent(hash.slice("#/decision/".length)) || null, personId: null };
  }
  return { view: "lenses", roomId: null, decisionId: null, personId: null };
}

function selectionHash(roomId, decisionId) {
  if (!roomId) return null;
  const base = `#/room/${encodeURIComponent(roomId)}`;
  return decisionId ? `${base}/decision/${encodeURIComponent(decisionId)}` : base;
}

// Write the selection into the URL. replace (default) swaps the current entry so
// switching decisions inside a room does not stack history; push adds an entry so
// the Back button returns to the previous room.
function writeSelectionHash(roomId, decisionId, { push = false } = {}) {
  if (typeof window === "undefined") return;
  const target = selectionHash(roomId, decisionId);
  if (!target) {
    clearSelectionHash();
    return;
  }
  if (window.location.hash === target) return;
  const url = `${window.location.pathname}${window.location.search}${target}`;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

// Drop a stale selection hash so a refresh does not try to restore a room or
// decision that is gone. Leaves person/frameworks sub-page hashes alone.
function clearSelectionHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  if (!window.location.hash.startsWith("#/room/") && !window.location.hash.startsWith("#/decision/")) return;
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
  const [initialRoute] = useState(() =>
    typeof window === "undefined" ? { view: "lenses", roomId: null, decisionId: null, personId: null } : parseHash(window.location.hash)
  );
  const [profileOpen, setProfileOpen] = useState(false);

  // The URL is the source of truth for the selection. A bare app URL (no room)
  // restores the last room from synced settings in the restore effect below.
  const [activeRoomId, setActiveRoomId] = useState(initialRoute.roomId);
  const [activeDecisionId, setActiveDecisionId] = useState(initialRoute.decisionId);
  const [activeTab, setActiveTab] = useState(() => readStoredLens() || "people");
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
          trackAgentEvent("agent_response", { conversationId: id });
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
      trackEvent("play_blocked", { reason: readiness.reason });
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
        trackEvent("play_generated", { participants: currentParticipants.length, edges: edges.length });
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

  // Current selection, read inside the hashchange handler without re-binding it.
  const selectionRef = useRef({ roomId: activeRoomId, decisionId: activeDecisionId });
  selectionRef.current = { roomId: activeRoomId, decisionId: activeDecisionId };

  // Hash is the single source for the room/decision selection and for the Tier 2
  // person page and Tier 3 frameworks page, so they are linkable and the browser
  // back button works.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const apply = () => {
      const parsed = parseHash(window.location.hash);
      setRoute(parsed);
      // Back, Forward, or a manual hash edit on the lenses view moves the
      // selection to match the URL. Sub-pages own the hash and leave it be.
      if (parsed.view === "lenses") {
        const cur = selectionRef.current;
        if (parsed.roomId && parsed.roomId !== cur.roomId) setActiveRoomId(parsed.roomId);
        const nextDecision = parsed.decisionId ?? null;
        if (nextDecision !== cur.decisionId) {
          setActiveDecisionId(nextDecision);
          if (nextDecision) store.ensureChat(nextDecision);
        }
      }
      try {
        // Hash routing means Pendo never sees these page changes otherwise;
        // pageLoad() re-evaluates its URL rules against the new hash.
        if (typeof pendo !== "undefined" && typeof pendo.pageLoad === "function") {
          pendo.pageLoad();
        }
      } catch {
        // fire-and-forget
      }
    };
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [store]);

  // The lens is the only selection sub-state kept in localStorage; room and
  // decision live in the URL.
  useEffect(() => {
    writeStoredLens(activeTab);
  }, [activeTab]);

  // Mirror the active selection into the URL on the lenses view so every path
  // that changes it (restore, onboarding, a stale-decision swap) keeps refresh
  // and shared links correct. Direct user actions set push/replace themselves;
  // this safety net always replaces. Sub-pages own the hash, so leave them be.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (route.view !== "lenses") return;
    if (activeRoomId) writeSelectionHash(activeRoomId, activeDecisionId);
    else clearSelectionHash();
  }, [activeRoomId, activeDecisionId, route.view]);

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
    else writeSelectionHash(activeRoomId, activeDecisionId);
  }, [activeRoomId, activeDecisionId]);

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
    trackEvent("onboarding_skipped", { mode: onboarding.mode });
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
      } else {
        setActiveDecisionId(null);
        store.setUserSetting("lastDecisionId", null);
      }
      setShowPath(false);
      setActiveTab("people");
      // Switching rooms pushes a history entry so Back returns to the prior room.
      writeSelectionHash(id, first?.id || null, { push: true });
    },
    [store]
  );
  const selectDecision = useCallback(
    (id) => {
      const selected = store.getDecision(id);
      const selectedRoomId = selected?.roomId || activeRoomId;
      const crossesRoom = Boolean(selected?.roomId && selected.roomId !== activeRoomId);
      store.ensureChat(id);
      setPlayCoaching(null);
      if (crossesRoom) setActiveRoomId(selected.roomId);
      setActiveDecisionId(id);
      store.setUserSetting("lastRoomId", selectedRoomId);
      store.setUserSetting("lastDecisionId", id);
      setShowPath(false);
      setActiveTab("people");
      // Switching decisions inside a room replaces, so Back does not ping-pong;
      // a decision in another room is a room switch and pushes.
      writeSelectionHash(selectedRoomId, id, { push: crossesRoom });
    },
    [store, activeRoomId]
  );
  const selectTab = useCallback((id) => {
    if (!TAB_IDS.has(id)) return;
    setActiveTab(id);
    setNodeSummaryId(null);
  }, []);

  // Restore the selection once data is available. The URL is the source of
  // truth; a room or decision is validated against the store (not cached client
  // state), waiting for Firestore before judging an id stale. A bare URL with no
  // selection restores the last room from synced settings. Anything unresolved
  // settles on the first room through the guard effect below, never an error.
  const restoredSelection = useRef(false);
  const storedRoomId = store.getPref("lastRoomId");
  const storedDecisionId = store.getPref("lastDecisionId");
  useEffect(() => {
    if (restoredSelection.current || !rooms.length) return;

    const routeRoomId = initialRoute.roomId;
    const routeDecisionId = initialRoute.decisionId;
    const routeDecision = routeDecisionId ? store.getDecision(routeDecisionId) : null;
    if (routeDecisionId && !routeDecision && !remoteReady) return;
    const routeRoom = routeRoomId ? store.getRoom(routeRoomId) : null;
    if (routeRoomId && !routeRoom && !remoteReady) return;

    let restoredRoomId = null;
    let restoredDecisionId; // undefined leaves the guard effect to pick the first active
    let fromUrl = false;
    if (routeDecision && routeDecision.status === "active") {
      restoredRoomId = routeDecision.roomId;
      restoredDecisionId = routeDecision.id;
      fromUrl = true;
    } else if (routeRoom) {
      restoredRoomId = routeRoomId;
      fromUrl = true;
    }

    const canUseSyncedSettings = userSettingsReady && remoteReady;
    if (!restoredRoomId) {
      // No usable selection in the URL (bare URL, or a stale/inaccessible id).
      // Restore the last room from synced settings, which are server state.
      const syncedRoom = canUseSyncedSettings && storedRoomId ? store.getRoom(storedRoomId) : null;
      if (syncedRoom) {
        restoredRoomId = storedRoomId;
        restoredDecisionId = storedDecisionId;
      }
    }

    if (!restoredRoomId) {
      if (!canUseSyncedSettings) return;
      restoredSelection.current = true; // the guard effect lands on the first room
      return;
    }

    restoredSelection.current = true;
    setActiveRoomId(restoredRoomId);
    store.setUserSetting("lastRoomId", restoredRoomId);

    if (restoredDecisionId === null) {
      setActiveDecisionId(null);
      store.setUserSetting("lastDecisionId", null);
    } else {
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
    }

    // Fire and forget: confirm in production that refreshes land on a real
    // selection from the URL, not the synced-settings or first-room fallback.
    if (fromUrl) trackEvent("room_selection_restored", { hadDecision: Boolean(routeDecisionId) });
  }, [
    initialRoute.decisionId,
    initialRoute.roomId,
    remoteReady,
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

  // Voice the specific changes a bare-text map applied, across lenses, so the
  // reply is concrete ("Added Priya, VP Eng, skeptical, high power; flagged Priya
  // defers to the CFO") rather than a generic ack. Deterministic, read from the
  // applied update, no extra model call. Copy rules: no em dash, no hyphen as a
  // connector.
  const describeAppliedUpdate = useCallback(
    (update) => {
      const nameOf = (ref) => (ref ? store.getPerson(ref)?.name || ref : "someone");
      const STANCE = { for: "supportive", against: "skeptical", neutral: "neutral" };
      const band = (v) => (v == null ? null : v >= 70 ? "high" : v <= 35 ? "low" : "moderate");
      const peopleBits = (update.people || []).map((item) => {
        const name = item.id ? nameOf(item.id) : item.name || "someone";
        const facets = [];
        if (item.role) facets.push(item.role);
        if (item.position && STANCE[item.position]) facets.push(STANCE[item.position]);
        const pb = band(item.power);
        if (pb) facets.push(`${pb} power`);
        if (item.influenceLevel && item.influenceLevel !== "null") facets.push(`${item.influenceLevel} influence`);
        if (!facets.length && item.note) facets.push("noted");
        const verb = item.create ? "Added" : "Updated";
        return facets.length ? `${verb} ${name}, ${facets.join(", ")}` : `${verb} ${name}`;
      });
      const edgeBits = (update.edges || []).map((e) => {
        const a = nameOf(e.from);
        const b = nameOf(e.to);
        if (e.type === "ally") return `flagged ${a} and ${b} aligned`;
        if (e.type === "conflict") return `flagged friction between ${a} and ${b}`;
        return `flagged ${a} defers to ${b}`;
      });
      const all = [...peopleBits, ...edgeBits];
      return { count: all.length, body: all.length ? `${all.join("; ")}.` : "" };
    },
    [store]
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
      // Redirect to the new room's URL with its seeded decision, as a real route
      // change so a refresh holds the position.
      writeSelectionHash(roomId, decisionId, { push: true });

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

      // Question phase. Q1 to Q3 are required; only the last question is
      // skippable. Answers are stored intact and never echoed back as a
      // restatement.
      const question = ONBOARDING_QUESTIONS[onboarding.step];
      const raw = onboarding.draft.trim();
      const skipped = !raw && question.skippable;
      if (!raw && !skipped) return;
      const answer = skipped ? "" : raw;
      const answers = { ...onboarding.answers, [question.id]: answer };
      const isLast = onboarding.step >= ONBOARDING_QUESTIONS.length - 1;

      // Last answer in: build the room from all four answers in one pass.
      if (isLast) {
        setOnboarding((current) => ({
          ...current,
          answers,
          draft: "",
          busy: true,
          error: "",
          messages: [...current.messages, { role: "user", body: skipped ? "Skip" : answer }],
        }));
        try {
          const summary = await completeOnboarding(answers);
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

      // Advance to the next question. No reflection, no echo.
      const nextStep = onboarding.step + 1;
      setOnboarding((current) => ({
        ...current,
        answers,
        draft: "",
        step: nextStep,
        error: "",
        messages: [
          ...current.messages,
          { role: "user", body: answer },
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
      // Novus: every user submission is a prompt to the agent. Fires before the
      // @play gap-closing block below; both run.
      trackAgentEvent("prompt", { conversationId: decision.id, suggestedPrompt: EXAMPLE_PROMPTS.includes(q) });

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
              trackAgentEvent("agent_response", { conversationId: decision.id });
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
            trackAgentEvent("agent_response", { conversationId: decision.id });
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
            trackAgentEvent("agent_response", { conversationId: decision.id });
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
      // run. With routing on (the default), bare text populates the room through
      // the comprehensive Mapper in one pass; with it off, the controller surfaces
      // a tappable suggestion pill instead (rollback).
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

      if (ENABLE_PLAIN_TEXT_ROUTING) {
        // One @map pass: people, notes, stance, grid, edges, and influence. No
        // controller pill, no Strategist. The reply names the specific changes.
        trackEvent("open_chat");
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
          if (resp.kind !== "update") {
            store.pushMessage(decision.id, { type: "fallback", body: resp.body });
            return;
          }
          const message = applyRoomUpdate(resp.update, "map") || { label: "Room updated", body: "" };
          const specifics = describeAppliedUpdate(resp.update);
          trackAgentEvent("agent_response", { conversationId: decision.id });
          if (specifics.count) {
            trackEvent("room_map_update", { command: "map" });
            captureLearnedMappings({ message, noteText: q, participants: store.getParticipants(decision.id), priorMessages });
            store.pushMessage(decision.id, {
              type: "updated",
              ...message,
              body: specifics.body,
              questions: (message.questions || []).slice(0, 1),
            });
          } else {
            // Nothing actionable extracted: a brief ack and one nudge, never silence.
            store.pushMessage(decision.id, {
              type: "fallback",
              body: "Got that. Nothing to map there yet. Try @grid for power and interest, @network for who moves whom, or @play when you are ready.",
            });
          }
        } finally {
          setIsGenerating(false);
        }
        return;
      }

      // Rollback path (VITE_ENABLE_PLAIN_TEXT_ROUTING=false): the controller reads
      // intent and surfaces a tappable suggestion pill; nothing mutates until tap.
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
    [applyRoomUpdate, decision, describeAppliedUpdate, dispatchControllerPlan, draft, findPersonRef, generateRead, isGenerating, openPersonPage, participants, playCoaching, room, runPlay, store]
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
                            className={`tab tab-${t.id} ${activeTab === t.id ? "tab-active" : ""}`}
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
                            onPrefill={(cmd) => {
                              setDraft(cmd);
                              if (isMobile) setCompanionOpen(true);
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
            trackEvent("decision_participant_add", { source: "roster" });
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
