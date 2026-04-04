import AsyncStorage from "@react-native-async-storage/async-storage";

const cacheKey = (uid: string) => `connections_cache_${uid}`;

export const ConnectionsCache = {
  async load(uid: string): Promise<any[]> {
    try {
      const raw = await AsyncStorage.getItem(cacheKey(uid));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async save(uid: string, connections: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(cacheKey(uid), JSON.stringify(connections));
    } catch {}
  },

  async remove(uid: string, connectionId: string): Promise<void> {
    try {
      const cached = await ConnectionsCache.load(uid);
      const updated = cached.filter((c) => c.id !== connectionId);
      await AsyncStorage.setItem(cacheKey(uid), JSON.stringify(updated));
    } catch {}
  },
};

/**
 * Returns the best available display name for a connection document.
 * Prefers the async-generated `name` field, falls back to firstPerson & secondPerson
 * first names (available immediately after creation), then the document ID.
 */
export function connectionDisplayName(connection: any): string {
  if (connection.name) return connection.name;
  const parts = [
    connection.firstPerson?.firstName,
    connection.secondPerson?.firstName,
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" ♥ ");
  return connection.id;
}
