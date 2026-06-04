import React, { useState, useCallback, useEffect, useRef } from "react";
import { useStore } from "../hooks/useStore.js";
import { interpretRoomCommand, askStrategist } from "../lib/context.js";
import { trackEvent } from "../lib/firebase.js";
import { resolvePersonRef, splitLeadingPersonRef } from "../lib/person-ref.js";
import { autoReadEligible, autoReadSignature, AUTO_READ_QUESTION } from "../lib/auto-read.js";

import { TheRead } from "../components/TheRead.jsx";

const LIVE_LLM = import.meta.env.VITE_ENABLE_LIVE_LLM === "true";

import { Rail } from "../components/Rail.jsx";
import { Chat } from "../components/Chat.jsx";
import { PersonProfile } from "../components/PersonProfile.jsx";
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

export default function Room({ onExit }) {
  const store = useStore();

  const [activeRoomId, setActiveRoomId] = useState("mobile");
  const [activeDecisionId, setActiveDecisionId] = useState("salesforce");
  const [activeTab, setActiveTab] = useState("people");
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPath, setShowPath] = useState(false);
  const [modal, setModal] = useState(null); // { type, id }

  const rooms = store.getRooms();
  const collapsed = !!store.getPref("railCollapsed");
  const room = store.getRoom(activeRoomId);
  const decisions = store.getDecisions(activeRoomId);
  const decision = store.getDecision(activeDecisionId);
  const participants = activeDecisionId ? store.getParticipants(activeDecisionId) : [];
  const messages = activeDecisionId ? store.getChat(activeDecisionId) : [];
  const lastPlay = [...messages].reverse().find((m) => m.type === "play");
  const sequence = lastPlay?.response?.sequence;
  const roomHasPeople = (room?.rosterIds?.length || 0) > 0;
  const profilePerson = profile ? store.getPerson(profile.personId) : null;
  const profilePosition = decision?.positions?.[profile?.personId] || "unknown";
  const profilePlacement = decision && profile ? store.getPlacement(decision.id, profile.personId) : null;

  /* navigation */
  const selectRoom = useCallback(
    (id) => {
      setActiveRoomId(id);
      const first = store.getDecisions(id).find((d) => d.status === "active");
      if (first) {
        store.ensureChat(first.id);
        setActiveDecisionId(first.id);
      } else setActiveDecisionId(null);
      setProfile(null);
      setShowPath(false);
      setActiveTab("people");
    },
    [store]
  );
  const selectDecision = useCallback(
    (id) => {
      store.ensureChat(id);
      setActiveDecisionId(id);
      setProfile(null);
      setShowPath(false);
      setActiveTab("people");
    },
    [store]
  );

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
      setProfile(null);
      setShowPath(false);
      setActiveTab("people");
      return;
    }
    if (activeDecisionId && !store.getDecision(activeDecisionId)) {
      const firstDecision = store.getDecisions(activeRoomId).find((d) => d.status === "active") || null;
      setActiveDecisionId(firstDecision?.id || null);
      if (firstDecision) store.ensureChat(firstDecision.id);
      setProfile(null);
      setShowPath(false);
      setActiveTab("people");
    }
  }, [rooms, activeRoomId, activeDecisionId, store]);

  const newRoom = useCallback(() => {
    const id = store.createRoom();
    trackEvent("room_create");
    setActiveRoomId(id);
    setActiveDecisionId(null);
    setProfile(null);
    setActiveTab("people");
    setModal({ type: "roomSettings", id });
    // TODO: prose to map onboarding. Replace with a describe your team flow.
  }, [store]);
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
      setProfile(null);
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
      setProfile(null);
    },
    [store, activeRoomId]
  );

  /* profile */
  const openCompact = useCallback((id) => setProfile({ personId: id, variant: "compact" }), []);
  const openFull = useCallback((id) => setProfile({ personId: id, variant: "full" }), []);

  /* Auto-Read: the always-on strategic read at the top of the room. Reuses the
     existing strategist endpoint, cached by a grid/positions/edges signature so a
     model call happens only when the strategic inputs change. */
  const readEdges = activeDecisionId ? store.getEdges(activeDecisionId) : [];
  const readEligible = autoReadEligible(participants.length, readEdges.length);
  const readSignature = autoReadSignature(decision, readEdges);
  const readCacheRef = useRef({});
  const [autoRead, setAutoRead] = useState({ key: null, status: "idle", result: null });

  const openReadChip = useCallback(
    (id) => {
      trackEvent("read_chip_clicked", { personId: id });
      openCompact(id);
    },
    [openCompact]
  );

  useEffect(() => {
    if (!decision || !readEligible || !LIVE_LLM) return;
    const key = readSignature;
    const cached = readCacheRef.current[key];
    if (cached) {
      setAutoRead({ key, status: "ready", result: cached });
      return;
    }
    let cancelled = false;
    setAutoRead({ key, status: "loading", result: null });
    trackEvent("read_generated");
    (async () => {
      const resp = await askStrategist({
        question: AUTO_READ_QUESTION,
        room,
        decision,
        participants,
        edges: readEdges,
        messages: [],
      });
      if (cancelled) return;
      if (resp.kind === "coach") {
        readCacheRef.current[key] = resp.answer;
        setAutoRead({ key, status: "ready", result: resp.answer });
      } else {
        setAutoRead({ key, status: "error", result: null });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readSignature, readEligible, decision?.id]);

  useEffect(() => {
    if (autoRead.status === "ready" && autoRead.result) trackEvent("read_shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRead.status, autoRead.key]);

  const findPersonRef = useCallback(
    (ref, currentParticipants = participants) => {
      const allPeople = store.getAllPeople();
      return resolvePersonRef(ref, [currentParticipants, Object.values(allPeople)]);
    },
    [participants, store]
  );

  const ensurePersonForUpdate = useCallback(
    (item, currentDecision) => {
      const existing = findPersonRef(item.id || item.name);
      if (existing) {
        if (room && !room.rosterIds.includes(existing.id)) store.addToRoster(room.id, existing.id);
        if (currentDecision && ![...currentDecision.participantIds, ...currentDecision.externalIds].includes(existing.id)) {
          store.addParticipant(currentDecision.id, existing.id);
        }
        return existing.id;
      }
      if (!item.create || !item.name || !room) return null;
      const id = store.createPerson({ name: item.name, role: item.role || "" });
      store.addToRoster(room.id, id);
      if (currentDecision) store.addParticipant(currentDecision.id, id);
      trackEvent("person_create", { source: "chat_map" });
      return id;
    },
    [findPersonRef, room, store]
  );

  const applyRoomUpdate = useCallback(
    (update, sourceCommand) => {
      if (!decision || !update) return null;
      let currentDecision = store.getDecision(decision.id);
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
        const existed = Boolean(findPersonRef(item.id || item.name));
        const id = ensurePersonForUpdate(item, currentDecision);
        if (!id) return;
        if (!existed && item.create) created += 1;
        const person = store.getPerson(id);
        if (item.role && person && !person.role) store.updatePerson(id, { role: item.role });
        if (caps.notes && item.note) {
          store.addObservation(id, { text: item.note, source: "chat", decisionId: decision.id });
          notes += 1;
        }
        const patch = person ? mergePersonPatch(person, item.profilePatch) : null;
        if (caps.profile && patch) {
          store.updatePerson(id, patch);
          profiles += 1;
        }
        if (caps.grid && item.position && item.position !== currentDecision?.positions?.[id]) {
          store.setPosition(decision.id, id, item.position);
          positions += 1;
        }
        if (caps.grid && item.power != null && item.interest != null) {
          const currentPlacement = currentDecision?.placements?.[id] || {};
          const extremePower = gridValueChanged(currentPlacement.power, item.power) && gridValueIsExtreme(item.power);
          const extremeInterest = gridValueChanged(currentPlacement.interest, item.interest) && gridValueIsExtreme(item.interest);
          if (extremePower || extremeInterest) {
            const axis = extremePower ? "power" : "interest";
            clarificationQuestions.push(gridClarification(store.getPerson(id) || item, axis, extremePower ? item.power : item.interest));
            currentDecision = store.getDecision(decision.id);
            return;
          }
          store.setPlacement(decision.id, id, item.power, item.interest, item.confidence);
          placements += 1;
          if (item.confidence === "low" && !confirmQuestions.length) {
            confirmQuestions.push(softGridConfirm(store.getPerson(id) || item, item.power, item.interest));
          }
        }
        currentDecision = store.getDecision(decision.id);
      });

      if (caps.edges) update.edges.forEach((edge) => {
        const from = ensurePersonForUpdate({ id: edge.from, name: edge.from, create: sourceCommand !== "grid" }, currentDecision);
        const to = ensurePersonForUpdate({ id: edge.to, name: edge.to, create: sourceCommand !== "grid" }, currentDecision);
        if (!from || !to || from === to) return;
        const id = store.addEdge(decision.id, { from, to, type: edge.type });
        if (id) edges += 1;
        if (edge.note) store.addDecisionNote(decision.id, edge.note);
        currentDecision = store.getDecision(decision.id);
      });

      if (update.decisionNote) store.addDecisionNote(decision.id, update.decisionNote);
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
    [decision, ensurePersonForUpdate, findPersonRef, store]
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
        if (id) setProfile({ personId: id, variant: "compact" });
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

      setDraft("");
      store.pushMessage(decision.id, {
        type: "fallback",
        body: "Use @note, @energy, @network, @map, @create, @ask, or @add. Open play chat is paused while mapping gets sharper.",
      });
    },
    [applyRoomUpdate, decision, draft, findPersonRef, isGenerating, participants, room, store]
  );
  const showOnNetwork = useCallback(() => {
    setShowPath(true);
    setActiveTab("network");
  }, []);

  const modalRoom = modal?.id ? store.getRoom(modal.id) : null;
  const modalDecision = modal?.id ? store.getDecision(modal.id) : null;
  const modalPerson = modal?.id ? store.getPerson(modal.id) : null;

  return (
    <div className={`app ${collapsed ? "app-rail-collapsed" : ""}`}>
      <header className="header">
        <div className="brand-lockup" aria-label="The Situation Room">
          <span className="brand">The Situation Room</span>
        </div>
        <button className="signout" onClick={onExit} title="Sign out">
          Sign out
        </button>
      </header>

      <div className="body">
        <Rail
          rooms={rooms}
          activeRoomId={activeRoomId}
          activeDecisionId={activeDecisionId}
          collapsed={collapsed}
          onToggleCollapse={() => store.setPref("railCollapsed", !collapsed)}
          onSelectRoom={selectRoom}
          onNewRoom={newRoom}
          onEditRoom={(id) => setModal({ type: "roomSettings", id })}
          onDeleteRoom={(id) => setModal({ type: "deleteRoom", id })}
          decisions={decisions}
          onSelectDecision={selectDecision}
          onNewDecision={newDecision}
          onEditDecision={(id) => setModal({ type: "decisionSettings", id })}
          onArchiveDecision={archive}
          onDeleteDecision={(id) => setModal({ type: "deleteDecision", id })}
        />

        <main className="workspace">
          {!room ? (
            <div className="empty-state">
              <div className="empty-icon">◦</div>
              <p className="empty-title">No room selected</p>
              <p className="empty-sub">Create a room to begin.</p>
              <button className="btn-primary" onClick={newRoom}>
                + New room
              </button>
            </div>
          ) : !roomHasPeople ? (
            <div className="empty-state">
              <div className="empty-icon">◦</div>
              <p className="empty-title">No one in this room yet</p>
              <p className="empty-sub">Add your team to the roster. They become available across every decision in this room.</p>
              <button className="btn-primary" onClick={() => setModal({ type: "roomSettings", id: activeRoomId })}>
                Add people
              </button>
            </div>
          ) : !decision ? (
            <div className="empty-state">
              <div className="empty-icon">○</div>
              <p className="empty-title">No decision selected</p>
              <p className="empty-sub">Start a decision. The whole roster joins by default, and you map positions and the play from there.</p>
              <button className="btn-primary" onClick={newDecision}>
                + New decision
              </button>
            </div>
          ) : (
            <>
              <TheRead
                eligible={readEligible}
                status={autoRead.key === readSignature ? autoRead.status : "idle"}
                result={autoRead.key === readSignature ? autoRead.result : null}
                participants={participants}
                onOpenProfile={openReadChip}
              />
              <div className="tabs">
                {TABS.map((t) => (
                  <button key={t.id} className={`tab ${activeTab === t.id ? "tab-active" : ""}`} onClick={() => setActiveTab(t.id)}>
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
                    onOpenProfile={openFull}
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
                    selectedId={profile?.personId}
                    onOpenProfile={openCompact}
                    onMove={(personId, power, interest) => store.setPlacement(decision.id, personId, power, interest)}
                  />
                )}
                {activeTab === "network" && (
                  <NetworkTab
                    participants={participants}
                    decision={decision}
                    edges={store.getEdges(decision.id)}
                    onRemoveEdge={(index) => store.removeEdge(decision.id, index)}
                    selectedId={profile?.personId}
                    onOpenProfile={openCompact}
                    sequence={sequence}
                    showPath={showPath}
                  />
                )}
              </div>
            </>
          )}
        </main>

        <Chat
          messages={messages}
          participants={participants}
          decision={decision}
          onShowNetwork={showOnNetwork}
          onOpenProfile={openFull}
          onOpenCommands={() => setModal({ type: "commands" })}
          draft={draft}
          setDraft={setDraft}
          onSubmit={onSubmit}
          isGenerating={isGenerating}
        />
      </div>

      {profilePerson && (
        <PersonProfile
          key={profile.personId + profile.variant}
          person={profilePerson}
          position={profilePosition}
          placement={profilePlacement}
          variant={profile.variant}
          onClose={() => setProfile(null)}
          onSave={(patch) => {
            store.updatePerson(profile.personId, patch);
            trackEvent("person_update");
          }}
          onDelete={room?.rosterIds?.includes(profile.personId) ? (id) => setModal({ type: "deletePerson", id }) : null}
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
            if (id) setProfile({ personId: id, variant: "full" });
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
