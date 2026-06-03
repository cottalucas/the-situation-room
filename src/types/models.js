/**
 * Data models for The Situation Room.
 *
 * Relationships:
 *   Room        has a persistent roster of Person ids, and many Decisions.
 *   Decision    belongs to a Room. It pulls participants from the roster and
 *               may add externals (people scoped to this decision only).
 *               Positions live on the decision, so a person can be "against"
 *               on one decision and "for" on another.
 *   Person      a global profile that compounds across decisions and rooms:
 *               read, goal, notes, history. One person, two scopes:
 *               room roster (persistent) and decision participant (per decision).
 *   Edge        a typed relationship between two people on the network.
 *   Note        a free text observation attached to a person. Local only.
 *   HistoryEntry  how a person behaved on a past decision. The global memory.
 *
 * These are JSDoc typedefs, not runtime code. They document the shapes that
 * the store reads and writes, and that Firestore will hold later.
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
 */

/**
 * @typedef {"for"|"against"|"neutral"|"unknown"} Position
 */

/**
 * @typedef {Object} Person
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {number} power            0 to 100.
 * @property {number} interest         0 to 100.
 * @property {string} goal             The driver.
 * @property {string} context          One paragraph of background.
 * @property {string[]} scarfDimensions  Which SCARF dimensions are threatened.
 * @property {string} tkiStyle         Thomas Kilmann mode label.
 * @property {string} cialdiniLever    Cialdini lever labels.
 * @property {string} fuTeaser         One line Fisher and Ury teaser.
 * @property {string} scarf            Full SCARF read.
 * @property {string} tki              Full Thomas Kilmann read.
 * @property {string} cialdini         Full Cialdini read.
 * @property {string} fisherUry        Full Fisher and Ury read.
 * @property {Note[]} notes
 * @property {HistoryEntry[]} history
 * @property {boolean} [fresh]         True for a just added person with little data.
 * @property {boolean} [external]      True if created as a decision external.
 */

/**
 * @typedef {Object} Edge
 * @property {string} from   Person id.
 * @property {string} to     Person id. Defers and influence arrows point here.
 * @property {"ally"|"conflict"|"defers"} type
 * @property {string} [note]
 */

/**
 * @typedef {string} Note   A plain string for now. Becomes {text, at} in Firestore.
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} decision   Title of the past decision.
 * @property {Position} stance   How they landed.
 * @property {string} note       What happened.
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {"welcome"|"play"|"note"|"added"|"fallback"} type
 * @property {string} [body]
 * @property {Object} [response]   Present on play messages.
 */

export {};
