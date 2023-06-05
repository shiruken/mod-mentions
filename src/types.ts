/**
 * User
 *
 * @typeParam count - Total number of mod mentions by user
 * @typeParam objects - List of recent Reddit object ids from user that mentioned mods
 */
export type User = {
  count: number,
  objects: string[]
};