import { getSettings } from "@devvit/public-api";
import { SettingsFormField, SettingsFormFieldValidatorEvent } from "@devvit/public-api/settings/types.js";
import { Metadata } from "@devvit/protos";

import { Settings } from './types.js';

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
    defaultValue: false
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
    helpText: 'Comma-separated list of subreddit moderators to exclude from notifications and actions (AutoModerator and mod-mentions app account excluded by default)'
  }
];

/**
 * Validates webhook URL string from app configuration
 * @param event
 * @returns If invalid, returns a string containing an error message
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
 * @returns A Promise that resolves to `Settings` object
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