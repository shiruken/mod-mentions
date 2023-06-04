import { KeyValueStorage } from "@devvit/public-api";
import { Metadata } from "@devvit/protos";

import { User } from './types.js';

const kv = new KeyValueStorage();

export async function getUser(username: string, metadata: Metadata): Promise<User> {
  let user = await kv.get(username, metadata);
  if (user === undefined) {
    user = {
      count: 0,
      objects: []
    };
  }
  return user as User;
}

export async function storeUser(username: string, user: User, metadata: Metadata): Promise<void> {
  while (user.objects.length > 50) {
    user.objects.shift();
  }
  await kv.put(username, user, metadata);
}

export async function getUsersCountSorted(metadata: Metadata): Promise<[string, number][]> {
  const keys = await kv.list(metadata);
  const users: [string, number][] = [];
  for (const key of keys) {
    const user = await kv.get(key, metadata) as User;
    users.push([key, user.count]);
  }
  users.sort((a, b) => b[1] - a[1]);
  return users;
}