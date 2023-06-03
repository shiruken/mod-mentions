import { Devvit, RedditAPIClient, Post, Comment, getSetting } from '@devvit/public-api';
import { Metadata } from '@devvit/protos';

const reddit = new RedditAPIClient();
const lc = Devvit.use(Devvit.Types.RedditAPI.LinksAndComments);
Devvit.use(Devvit.Types.HTTP);

Devvit.addSettings([
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
    name: 'slackWebhook',
    label: 'Slack Webhook URL',
    helpText: 'Send notification to Slack about content that mentions a subreddit moderator',
    defaultValue: "",
    onValidate: (event) => {
      if (event.value && !(event.value?.startsWith("https://hooks.slack.com/")))
        return "Must be valid Slack webhook URL";
    }
  },
  {
    type: 'string',
    name: 'discordWebhook',
    label: 'Discord Webhook URL',
    helpText: 'Send notification to Discord about content that mentions a subreddit moderator',
    defaultValue: "",
    onValidate: (event) => {
      if (event.value && !(event.value?.startsWith("https://discord.com/api/webhooks/")))
        return "Must be valid Discord webhook URL";
    }
  },
  {
    type: 'string',
    name: 'excludedMods',
    label: 'Exclude Moderators',
    helpText: 'Comma-separated list of subreddit moderators to exclude from notifications and actions',
    defaultValue: "AutoModerator"
  },
  {
    type: 'boolean',
    name: 'includeEdited',
    label: 'Include Edited Content',
    helpText: 'Watch for edited content that mentions a subreddit moderator',
    defaultValue: false
  }
]);

Devvit.addTrigger({
  events: [
    Devvit.Trigger.PostSubmit,
    Devvit.Trigger.PostUpdate,
    Devvit.Trigger.CommentSubmit,
    Devvit.Trigger.CommentUpdate
  ],
  handler: checkModMention
});

async function checkModMention(event: Devvit.MultiTriggerEvent, metadata?: Metadata) {

  const includeEdited = await getSetting('includeEdited', metadata) as boolean;
  const isEdit = (event.type === Devvit.Trigger.PostUpdate) || (event.type === Devvit.Trigger.CommentUpdate);
  if (!includeEdited && isEdit)
    return;

  const reportContent = await getSetting('reportContent', metadata) as boolean;
  const lockContent = await getSetting('lockContent', metadata) as boolean;
  const removeContent = await getSetting('removeContent', metadata) as boolean;
  const modmailContent = await getSetting('modmailContent', metadata) as boolean;
  const slackWebhook = await getSetting('slackWebhook', metadata) as string;
  const discordWebhook = await getSetting('discordWebhook', metadata) as string;

  if (!reportContent && !lockContent && !removeContent && !modmailContent && !slackWebhook && !discordWebhook) {
    console.error('No actions are enabled in app configuration');
    return;
  }

  let excludedMods = await getSetting('excludedMods', metadata) as string;
  excludedMods = excludedMods.replace(/(\/?u\/)|\s/g, ""); // Strip out user tags and spaces
  const excludedModsList = excludedMods.toLowerCase().split(",");
  excludedModsList.push('mod-mentions'); // Exclude app account

  // Get list of subreddit moderators, excluding any defined in configuration
  // Has trouble on subreddits with a large number of moderators (e.g. r/science)
  const subreddit = await reddit.getSubredditById(String(event.event.subreddit?.id), metadata);
  const moderators = [];
  for await(const moderator of subreddit.getModerators())
    if (!excludedModsList.includes(moderator.username.toLowerCase()))
      moderators.push(moderator.username);

  if (!moderators.length) {
    console.error(`All moderators are excluded: ${excludedModsList.join(', ')}`);
    return;
  }

  let object: Post | Comment;
  let text: string;
  let type: string;
  if (event.type === Devvit.Trigger.PostSubmit || event.type === Devvit.Trigger.PostUpdate) {
    type = "post";
    object = await reddit.getPostById(String(event.event.post?.id), metadata);
    text = object.title + " " + String(object.body);
  } else if (event.type === Devvit.Trigger.CommentSubmit || event.type === Devvit.Trigger.CommentUpdate) {
    type = "comment";
    object = await reddit.getCommentById(String(event.event.comment?.id), metadata);
    text = object.body;
  } else {
    console.error('Unexpected trigger type: %d', event.type);
    return;
  }

  // Check if any subreddit moderators are mentioned
  // Not robust, only returns first mention and cannot handle substrings (e.g. u/spez vs. u/spez_bot)
  text = text.toLowerCase();
  const index = moderators.findIndex(m => text.includes(`u/${m.toLowerCase()}`));

  // Execute actions and send notifications
  if (index >= 0) {

    const moderator = moderators[index];
    console.log(`${object.id}${ isEdit ? " (edited) " : " " }mentions u/${moderator}`);

    // Report Content
    if (reportContent) {
      try {
        await lc.Report(
          {
            thingId: object.id,
            reason: `Mentions moderator u/${moderator}`
          },
          metadata
        );
        console.log(`Reported ${object.id}${ isEdit ? " (edited)" : "" }`);  
      } catch(err) {
        console.error(`Error reporting ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }

    // Lock Content
    if (lockContent) {
      try {
        await object.lock();
        console.log(`Locked ${object.id}${ isEdit ? " (edited)" : "" }`);  
      } catch(err) {
        console.error(`Error locking ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }

    // Remove Content
    if (removeContent) {
      try {
        await object.remove();
        console.log(`Removed ${object.id}${ isEdit ? " (edited)" : "" }`);  
      } catch(err) {
        console.error(`Error removing ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }
    
    // Send Modmail
    if (modmailContent) {
      const text = `The moderator u/${moderator} has been mentioned in ${ isEdit ? "an edited" : "a" } ${type}:\n\n` +
                   `* **Link:** https://www.reddit.com${object.permalink}\n\n` +
                   `* **User:** u/${object.authorName}` +
                   (('title' in object) ? `\n\n* **Title:** ${object.title}` : "") +
                   ((object.body) ? `\n\n* **Body:** ${object.body}` : "");

      try {
        await reddit.sendPrivateMessage(
          {
            to: `/r/${subreddit.name}`,
            subject: "Moderator Mentioned",
            text: text,
          },
          metadata
        );
        console.log(`Sent modmail about ${object.id}${ isEdit ? " (edited)" : "" }`);
      } catch(err) {
        console.error(`Error sending modmail about ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }

    // Send to Slack
    if (slackWebhook) {
      const slackPayload = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `The moderator <https://www.reddit.com/user/${moderator}|u/${moderator}> ` +
                    `has been mentioned in ${ isEdit ? "an edited" : "a" } ${type}:`
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `https://www.reddit.com${object.permalink}\n` +
                      `*User:* <https://www.reddit.com/user/${object.authorName}|u/${object.authorName}>` +
                      (('title' in object) ? `\n*Title:* ${object.title}` : "") +
                      ((object.body) ? `\n*Body:* ${object.body}` : "")
              }
            ]
          }
        ]
      };
      
      try {
        await fetch(slackWebhook, {
          method: 'POST',
          body: JSON.stringify(slackPayload)
        });
        console.log(`Sent Slack message about ${object.id}${ isEdit ? " (edited)" : "" }`);
      } catch(err) {
        console.error(`Error sending Slack message about ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }

    // Send to Discord
    if (discordWebhook) {
      const discordPayload = {
        username: "Moderator Mentions",
        content: `The moderator [u/${moderator}](https://www.reddit.com/user/${moderator}) ` +
                 `has been mentioned in ${ isEdit ? "an edited" : "a" } ${type}`,
        embeds: [
          {
            color: 16711680, // #FF0000
            fields: [
              {
                name: "Link",
                value: `https://www.reddit.com${object.permalink}`
              },
              {
                name: "User",
                value: `[u/${object.authorName}](https://www.reddit.com/user/${object.authorName})`
              }
            ]
          }
        ]
      };

      if ('title' in object)
        discordPayload.embeds[0].fields.push({
          name: "Title",
          value: object.title
        });

      if (object.body)
        discordPayload.embeds[0].fields.push({
          name: "Body",
          value: object.body
        });

      try {
        await fetch(discordWebhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(discordPayload)
        });
        console.log(`Sent Discord message about ${object.id}${ isEdit ? " (edited)" : "" }`);
      } catch(err) {
        console.error(`Error sending Discord message about ${object.id}${ isEdit ? " (edited)" : "" }: ${err}`);
      }
    }
  }
}

export default Devvit;