import type { Context, TriggerContext } from "@devvit/public-api";
import type { User } from "./types.js";

/**
 * Read {@link User} object for `username` from Redis hash.
 * Creates a new User if `username` does not already exist.
 * @param username A Reddit username
 * @param context A TriggerContext object
 * @returns A Promise that resolves to a {@link User} object
 */
export async function getUserData(username: string, context: TriggerContext): Promise<User> {
  const value = await context.redis.hGet("users", username);
  let user: User;
  if (!value) {
    user = { count: 0, objects: [] };
  } else {
    user = JSON.parse(value);
  }
  return user;
}

/**
 * Write {@link User} object for `username` in Redis hash.
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
  await context.redis
    .hSet("users", { [username]: JSON.stringify(user) })
    .catch((e) => console.error(`Error writing u/${username} to Redis`, e));
}

/**
 * Get array of all usernames and associated counts from Redis hash sorted by count descending
 * @param context A Context object
 * @returns A promise that resolves to a array of arrays containing `[username, count]`
 */
export async function getUsersCountSorted(context: Context): Promise<[string, number][]> {
  const users = await context.redis.hGetAll("users");
  const counts: [string, number][] = [];
  for (const username in users) {
    const user: User = JSON.parse(String(users[username]));
    counts.push([username, user.count]);
  }
  counts.sort((a, b) => b[1] - a[1]);
  return counts;
}

/**
 * Get array of cached moderator usernames from Redis
 * @param context A TriggerContext object
 * @returns A promise that resolves to an array of moderator usernames
 */
export async function getModerators(context: TriggerContext): Promise<string[] | undefined> {
  const moderators = await context.redis.get("mods");
  if (!moderators) {
    return undefined;
  }
  return moderators.split(",");
}

/**
 * Write array of moderator usernames in Redis
 * @param moderators Array of moderator usernames
 * @param context A TriggerContext object
 */
export async function storeModerators(moderators: string[], context: TriggerContext) {
  await context.redis
    .set("mods", moderators.toString())
    .then(() => console.log(`Wrote ${moderators.length} moderators to Redis`))
    .catch((e) => console.error('Error writing moderators to Redis', e));
}

/**
 * Clear cached modlist from Redis
 * @param context A Context object
 */
export async function clearModerators(context: TriggerContext): Promise<void> {
  await context.redis.del("mods");
}
