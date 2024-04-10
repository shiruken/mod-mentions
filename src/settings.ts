import { SettingsFormField, SettingsFormFieldValidatorEvent, TriggerContext } from '@devvit/public-api';

/**
 * App configuration data structure
 * @property {boolean} reportContent: Enable content reporting
 * @property {boolean} lockContent: Enable content locking
 * @property {boolean} removeContent: Enable content removal
 * @property {boolean} modmailContent: Enable modmail notification
 * @property {string} webhookURL: Slack or Discord webhook URL
 * @property {string} excludedMods: Moderators excluded from actions and notifications
 */
interface Settings {
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
    defaultValue: false
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
    helpText: 'Enter webhook URL to send reports via Slack or Discord',
    defaultValue: '',
    onValidate: validateWebhookURL
  },
  {
    type: 'string',
    name: 'excludedMods',
    label: 'Exclude Moderators',
    helpText: 'Ignore mentions of these moderators, entered as a comma-separated list (AutoModerator and app account excluded by default)',
    defaultValue: ''
  }
];

/**
 * Validates webhook URL string from app configuration
 * @param event A SettingsFormFieldValidatorEvent object
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
 * @param context A TriggerContext object
 * @returns A Promise that resolves to a {@link Settings} object
 */
export async function getValidatedSettings(context: TriggerContext): Promise<Settings> {
  const settings = await context.settings.getAll() as Settings;

  if (!settings.reportContent && !settings.lockContent && !settings.removeContent && 
      !settings.modmailContent && !settings.webhookURL)
  {
    throw new Error('No actions are enabled in app configuration');
  }

  return settings;
}
