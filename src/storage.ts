import { Context, TriggerContext } from "@devvit/public-api";

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
 * Read {@link User} object for `username` from Redis.
 * Creates a new User if `username` does not already exist.
 * @param username A Reddit username
 * @param context A TriggerContext object
 * @returns A Promise that resolves to a {@link User} object
 */
export async function getUserData(username: string, context: TriggerContext): Promise<User> {
  const value = await context.redis.get(username);
  let user: User;
  if (value === undefined) {
    user = { count: 0, objects: [] };
  } else {
    user = JSON.parse(value);
  }
  return user;
}

/**
 * Write {@link User} object for `username` in Redis.
 * Automatically prunes `user.objects` to 50 most recent Reddit object ids.
 * @param username A Reddit username associated with `user`
 * @param user A {@link User} object
 * @param context A TriggerContext object
 */
export async function storeUserData(username: string, user: User, context: TriggerContext) {
  while (user.objects.length > 50) {
    const object = user.objects.shift();
    console.log(`Dropped ${object} from u/${username} in Redis`);
  }
  try {
    await context.redis.set(username, JSON.stringify(user));
  } catch(err) {
    console.error(`Error writing u/${username} to Redis: ${err}`);
  }
}

/**
 * Get list of all usernames and associated counts from Redis sorted by count descending
 * @param context A Context object
 * @returns A promise that resolves to a list of lists containing `[username, count]`
 */
export async function getUsersCountSorted(context: Context): Promise<[string, number][]> {
  const keys = await context.kvStore.list(); // No equivalent command exists for Redis plugin
  const users = await context.redis.mget(keys);
  const counts: [string, number][] = [];
  keys.forEach((key, index) => {
    const user: User = JSON.parse(String(users[index]));
    counts.push([key, user.count]);
  });
  counts.sort((a, b) => b[1] - a[1]);
  return counts;
}