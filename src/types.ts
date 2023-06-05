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

/**
 * Settings
 *
 * @typeParam reportContent - Enable content reporting
 * @typeParam lockContent - Enable content locking
 * @typeParam removeContent - Enable content removal
 * @typeParam modmailContent - Enable modmail notification
 * @typeParam webhookURL - Slack or Discord webhook URL
 * @typeParam excludedMods - Moderators excluded from actions and notifications
 */
export type Settings = {
  reportContent: boolean,
  lockContent: boolean,
  removeContent: boolean,
  modmailContent: boolean,
  webhookURL: string,
  excludedMods: string
};