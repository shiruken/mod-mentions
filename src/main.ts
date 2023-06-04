import {
  Devvit, RedditAPIClient, Post, Comment, getSetting, 
  Context, SubredditContextActionEvent
} from '@devvit/public-api';
import { Metadata } from '@devvit/protos';

import { getUser, storeUser, getUsersCountSorted } from "./storage.js";

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
    name: 'webhookURL',
    label: 'Webhook URL (Slack or Discord)',
    helpText: 'Send notification to Slack or Discord about content that mentions a subreddit moderator',
    defaultValue: "",
    onValidate: (event) => {
      if (event.value && !(
           event.value?.startsWith("https://hooks.slack.com/") || 
           event.value?.startsWith("https://discord.com/api/webhooks/")
      )) {
        return "Must be valid Slack or Discord webhook URL";
      }
    }
  },
  {
    type: 'string',
    name: 'excludedMods',
    label: 'Exclude Moderators',
    helpText: 'Comma-separated list of subreddit moderators to exclude from notifications and actions (AutoModerator and mod-mentions app account excluded by default)'
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

Devvit.addAction({
  name: 'Mod Mentions Leaderboard',
  description: 'Get the Moderator Mentions leaderboard via Modmail',
  context: Context.SUBREDDIT,
  handler: generateLeaderboard
});

async function checkModMention(event: Devvit.MultiTriggerEvent, metadata?: Metadata) {

  const reportContent = await getSetting('reportContent', metadata) as boolean;
  const lockContent = await getSetting('lockContent', metadata) as boolean;
  const removeContent = await getSetting('removeContent', metadata) as boolean;
  const modmailContent = await getSetting('modmailContent', metadata) as boolean;
  const webhookURL = await getSetting('webhookURL', metadata) as string;

  if (!reportContent && !lockContent && !removeContent && !modmailContent && !webhookURL) {
    console.error('No actions are enabled in app configuration');
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

  // Skip content already tracked in user's recent history
  // Avoids repeated triggers caused by user editing
  const user = await getUser(object.authorName, metadata!);
  if (user.objects.includes(object.id)) {
    console.log(`${object.id} by u/${object.authorName} already tracked. Skipping.`);
    return;
  }

  let excludedMods = await getSetting('excludedMods', metadata) as string;
  excludedMods = excludedMods.replace(/(\/?u\/)|\s/g, ""); // Strip out user tags and spaces
  const excludedModsList = excludedMods.toLowerCase().split(",");
  excludedModsList.push('mod-mentions', 'automoderator'); // Always exclude app account and AutoModerator

  // Get list of subreddit moderators, excluding any defined in configuration
  // Has trouble on subreddits with a large number of moderators (e.g. r/science)
  const subreddit = await reddit.getSubredditById(String(event.event.subreddit?.id), metadata);
  const moderators = [];
  for await(const moderator of subreddit.getModerators()) {
    if (!excludedModsList.includes(moderator.username.toLowerCase())) {
      moderators.push(moderator.username);
    }
  }

  if (!moderators.length) {
    console.error(`All moderators are excluded: ${excludedModsList.join(', ')}`);
    return;
  }

  // Check if any subreddit moderators are mentioned
  // Not robust, only returns first mention and cannot handle substrings (e.g. u/spez vs. u/spez_bot)
  text = text.toLowerCase();
  const index = moderators.findIndex(m => text.includes(`u/${m.toLowerCase()}`));

  // Execute actions and send notifications
  if (index >= 0) {

    const moderator = moderators[index];
    console.log(`${object.id} mentions u/${moderator}`);

    // Track object and update user in kvstore
    user.count += 1;
    user.objects.push(object.id);
    try {
      await storeUser(object.authorName, user, metadata!);
    } catch(err) {
      console.error(`Error writing ${object.authorName} to KVStore: ${err}`);
    }

    if (user.count > 1) {
      console.log(`u/${object.authorName} has mentioned r/${subreddit.name} ` +
                  `moderators ${user.count.toLocaleString()} times`);
    }

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
        console.log(`Reported ${object.id}`);  
      } catch(err) {
        console.error(`Error reporting ${object.id}: ${err}`);
      }
    }

    // Lock Content
    if (lockContent) {
      try {
        await object.lock();
        console.log(`Locked ${object.id}`);  
      } catch(err) {
        console.error(`Error locking ${object.id}: ${err}`);
      }
    }

    // Remove Content
    if (removeContent) {
      try {
        await object.remove();
        console.log(`Removed ${object.id}`);  
      } catch(err) {
        console.error(`Error removing ${object.id}: ${err}`);
      }
    }
    
    // Send Modmail
    if (modmailContent) {
      const text = `The moderator u/${moderator} has been mentioned in a ${type}:\n\n` +
                   `* **Link:** https://www.reddit.com${object.permalink}\n\n` +
                   `* **User:** u/${object.authorName}` +
                   (('title' in object) ? `\n\n* **Title:** ${object.title}` : "") +
                   ((object.body) ? `\n\n* **Body:** ${object.body}` : "") +
                   ((user.count > 1) ? `\n\n^(u/${object.authorName} has mentioned r/${subreddit.name} ` + 
                                       `moderators ${user.count.toLocaleString()} times)` : "");

      try {
        await reddit.sendPrivateMessage(
          {
            to: `/r/${subreddit.name}`,
            subject: "Moderator Mentioned",
            text: text,
          },
          metadata
        );
        console.log(`Sent modmail about ${object.id}`);
      } catch(err) {
        console.error(`Error sending modmail about ${object.id}: ${err}`);
      }
    }

    // Send to Slack
    if (webhookURL && webhookURL.startsWith("https://hooks.slack.com/")) {
      const slackPayload = {
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `The moderator <https://www.reddit.com/user/${moderator}|u/${moderator}> ` +
                    `has been mentioned in a ${type}:`
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
                      ((object.body) ? `\n*Body:* ${object.body}` : "") +
                      ((user.count > 1) ? `\n\n_u/${object.authorName} has mentioned r/${subreddit.name} ` +
                                          `moderators ${user.count.toLocaleString()} times_` : "")
              }
            ]
          }
        ]
      };
      
      try {
        await fetch(webhookURL, {
          method: 'POST',
          body: JSON.stringify(slackPayload)
        });
        console.log(`Sent Slack message about ${object.id}`);
      } catch(err) {
        console.error(`Error sending Slack message about ${object.id}: ${err}`);
      }
    }

    // Send to Discord
    if (webhookURL && webhookURL.startsWith("https://discord.com/api/webhooks/")) {
      const discordPayload = {
        username: "Moderator Mentions",
        content: `The moderator [u/${moderator}](https://www.reddit.com/user/${moderator}) ` +
                 `has been mentioned in a ${type}`,
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
            ],
            footer: {
              text: '\u200b'
            }
          }
        ]
      };

      if ('title' in object) {
        discordPayload.embeds[0].fields.push({
          name: "Title",
          value: object.title
        });
      }

      if (object.body) {
        discordPayload.embeds[0].fields.push({
          name: "Body",
          value: object.body
        });
      }

      if (user.count > 1) {
        discordPayload.embeds[0].footer.text = `u/${object.authorName} has mentioned r/${subreddit.name} ` +
                                               `moderators ${user.count.toLocaleString()} times`;
      }

      try {
        await fetch(webhookURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(discordPayload)
        });
        console.log(`Sent Discord message about ${object.id}`);
      } catch(err) {
        console.error(`Error sending Discord message about ${object.id}: ${err}`);
      }
    }
  }
}

async function generateLeaderboard(event: SubredditContextActionEvent, metadata?: Metadata) {

  const currentUser = await reddit.getCurrentUser(metadata);
  console.log(`u/${currentUser.username} requested the leaderboard`);

  const leaderboard = await getUsersCountSorted(metadata!);
  if (!leaderboard.length) {
    console.warn(`Unable to generate leaderboard. No users tracked yet.`);
    return { success: false, message: 'No users tracked yet, unable to generate leaderboard!' };
  }

  // Generate Top 10 table
  let table = "|**Rank**|**Username**|**Count**|\n" +
              "|--:|:--|:--|\n";
  for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
    table += `|${i + 1}|u/${leaderboard[i][0]}|${leaderboard[i][1].toLocaleString()}|\n`;
  }

  // Send via Modmail
  const subreddit = await reddit.getSubredditById("t5_" + String(event.subreddit.id), metadata);
  const text = `###### Most Moderator Mentions in r/${subreddit.name}\n\n` +
               `${table}\n` +
               `^(Tracking ${leaderboard.length.toLocaleString()} users in r/${subreddit.name}. ` +
               `Generated by) [^Moderator ^Mentions.](https://developers.reddit.com/apps/mod-mentions)`;

  try {
    await reddit.sendPrivateMessage(
      {
        to: `/r/${subreddit.name}`,
        subject: "Moderator Mentions Leaderboard",
        text: text,
      },
      metadata
    );
    return { success: true, message: 'Check Modmail for the leaderboard!' };
  } catch(err) {
    console.error(`Error sending leaderboard modmail: ${err}`);
    return { success: false, message: 'Error generating leaderboard!' };
  }
}

export default Devvit;