import React from "react";
import { initialsOf, POSITION_META } from "../lib/frameworks.js";

export function Avatar({ name, size = "md", self = false }) {
  return <span className={`avatar avatar-${size} ${self ? "avatar-self" : ""}`}>{self ? "You" : initialsOf(name)}</span>;
}

export function PositionBadge({ position, size = "sm" }) {
  const m = POSITION_META[position] || POSITION_META.unknown;
  return <span className={`pos-badge pos-badge-${size} ${m.cls}`}>{m.label}</span>;
}

export function QuadChip({ quad }) {
  return (
    <span className="quad-chip" style={{ "--accent": quad.accent }}>
      {quad.label}
    </span>
  );
}
