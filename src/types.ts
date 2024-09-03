/**
 * App installation settings
 */
export type Settings = {
  /** Ignore mentions of these moderators */
  excludedMods: string,
  /** Mentions must contain the u/ prefix */
  requirePrefix: boolean,
  /** Enable content reporting */
  reportContent: boolean,
  /** Enable content locking */
  lockContent: boolean,
  /** Enable content removal */
  removeContent: boolean,
  /** Enable modmail notifications */
  modmailContent: boolean,
  /** Slack or Discord webhook URL */
  webhookURL: string,
};

/**
 * Structure for user data stored in Redis
 */
export type User = {
  /** Total number of mod mentions by user (all time) */
  count: number,
  /** List of recent Reddit object ids from user that mentioned mods */
  objects: string[],
};
