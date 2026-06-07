import React, { useEffect, useMemo, useRef, useState } from "react";
import { trackNetwork } from "../../lib/firebase.js";
import {
  CENTER,
  VIEWBOX,
  RING_RADIUS,
  EDGE_LABEL,
  EDGE_TYPES,
  ringLayout,
  ringLabelPositions,
  clipLine,
  edgeColor,
  edgeStrokeWidth,
  gestureForRadius,
  nearestRing,
  levelForRing,
  dist,
} from "../../lib/influence-ring.js";

const MOVE_THRESHOLD = 6; // viewBox units before a press counts as a drag, not a click

function firstLabel(node) {
  if (node.isSelf) return "You";
  const first = String(node.name || "").trim().split(/\s+/)[0] || "?";
  return first.length > 7 ? `${first.slice(0, 6)}…` : first;
}

function levelLabel(level) {
  if (level === "high") return "High influence";
  if (level === "medium") return "Medium influence";
  if (level === "low") return "Low influence";
  return "Influence not set";
}

/**
 * The Influence Ring. Concentric rings encode influence over this decision; You
 * sits at the center. Desktop pointer interactions: drag a node's core to move it
 * between rings (sets influence), drag its rim to draw a relationship. SVG only,
 * no graph library. Touch drag is intentionally out of scope.
 */
export function NetworkTab({ participants, decision, edges, roomId, onOpenProfile, onSetInfluence, onCreateEdge, onRemoveEdge, selectedId }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [hover, setHover] = useState(null); // { id, zone: "move"|"edge" }
  const [picker, setPicker] = useState(null);

  const influence = decision?.influence || {};
  const layout = useMemo(() => ringLayout(participants, influence), [participants, influence]);
  const nodeById = useMemo(() => new Map(layout.map((n) => [n.id, n])), [layout]);
  const visible = useMemo(() => new Set(layout.map((n) => n.id)), [layout]);
  const liveEdges = useMemo(
    () => (edges || []).filter((e) => visible.has(e.from) && visible.has(e.to)),
    [edges, visible]
  );
  const labels = useMemo(() => ringLabelPositions(), []);

  // network_viewed once per mount.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackNetwork("network_viewed", { roomId, participantCount: participants.length, edgeCount: liveEdges.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDragState = (next) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Escape cancels a drag or closes the picker with no write.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (dragRef.current) setDragState(null);
      setPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Map a pointer event to viewBox coords, accounting for preserveAspectRatio
  // (xMidYMid meet) letterboxing when the element is not square.
  const toViewBox = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) / VIEWBOX;
    const offsetX = (rect.width - VIEWBOX * scale) / 2;
    const offsetY = (rect.height - VIEWBOX * scale) / 2;
    return {
      x: (e.clientX - rect.left - offsetX) / scale,
      y: (e.clientY - rect.top - offsetY) / scale,
    };
  };

  // Map viewBox coords to pixels relative to the canvas, for HTML overlays
  // (tooltip, picker), accounting for the same letterboxing.
  const toCanvasPx = (vx, vy) => {
    const svg = svgRef.current;
    if (!svg) return { left: 0, top: 0 };
    const sr = svg.getBoundingClientRect();
    const cr = (svg.parentElement || svg).getBoundingClientRect();
    const scale = Math.min(sr.width, sr.height) / VIEWBOX;
    const offX = (sr.width - VIEWBOX * scale) / 2;
    const offY = (sr.height - VIEWBOX * scale) / 2;
    return { left: sr.left - cr.left + offX + vx * scale, top: sr.top - cr.top + offY + vy * scale };
  };

  const startDrag = (e, node) => {
    if (node.isSelf) return; // self never repositions and has no outbound edges
    const { x, y } = toViewBox(e);
    const mode = gestureForRadius(dist(x, y, node.x, node.y), node.r);
    if (!mode) return;
    e.stopPropagation();
    try {
      svgRef.current.setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is a convenience; a capture failure must not block the drag.
    }
    setPicker(null);
    setDragState({ mode, id: node.id, startX: x, startY: y, x, y, moved: false, originLevel: node.rawLevel || null, hoverTargetId: null, snapRing: node.ring });
  };

  const onPointerMove = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    const { x, y } = toViewBox(e);
    const moved = cur.moved || dist(x, y, cur.startX, cur.startY) > MOVE_THRESHOLD;
    let hoverTargetId = null;
    let snapRing = cur.snapRing;
    if (cur.mode === "move") {
      snapRing = nearestRing(dist(x, y, CENTER, CENTER));
    } else if (cur.mode === "edge") {
      const target = layout.find((n) => !n.isSelf && n.id !== cur.id && dist(x, y, n.x, n.y) <= n.r);
      hoverTargetId = target?.id || null;
    }
    setDragState({ ...cur, x, y, moved, hoverTargetId, snapRing });
  };

  const openPicker = (from, to) => {
    const a = nodeById.get(from);
    const b = nodeById.get(to);
    if (!a || !b) return;
    const existingIndex = (edges || []).findIndex((ed) => ed.from === from && ed.to === to);
    setPicker({
      from,
      to,
      existingType: existingIndex >= 0 ? edges[existingIndex].type : null,
      existingIndex,
    });
  };

  const onPointerUp = (e) => {
    const cur = dragRef.current;
    if (!cur) return;
    try {
      svgRef.current.releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore: the gesture must finalize even if capture was never held.
    }
    if (!cur.moved) {
      // A press without a drag is a click: open the node summary.
      setDragState(null);
      onOpenProfile?.(cur.id);
      return;
    }
    if (cur.mode === "move") {
      const level = levelForRing(cur.snapRing ?? nearestRing(dist(cur.x, cur.y, CENTER, CENTER)));
      onSetInfluence?.(cur.id, level);
      trackNetwork("influence_overridden", { roomId, newLevel: level, previousLevel: cur.originLevel || null });
    } else if (cur.mode === "edge" && cur.hoverTargetId) {
      openPicker(cur.id, cur.hoverTargetId);
    }
    setDragState(null);
  };

  const choosePickerType = (type) => {
    if (!picker) return;
    const { from, to, existingType, existingIndex } = picker;
    if (existingType === type) {
      setPicker(null);
      return;
    }
    if (existingIndex >= 0) {
      onRemoveEdge?.(existingIndex);
      trackNetwork("edge_deleted", { roomId });
    }
    const created = onCreateEdge?.(from, to, type);
    if (created) trackNetwork("edge_created", { roomId, type });
    setPicker(null);
  };

  const removeExistingEdge = () => {
    if (!picker || picker.existingIndex < 0) return;
    onRemoveEdge?.(picker.existingIndex);
    trackNetwork("edge_deleted", { roomId });
    setPicker(null);
  };

  const onNodeHoverMove = (e, node) => {
    if (dragRef.current || node.isSelf) return;
    const { x, y } = toViewBox(e);
    const zone = gestureForRadius(dist(x, y, node.x, node.y), node.r) || "move";
    setHover({ id: node.id, zone });
  };

  const empty = participants.length < 2;
  const draggingNode = drag && drag.moved ? drag : null;
  const hoverNode = hover ? nodeById.get(hover.id) : null;

  return (
    <div className="net-zone">
      <div className="ring-canvas">
        <svg
          ref={svgRef}
          className="ring-svg"
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ cursor: drag ? (drag.mode === "edge" ? "crosshair" : "grabbing") : "default" }}
        >
          <defs>
            <marker id="ring-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {/* Ring guides */}
          {[1, 2, 3].map((ring) => (
            <circle
              key={ring}
              className={`ring-guide ${draggingNode && draggingNode.mode === "move" && draggingNode.snapRing === ring ? "ring-guide-active" : ""}`}
              cx={CENTER}
              cy={CENTER}
              r={RING_RADIUS[ring]}
              fill="none"
            />
          ))}
          {labels.map((l) => (
            <text key={l.ring} className="ring-label" x={l.x + 6} y={l.y - 4}>
              {l.label}
            </text>
          ))}

          {empty ? (
            <text className="ring-empty" x={CENTER} y={CENTER} textAnchor="middle">
              Add people with @note to start mapping influence
            </text>
          ) : (
            <>
              {/* Edges first, so nodes sit on top */}
              {liveEdges.map((e, i) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b) return null;
                const l = clipLine(a, b);
                return (
                  <line
                    key={`${e.from}-${e.to}-${e.type}-${i}`}
                    x1={l.x1}
                    y1={l.y1}
                    x2={l.x2}
                    y2={l.y2}
                    stroke={edgeColor(e.type)}
                    strokeWidth={edgeStrokeWidth(e.type)}
                    markerEnd="url(#ring-arrow)"
                  />
                );
              })}

              {/* Ghost edge while drawing a relationship */}
              {draggingNode && draggingNode.mode === "edge" && (() => {
                const a = nodeById.get(draggingNode.id);
                if (!a) return null;
                return <line className="ring-ghost-edge" x1={a.x} y1={a.y} x2={draggingNode.x} y2={draggingNode.y} />;
              })()}

              {/* Nodes */}
              {layout.map((node) => {
                const isDraggingThis = draggingNode && draggingNode.id === node.id && draggingNode.mode === "move";
                const cx = isDraggingThis ? draggingNode.x : node.x;
                const cy = isDraggingThis ? draggingNode.y : node.y;
                const r = isDraggingThis ? node.r * 1.1 : node.r;
                const isHover = hover?.id === node.id;
                const isTarget = draggingNode?.mode === "edge" && draggingNode.hoverTargetId === node.id;
                return (
                  <g
                    key={node.id}
                    className="ring-node-g"
                    onPointerDown={(e) => startDrag(e, node)}
                    onPointerEnter={() => !node.isSelf && setHover({ id: node.id, zone: "move" })}
                    onPointerMove={(e) => onNodeHoverMove(e, node)}
                    onPointerLeave={() => setHover((h) => (h?.id === node.id ? null : h))}
                    onClick={() => node.isSelf && onOpenProfile?.(node.id)}
                    style={{ cursor: node.isSelf ? "pointer" : drag ? "inherit" : isHover ? (hover.zone === "edge" ? "crosshair" : "grab") : "pointer" }}
                  >
                    {isTarget && <circle className="ring-target-pulse" cx={cx} cy={cy} r={r + 8} fill="none" />}
                    {/* Rim affordance: hint the draggable edge zone (not on self) */}
                    {isHover && !node.isSelf && !drag && (
                      <circle className="ring-rim-hint" cx={cx} cy={cy} r={r} fill="none" />
                    )}
                    <circle
                      className={`ring-node ring-node-${node.level} ${isHover ? "ring-node-hover" : ""} ${node.id === selectedId ? "ring-node-selected" : ""}`}
                      cx={cx}
                      cy={cy}
                      r={r}
                      opacity={isDraggingThis ? 0.9 : 1}
                    />
                    <text className={`ring-node-label ${node.isSelf ? "ring-node-label-self" : ""}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
                      {firstLabel(node)}
                    </text>
                  </g>
                );
              })}
            </>
          )}
        </svg>

        {/* Hover tooltip */}
        {hoverNode && !drag && (() => {
          const px = toCanvasPx(hoverNode.x, hoverNode.y - hoverNode.r);
          return (
          <div
            className="ring-tooltip"
            style={{ left: px.left, top: px.top }}
          >
            <span className="ring-tooltip-name">{hoverNode.isSelf ? "You" : hoverNode.name}</span>
            {hoverNode.isSelf ? (
              <span className="ring-tooltip-meta">The decision-maker</span>
            ) : (
              <>
                {hoverNode.role && <span className="ring-tooltip-meta">{hoverNode.role}</span>}
                <span className="ring-tooltip-meta">{levelLabel(hoverNode.rawLevel)}</span>
              </>
            )}
          </div>
          );
        })()}

        {/* Relationship picker */}
        {picker && (() => {
          const a = nodeById.get(picker.from);
          const b = nodeById.get(picker.to);
          const mid = a && b ? toCanvasPx((a.x + b.x) / 2, (a.y + b.y) / 2) : { left: 0, top: 0 };
          return (
          <>
            <div className="ring-picker-scrim" onClick={() => setPicker(null)} />
            <div className="ring-picker" style={{ left: mid.left, top: mid.top }}>
              <span className="ring-picker-label">Relationship</span>
              <div className="ring-picker-pills">
                {EDGE_TYPES.map((type) => (
                  <button
                    key={type}
                    className={`ring-pill ${picker.existingType === type ? "ring-pill-active" : ""}`}
                    onClick={() => choosePickerType(type)}
                  >
                    {EDGE_LABEL[type]}
                  </button>
                ))}
              </div>
              {picker.existingIndex >= 0 && (
                <button className="ring-picker-remove" onClick={removeExistingEdge}>
                  Remove relationship
                </button>
              )}
            </div>
          </>
          );
        })()}
      </div>

      <div className="legend">
        <span className="legend-item"><span className="edge-swatch edge-ally" />Ally</span>
        <span className="legend-item"><span className="edge-swatch edge-conflict" />Conflict</span>
        <span className="legend-item"><span className="edge-swatch edge-defers" />Defers to</span>
        <span className="legend-item ring-legend-hint">Drag a node's core to move rings, its rim to link</span>
      </div>
    </div>
  );
}
