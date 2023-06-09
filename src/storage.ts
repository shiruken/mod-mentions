import { KeyValueStorage } from "@devvit/public-api";
import { Metadata } from "@devvit/protos";

const kv = new KeyValueStorage();

/**
 * User
 * @typeParam count: Total number of mod mentions by user (all time)
 * @typeParam objects: List of recent Reddit object ids from user that mentioned mods
 */
export type User = {
  count: number,
  objects: string[]
};

/**
 * Read {@link User} object for `username` from Reddit KVStore.
 * Creates a new User if `username` key does not already exist.
 * @param username A Reddit username
 * @param metadata Metadata from the originating handler
 * @returns A Promise that resolves to a User object
 */
export async function getUserData(username: string, metadata?: Metadata): Promise<User> {
  let user = await kv.get(username, metadata);
  if (user === undefined) {
    user = {
      count: 0,
      objects: []
    };
  }
  return user as User;
}

/**
 * Write {@link User} object for `username` in Reddit KVStore.
 * Automatically prunes `user.objects` to 50 most recent Reddit object ids.
 * @param username A Reddit username associated with `user`
 * @param user A User object
 * @param metadata Metadata from the originating handler
 * @returns A promise that resolves to void
 */
export async function storeUserData(username: string, user: User, metadata?: Metadata): Promise<void> {
  while (user.objects.length > 50) {
    const object = user.objects.shift();
    console.log(`Dropped ${object} from u/${username} in KVStore`);
  }
  try {
    await kv.put(username, user, metadata);
  } catch(err) {
    console.error(`Error writing u/${username} to KVStore: ${err}`);
  }
}

/**
 * Get list of all usernames and associated counts from Reddit KVStore sorted by count descending
 * @param metadata Metadata from the originating handler
 * @returns A promise that resolves to a list of lists containing `[username, count]`
 */
export async function getUsersCountSorted(metadata?: Metadata): Promise<[string, number][]> {
  const keys = await kv.list(metadata);
  const users: [string, number][] = [];
  for (const key of keys) {
    const user = await kv.get(key, metadata) as User;
    users.push([key, user.count]);
  }
  users.sort((a, b) => b[1] - a[1]);
  return users;
}