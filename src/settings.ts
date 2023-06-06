import { getSettings } from "@devvit/public-api";
import { SettingsFormField, SettingsFormFieldValidatorEvent } from "@devvit/public-api/settings/types.js";
import { Metadata } from "@devvit/protos";

/**
 * Settings
 * @typeParam reportContent: Enable content reporting
 * @typeParam lockContent: Enable content locking
 * @typeParam removeContent: Enable content removal
 * @typeParam modmailContent: Enable modmail notification
 * @typeParam webhookURL: Slack or Discord webhook URL
 * @typeParam excludedMods: Moderators excluded from actions and notifications
 */
export type Settings = {
  reportContent: boolean,
  lockContent: boolean,
  removeContent: boolean,
  modmailContent: boolean,
  webhookURL: string,
  excludedMods: string
};

export const configSettings: SettingsFormField[] = [
  {
    type: 'boolean',
    name: 'reportContent',
    label: 'Report Content',
    helpText: 'Submit report on content that mentions a subreddit moderator',
    defaultValue: true
  },
  {
    type: 'boolean',
    name: 'lockContent',
    label: 'Lock Content',
    helpText: 'Lock content that mentions a subreddit moderator',
    defaultValue: false
  },
  {
    type: 'boolean',
    name: 'removeContent',
    label: 'Remove Content',
    helpText: 'Remove content that mentions a subreddit moderator',
    defaultValue: false
  },
  {
    type: 'boolean',
    name: 'modmailContent',
    label: 'Send Modmail',
    helpText: 'Send modmail about content that mentions a subreddit moderator',
    defaultValue: true
  },
  {
    type: 'string',
    name: 'webhookURL',
    label: 'Webhook URL (Slack or Discord)',
    helpText: 'Enter webhook URL to send notification to Slack or Discord about content that mentions a subreddit moderator',
    defaultValue: "",
    onValidate: validateWebhookURL
  },
  {
    type: 'string',
    name: 'excludedMods',
    label: 'Exclude Moderators',
    helpText: 'Comma-separated list of subreddit moderators to exclude from actions and notifications (AutoModerator and mod-mentions excluded by default)',
    defaultValue: "",
  }
];

/**
 * Validates webhook URL string from app configuration
 * @param event
 * @returns Returns a string containing an error message if invalid
 */
function validateWebhookURL(event: SettingsFormFieldValidatorEvent<string>): void | string {
  if (event.value &&
      !(
        event.value?.startsWith("https://hooks.slack.com/") ||
        event.value?.startsWith("https://discord.com/api/webhooks/")
      )
  ) {
    return "Must be valid Slack or Discord webhook URL";
  }
}

/**
 * Load, validate, and return current app configuration settings 
 * @param metadata Metadata from the originating handler
 * @returns A Promise that resolves to a {@link Settings} object
 */
export async function getValidatedSettings(metadata?: Metadata): Promise<Settings> {
  const settings = await getSettings(metadata) as Settings;

  if (!settings.reportContent && !settings.lockContent && !settings.removeContent && 
      !settings.modmailContent && !settings.webhookURL)
  {
    throw new Error('No actions are enabled in app configuration');
  }

  return settings;
}