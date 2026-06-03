import React, { useState, useCallback } from "react";
import { company } from "../data/seed.js";
import { useStore } from "../hooks/useStore.js";
import { getResponse } from "../lib/reasoning.js";

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
  { id: "grid", label: "Grid", hint: "Who to spend energy on" },
  { id: "network", label: "Network", hint: "Who moves whom" },
];

export default function Room({ onExit }) {
  const store = useStore();

  const [activeRoomId, setActiveRoomId] = useState("mobile");
  const [activeDecisionId, setActiveDecisionId] = useState("salesforce");
  const [activeTab, setActiveTab] = useState("people");
  const [profile, setProfile] = useState(null);
  const [draft, setDraft] = useState("");
  const [showPath, setShowPath] = useState(false);
  const [mapNonce, setMapNonce] = useState(0);
  const [modal, setModal] = useState(null); // { type, id }

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
      setMapNonce((n) => n + 1);
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
      setMapNonce((n) => n + 1);
    },
    [store]
  );
  const newRoom = useCallback(() => {
    const id = store.createRoom();
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
      if (wasActive) {
        const next = store.getDecisions(activeRoomId).find((d) => d.status === "active");
        setActiveDecisionId(next?.id || null);
      }
      setModal(null);
    },
    [store, activeDecisionId, activeRoomId]
  );

  /* profile */
  const openCompact = useCallback((id) => setProfile({ personId: id, variant: "compact" }), []);
  const openFull = useCallback((id) => setProfile({ personId: id, variant: "full" }), []);

  /* chat */
  const onSubmit = useCallback(
    (e) => {
      e.preventDefault();
      const q = draft.trim();
      if (!q || !decision) {
        setDraft("");
        return;
      }
      setShowPath(false);

      const note = q.match(/^@notes?\s+(\S+)\s+([\s\S]+)$/i);
      if (note) {
        const token = note[1].toLowerCase();
        const body = note[2].trim();
        const target = participants.find(
          (p) => p.name.toLowerCase().split(" ").some((t) => t.startsWith(token)) || p.id === token
        );
        if (target) {
          store.addNote(target.id, body);
          store.pushMessage(decision.id, { type: "note", personName: target.name, text: body });
        } else store.pushMessage(decision.id, { type: "fallback", body: `No one named ${note[1]} is in this decision.` });
        setDraft("");
        return;
      }
      const add = q.match(/^@add\s+([^,]+)(?:,\s*([\s\S]+))?$/i);
      if (add) {
        const name = add[1].trim();
        const role = (add[2] || "").trim();
        const id = store.addExternal(decision.id, { name, role });
        store.pushMessage(decision.id, { type: "added", body: `${name} added as an external participant. First pass read, sharpen it with notes.` });
        if (id) setProfile({ personId: id, variant: "compact" });
        setDraft("");
        return;
      }
      // TODO: feed notes into the reasoning context here.
      const resp = getResponse(q, participants, decision.context);
      store.pushMessage(decision.id, resp.kind === "play" ? { type: "play", response: resp } : { type: "fallback", body: resp.body });
      setDraft("");
    },
    [draft, decision, participants, store]
  );
  const showOnNetwork = useCallback(() => {
    setShowPath(true);
    setActiveTab("network");
  }, []);

  const modalRoom = modal?.id ? store.getRoom(modal.id) : null;
  const modalDecision = modal?.id ? store.getDecision(modal.id) : null;

  return (
    <div className={`app ${collapsed ? "app-rail-collapsed" : ""}`}>
      <header className="header">
        <button className="brand-link" onClick={onExit} title="Back to home">
          <span className="company">{company}</span>
          <span className="brand">The Situation Room</span>
        </button>
        <button className="signout" onClick={onExit} title="Sign out">
          {/* TODO: wire auth (Prompt 2) */}
          Sign out
        </button>
      </header>

      <div className="body">
        <Rail
          rooms={store.getRooms()}
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
                    onRemoveParticipant={(id) => store.removeParticipant(decision.id, id)}
                  />
                )}
                {activeTab === "grid" && (
                  <GridTab
                    participants={participants}
                    decision={decision}
                    selectedId={profile?.personId}
                    onOpenProfile={openCompact}
                    onMove={store.movePerson}
                    mapNonce={mapNonce}
                  />
                )}
                {activeTab === "network" && (
                  <NetworkTab
                    participants={participants}
                    decision={decision}
                    edges={store.getEdges()}
                    onRemoveEdge={store.removeEdge}
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
          decision={decision || { positions: {} }}
          onShowNetwork={showOnNetwork}
          onOpenProfile={openFull}
          onOpenCommands={() => setModal({ type: "commands" })}
          draft={draft}
          setDraft={setDraft}
          onSubmit={onSubmit}
        />
      </div>

      {profilePerson && (
        <PersonProfile
          key={profile.personId + profile.variant}
          person={profilePerson}
          position={profilePosition}
          variant={profile.variant}
          onClose={() => setProfile(null)}
          onSave={(patch) => store.updatePerson(profile.personId, patch)}
        />
      )}

      {modal?.type === "roomSettings" && modalRoom && (
        <RoomSettings
          room={modalRoom}
          allPeople={store.getAllPeople()}
          onClose={() => setModal(null)}
          onRename={(name) => store.updateRoom(modalRoom.id, { name })}
          onAddToRoster={(id) => store.addToRoster(modalRoom.id, id)}
          onRemoveFromRoster={(id) => store.removeFromRoster(modalRoom.id, id)}
        />
      )}
      {modal?.type === "decisionSettings" && modalDecision && (
        <DecisionSettings
          decision={modalDecision}
          onClose={() => setModal(null)}
          onSave={(patch) => {
            store.updateDecision(modalDecision.id, patch);
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
          body={`This wipes ${modalRoom.name} and everything inside it: its decisions, network, and chat history. The people stay in your directory. This cannot be undone.`}
          phrase={modalRoom.name}
          confirmLabel="Delete room"
          onConfirm={() => confirmDeleteRoom(modalRoom.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "deleteDecision" && modalDecision && (
        <ConfirmModal
          title="Delete decision"
          body={`This deletes ${modalDecision.title} and its chat history. The people stay in the room roster. This cannot be undone.`}
          confirmLabel="Delete decision"
          onConfirm={() => confirmDeleteDecision(modalDecision.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
