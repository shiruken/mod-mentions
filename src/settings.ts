import { SettingsFormField, SettingsFormFieldValidatorEvent, TriggerContext } from '@devvit/public-api';

/**
 * App configuration data structure
 * @property {string} excludedMods: Moderators excluded from actions and notifications
 * @property {boolean} requirePrefix: Mentions must contain the u/ prefix
 * @property {boolean} reportContent: Enable content reporting
 * @property {boolean} lockContent: Enable content locking
 * @property {boolean} removeContent: Enable content removal
 * @property {boolean} modmailContent: Enable modmail notification
 * @property {string} webhookURL: Slack or Discord webhook URL
 */
interface Settings {
  excludedMods: string,
  requirePrefix: boolean,
  reportContent: boolean,
  lockContent: boolean,
  removeContent: boolean,
  modmailContent: boolean,
  webhookURL: string,
};

export const configSettings: SettingsFormField[] = [
  {
    type: 'boolean',
    name: 'requirePrefix',
    label: 'Require u/ prefix',
    helpText: 'Mentions must contain the u/ username-linking prefix. Disable to check for any match.',
    defaultValue: true,
  },
  {
    type: 'string',
    name: 'excludedMods',
    label: 'Excluded Moderators',
    helpText: 'Ignore mentions of these moderators, entered as a comma-separated list (AutoModerator and app account automatically excluded)',
    defaultValue: '',
  },
  {
    type: 'group',
    label: 'Actions',
    fields: [
      {
        type: 'boolean',
        name: 'reportContent',
        label: 'Report Content',
        helpText: 'Submit report on content that mentions a subreddit moderator',
        defaultValue: false,
      },
      {
        type: 'boolean',
        name: 'lockContent',
        label: 'Lock Content',
        helpText: 'Lock content that mentions a subreddit moderator',
        defaultValue: false,
      },
      {
        type: 'boolean',
        name: 'removeContent',
        label: 'Remove Content',
        helpText: 'Remove content that mentions a subreddit moderator',
        defaultValue: false,
      },
    ],
  },
  {
    type: 'group',
    label: 'Notifications',
    fields: [
      {
        type: 'boolean',
        name: 'modmailContent',
        label: 'Send Modmail',
        helpText: 'Send modmail about content that mentions a subreddit moderator',
        defaultValue: true,
      },
      {
        type: 'string',
        name: 'webhookURL',
        label: 'Webhook URL (Slack or Discord)',
        helpText: 'Enter webhook URL to send reports via Slack or Discord',
        defaultValue: '',
        onValidate: validateWebhookURL,
      },
    ],
  },
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
    throw new Error('No actions or notifications are enabled in app configuration');
  }

  return settings;
}
