import { useSyncExternalStore } from "react";
import * as store from "../lib/store.js";

/**
 * Subscribe a component to the data store. Re render on any commit.
 * Returns the store module so callers use store.getRooms(), store.savePerson(),
 * and so on. This mirrors how a Firestore listener would drive re renders.
 */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store;
}
