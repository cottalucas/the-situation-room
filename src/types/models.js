/**
 * Data models for The Situation Room.
 *
 * Relationships:
 *   Room        has a persistent roster of Person ids, and many Decisions.
 *   Decision    belongs to a Room. It pulls participants from the roster and
 *               may add externals (people scoped to this decision only).
 *               Positions and placements live on the decision, so a person can
 *               be "against" on one decision and "for" on another.
 *   Person      a global profile that compounds across decisions and rooms:
 *               read, goal, observations, history. One person, two scopes:
 *               room roster (persistent) and decision participant (per decision).
 *   Edge        a typed relationship between two people on the network.
 *   Observation a free text memory item attached to a person.
 *
 * These are JSDoc typedefs, not runtime code. They document the shapes that
 * the store reads and writes, and that Firestore holds in configured mode.
 */

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {string[]} rosterIds   Person ids that belong to this room.
 */

/**
 * @typedef {Object} DecisionContext
 * @property {string} deciding    The call being made.
 * @property {string} goal        What success looks like.
 * @property {string} constraint  Deadlines or conditions.
 */

/**
 * @typedef {Object} Decision
 * @property {string} id
 * @property {string} roomId
 * @property {string} title
 * @property {DecisionContext} context
 * @property {string} deadline           ISO date string, or empty.
 * @property {"active"|"archived"} status
 * @property {string[]} participantIds   Roster members in this decision.
 * @property {string[]} externalIds      People scoped to this decision only.
 * @property {Object.<string,Position>} positions  personId to stance.
 * @property {Object.<string,Placement>} placements personId to grid placement.
 * @property {Object.<string,Influence>} influence  personId to influence over this decision.
 * @property {DecisionNote[]} decisionNotes
 * @property {string} derivedSummary
 */

/**
 * @typedef {Object} Influence
 * @property {"high"|"medium"|"low"|null} level  How much this person can block,
 *   accelerate, or shape this decision. Decision-scoped, not a person trait.
 * @property {boolean} overridden  True if the user set it by hand on the Influence
 *   Ring; @map must not overwrite a user-set level. isSelf is always center, ignored.
 * @property {number} [angle]  Optional. The node's angular position on its ring,
 *   in radians from the ring center. Owned per person: assigned once by even
 *   distribution, then only changed when the user drags that specific node. Absent
 *   until first assigned. Not set or read by @map.
 */

/**
 * @typedef {"for"|"against"|"neutral"|"unknown"} Position
 */

/**
 * @typedef {Object} Person
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} goal             The driver.
 * @property {string} context          One paragraph of background.
 * @property {{scarf:string,tki:string,cialdini:string,fisherUry:string}} baseRead
 * @property {{scarfDimensions:string[],tkiStyle:string,cialdiniLever:string,fuTeaser:string}} visualTags
 * @property {{personId:string,type:string}[]} relationships
 * @property {Observation[]} observations
 * @property {boolean} [fresh]         True for a just added person with little data.
 * @property {boolean} [external]      True if created as a decision external.
 * @property {boolean} [isSelf]        True for the one self record that represents
 *                                     the signed-in operator. Rendered as "You",
 *                                     never duplicated, excluded from the directory.
 */

/**
 * @typedef {Object} Placement
 * @property {number} power      0 to 100.
 * @property {number} interest   0 to 100.
 */

/**
 * @typedef {Object} Edge
 * @property {string} from   Person id.
 * @property {string} to     Person id. Defers and influence arrows point here.
 * @property {"ally"|"conflict"|"defers"} type
 * @property {string} [note]
 */

/**
 * @typedef {Object} Observation
 * @property {string} id
 * @property {string} text
 * @property {"note"|"chat"|"history"} source
 * @property {string} [decisionId]
 * @property {*} [ts]
 */

/**
 * @typedef {Object} DecisionNote
 * @property {string} text
 * @property {number|*} ts
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {"welcome"|"play"|"note"|"added"|"updated"|"fallback"} type
 * @property {string} [body]
 * @property {string} [label]
 * @property {string[]} [questions]
 * @property {Object} [response]   Present on play messages.
 */

export {};
