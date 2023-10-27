import { Comment, Context, MenuItemOnPressEvent, OnTriggerEvent, Post, TriggerContext } from '@devvit/public-api';
import { CommentSubmit, CommentUpdate, PostSubmit, PostUpdate } from '@devvit/protos';
import { getValidatedSettings } from './settings.js';
import { getUserData, getUsersCountSorted, storeUserData } from './storage.js';

/**
 * Checks content for moderator mentions and performs actions and 
 * sends notifications according to installation's app settings
 * @param event A TriggerEvent object
 * @param context A TriggerContext object
 */
export async function checkModMention(event: OnTriggerEvent<any>, context: TriggerContext) {
  const authorName = event.author?.name;
  const subredditName = event.subreddit?.name;

  if (!authorName || !subredditName) {
    throw new Error(`Missing authorName (${authorName ?? ""}) or subredditName (${subredditName ?? ""}) in checkModMention`);
  }

  // Ignore content from AutoModerator
  if (authorName == "AutoModerator") {
    return;
  }

  const settings = await getValidatedSettings(context);
  const { reddit } = context;

  let object: Post | Comment;
  let text: string;
  let type: string;
  if (event.type === 'PostSubmit' || event.type === 'PostUpdate') {
    type = "post";
    object = await reddit.getPostById(event.post?.id);
    text = object.title + " " + String(object.body);
  } else if (event.type === 'CommentSubmit' || event.type === 'CommentUpdate') {
    type = "comment";
    object = await reddit.getCommentById(event.comment?.id);
    text = object.body;
  } else {
    throw new Error(`Unexpected trigger type: ${event.type}`);
  }

  // Skip content already tracked in user's recent history
  // Avoids repeated triggers caused by user editing
  const user = await getUserData(authorName, context);
  if (user.objects.includes(object.id)) {
    console.log(`${object.id} by u/${authorName} already tracked. Skipping.`);
    return;
  }

  const excludedMods = settings.excludedMods.replace(/(\/?u\/)|\s/g, ""); // Strip out user tags and spaces
  const excludedModsList = (excludedMods == "") ? [] : excludedMods.toLowerCase().split(",");
  excludedModsList.push('mod-mentions', 'automoderator'); // Always exclude app account and AutoModerator

  // Get list of subreddit moderators, excluding any defined in configuration
  // Has trouble on subreddits with a large number of moderators (e.g. r/science)
  const moderators: string[] = [];
  try {
    for await(const moderator of reddit.getModerators({ subredditName: subredditName })) {
      if (!excludedModsList.includes(moderator.username.toLowerCase())) {
        moderators.push(moderator.username);
      }
    }
  } catch (err) {
    throw new Error(`Error fetching modlist for r/${subredditName}: ${err}`);
  }

  if (!moderators.length) {
    throw new Error(`All moderators are excluded: ${excludedModsList.join(', ')}`);
  }

  // Check if any subreddit moderators are mentioned
  // Not robust, only returns first mention and cannot handle substrings (e.g. u/spez vs. u/spez_bot)
  text = text.toLowerCase();
  const index = moderators.findIndex(m => text.includes(`u/${m.toLowerCase()}`));
  const moderator = moderators[index];

  // Execute actions and send notifications
  if (moderator !== undefined) {

    console.log(`${object.id} mentions u/${moderator}`);

    // Track object and update user in Redis
    user.count += 1;
    user.objects.push(object.id);
    await storeUserData(authorName, user, context);

    if (user.count > 1) {
      console.log(`u/${authorName} has mentioned r/${subredditName} ` +
                  `moderators ${user.count.toLocaleString()} times`);
    }

    // Report Content
    if (settings.reportContent) {
      await reddit
        .report(object, { reason: `Mentions moderator u/${moderator}` })
        .then(() => console.log(`Reported ${object.id}`))
        .catch((e) => console.error(`Error reporting ${object.id}`, e));
    }

    // Lock Content
    if (settings.lockContent) {
      await object
        .lock()
        .then(() => console.log(`Locked ${object.id}`))
        .catch((e) => console.error(`Error locking ${object.id}`, e));
    }

    // Remove Content
    if (settings.removeContent) {
      await object
        .remove()
        .then(() => console.log(`Removed ${object.id}`))
        .catch((e) => console.error(`Error removing ${object.id}`, e));
    }
    
    // Send Modmail
    if (settings.modmailContent) {
      const text = `The moderator u/${moderator} has been mentioned in a ${type}:\n\n` +
                   `* **Link:** https://www.reddit.com${object.permalink}\n\n` +
                   `* **User:** u/${authorName}` +
                   (('title' in object) ? `\n\n* **Title:** ${object.title}` : "") +
                   ((object.body) ? `\n\n* **Body:** ${object.body}` : "") +
                   ((user.count > 1) ? `\n\n^(u/${authorName} has mentioned r/${subredditName} ` + 
                                       `moderators ${user.count.toLocaleString()} times)` : "");

      await reddit
        .sendPrivateMessage({
          to: `/r/${subredditName}`,
          subject: 'Moderator Mentioned',
          text: text,
        })
        .then(() => console.log(`Sent modmail about ${object.id}`))
        .catch((e) => console.error(`Error sending modmail about ${object.id}`, e));
    }

    // Send to Slack
    if (settings.webhookURL && settings.webhookURL.startsWith("https://hooks.slack.com/")) {
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
                      `*User:* <https://www.reddit.com/user/${authorName}|u/${authorName}>` +
                      (('title' in object) ? `\n*Title:* ${object.title}` : "") +
                      ((object.body) ? `\n*Body:* ${object.body}` : "") +
                      ((user.count > 1) ? `\n\n_u/${authorName} has mentioned r/${subredditName} ` +
                                          `moderators ${user.count.toLocaleString()} times_` : "")
              }
            ]
          }
        ]
      };

      await fetch(settings.webhookURL, {
        method: 'POST',
        body: JSON.stringify(slackPayload),
      })
        .then(() => console.log(`Sent Slack message about ${object.id}`))
        .catch((e) => console.error(`Error sending Slack message about ${object.id}`, e));
    }

    // Send to Discord
    if (settings.webhookURL && settings.webhookURL.startsWith("https://discord.com/api/webhooks/")) {
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
                value: `[u/${authorName}](https://www.reddit.com/user/${authorName})`
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
        discordPayload.embeds[0].footer.text = `u/${authorName} has mentioned r/${subredditName} ` +
                                               `moderators ${user.count.toLocaleString()} times`;
      }

      await fetch(settings.webhookURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordPayload),
      })
        .then(() => console.log(`Sent Discord message about ${object.id}`))
        .catch((e) => console.error(`Error sending Discord message about ${object.id}`, e));
    }
  }
}

/**
 * Generates leaderboard for users with most moderator mentions
 * and sends message to subreddit via Modmail
 * @param event A TriggerEvent object
 * @param context A Context object
 */
export async function generateLeaderboard(event: MenuItemOnPressEvent, context: Context) {
  const { reddit } = context;  
  const currentUser = await reddit.getCurrentUser();
  console.log(`u/${currentUser.username} requested the leaderboard`);

  const subredditID = event.targetId;

  const leaderboard = await getUsersCountSorted(context);
  if (!leaderboard.length) {
    console.error('Unable to generate leaderboard. No users tracked yet.');
    context.ui.showToast({
      appearance: "neutral",
      text: "No users tracked yet, unable to generate leaderboard!",
    });
  }

  // Generate Top 10 table
  let table = "|**Rank**|**Username**|**Count**|\n" +
              "|--:|:--|:--|\n";
  for (let i = 0; i < Math.min(10, leaderboard.length); i++) {
    table += `|${i + 1}|u/${leaderboard[i][0]}|${leaderboard[i][1].toLocaleString()}|\n`;
  }

  // Send via Modmail
  const subreddit = await reddit.getSubredditById(subredditID);
  const text = `###### Most Moderator Mentions in r/${subreddit.name}\n\n` +
               `${table}\n` +
               `^(Tracking ${leaderboard.length.toLocaleString()} users in r/${subreddit.name}. ` +
               `Generated by) [^Moderator ^Mentions.](https://developers.reddit.com/apps/mod-mentions)`;

  await reddit
    .sendPrivateMessage({
      to: `/r/${subreddit.name}`,
      subject: "Moderator Mentions Leaderboard",
      text: text,
    })
    .then(() => {
      console.log('Sent modmail with leaderboard');
      context.ui.showToast({
        appearance: 'success',
        text: 'Check Modmail for the leaderboard!',
      });    
    })
    .catch((e) => {
      console.error("Error sending leaderboard modmail", e);
      context.ui.showToast({
        appearance: 'neutral', // No error appearance yet
        text: 'Error generating leaderboard!',
      });
    }); 
}