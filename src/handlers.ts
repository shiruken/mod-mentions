import { Comment, Context, MenuItemOnPressEvent, Post, TriggerContext } from '@devvit/public-api';
import { AppInstall, AppUpgrade, CommentSubmit, CommentUpdate, ModAction, PostSubmit, PostUpdate } from '@devvit/protos';
import { getValidatedSettings } from './settings.js';
import { getModerators, getUserData, getUsersCountSorted, storeModerators, storeUserData } from './storage.js';

/**
 * Checks post for moderator mentions
 * @param event An PostSubmit or PostUpdate object
 * @param context A TriggerContext object
 */
export async function onPostEvent(event: PostSubmit | PostUpdate, context: TriggerContext) {
  const authorName = event.author?.name;
  if (!authorName) {
    throw new Error('Missing authorName in onPostEvent');
  }

  if (authorName == "AutoModerator") {
    return;
  }

  const post = event.post;
  if (!post) {
    throw new Error('Missing post in onPostEvent');
  }

  const text = post.title + " " + post.selftext;
  await checkModMention(post.id, authorName, text, context);
}

/**
 * Checks comment for moderator mentions
 * @param event An CommentSubmit or CommentUpdate object
 * @param context A TriggerContext object
 */
export async function onCommentEvent(event: CommentSubmit | CommentUpdate, context: TriggerContext) {
  const authorName = event.author?.name;
  if (!authorName) {
    throw new Error('Missing authorName in onCommentEvent');
  }

  if (authorName === "AutoModerator") {
    return;
  }

  const comment = event.comment;
  if (!comment) {
    throw new Error('Missing comment in onCommentEvent');
  }

  await checkModMention(comment.id, authorName, comment.body, context);
}

/**
 * Checks content for moderator mentions and performs actions and 
 * sends notifications according to the installation's app settings
 * @param id Reddit post or comment ID (with 't1_' or 't3_' prefix)
 * @param context A TriggerContext object
 */
async function checkModMention(id: string, authorName: string, text: string, context: TriggerContext) {
  // Skip content already tracked in user's recent history
  // Avoids repeated triggers caused by editing
  const user = await getUserData(authorName, context);
  if (user.objects.includes(id)) {
    console.log(`${id} by u/${authorName} already tracked. Skipping.`);
    return;
  }

  const settings = await getValidatedSettings(context);
  const excludedMods = settings.excludedMods.replace(/(\/?u\/)|\s/g, ""); // Strip out user tags and spaces
  const excludedModsList = (excludedMods == "") ? [] : excludedMods.toLowerCase().split(",");
  excludedModsList.push('mod-mentions', 'automoderator'); // Always exclude app account and AutoModerator

  // Get cached modlist
  let moderators = await getModerators(context);
  if (!moderators) {
    console.log('Cached modlist is empty, attempting to refresh');
    await refreshModerators(context);
    moderators = await getModerators(context);
    if (!moderators) {
      throw new Error('Modlist refresh failed');
    }
  }

  // Identify monitored moderators
  const modWatchList: string[] = [];
  moderators.forEach(moderator => {
    if (!excludedModsList.includes(moderator.toLowerCase())) {
      modWatchList.push(moderator);
    }
  });

  if (!modWatchList.length) {
    throw new Error(`All moderators are excluded: ${excludedModsList.join(', ')}`);
  }

  // Check if any subreddit moderators are mentioned
  // Not robust, only returns first mention and cannot handle substrings (e.g. u/spez vs. u/spez_bot)
  const text_lowercase = text.toLowerCase();
  const index = modWatchList.findIndex(m => text_lowercase.includes(`u/${m.toLowerCase()}`));
  const mentionedMod = modWatchList[index];

  // Execute actions and send notifications
  if (mentionedMod !== undefined) {

    let object: Post | Comment;
    let type: string;
    if (id.includes("t3_")) {
      object = await context.reddit.getPostById(id);
      type = "post";
    } else {
      object = await context.reddit.getCommentById(id);
      type = "comment";
    }

    console.log(`${object.id} mentions u/${mentionedMod}`);

    // Track object and update user in Redis
    user.count += 1;
    user.objects.push(object.id);
    await storeUserData(object.authorName, user, context);
    if (user.count > 1) {
      console.log(`u/${object.authorName} has mentioned r/${object.subredditName} ` +
                  `moderators ${user.count.toLocaleString()} times`);
    }

    // Report Content
    if (settings.reportContent) {
      await context.reddit
        .report(object, { reason: `Mentions moderator u/${mentionedMod}` })
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
      const body = `The moderator u/${mentionedMod} has been mentioned in a ${type}:\n\n` +
                   `* **Link:** https://www.reddit.com${object.permalink}\n\n` +
                   `* **User:** u/${object.authorName}` +
                   (('title' in object) ? `\n\n* **Title:** ${object.title}` : "") +
                   ((object.body) ? `\n\n* **Body:** ${object.body}` : "") +
                   ((user.count > 1) ? `\n\n^(u/${object.authorName} has mentioned r/${object.subredditName} ` + 
                                       `moderators ${user.count.toLocaleString()} times)` : "");
      await context.reddit.modMail.createConversation({
        to: "mod-mentions",
        subject: "Moderator Mentioned",
        body: body,
        subredditName: object.subredditName,
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
              text: `The moderator <https://www.reddit.com/user/${mentionedMod}|u/${mentionedMod}> ` +
                    `has been mentioned in a ${type}`
            }
          }
        ],
        attachments: [
          {
            color: "#FF4500", // OrangeRed
            blocks: [
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `https://www.reddit.com${object.permalink}\n` +
                          `*User:* <https://www.reddit.com/user/${object.authorName}|u/${object.authorName}>` +
                          (('title' in object) ? `\n*Title:* ${object.title}` : "") +
                          ((object.body) ? `\n*Body:* ${object.body}` : "") +
                          ((user.count > 1) ? `\n\n_u/${object.authorName} has mentioned r/${object.subredditName} ` +
                                              `moderators ${user.count.toLocaleString()} times_` : "")
                  }
                ]
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
        avatar_url: "https://raw.githubusercontent.com/shiruken/mod-mentions/main/assets/avatar.jpg",
        content: `The moderator [u/${mentionedMod}](https://www.reddit.com/user/${mentionedMod}) ` +
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
        discordPayload.embeds[0].footer.text = `u/${object.authorName} has mentioned r/${object.subredditName} ` +
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
 * @param _event A MenuItemOnPressEvent object
 * @param context A Context object
 */
export async function generateLeaderboard(_event: MenuItemOnPressEvent, context: Context) {
  const currentUser = await context.reddit.getCurrentUser();
  console.log(`u/${currentUser.username} requested the leaderboard`);

  const leaderboard = await getUsersCountSorted(context);
  if (!leaderboard.length) {
    console.error('Unable to generate leaderboard. No users tracked yet.');
    context.ui.showToast({
      appearance: "neutral", // No error appearance yet
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
  const subreddit = await context.reddit.getCurrentSubreddit();
  const body = `###### Most Moderator Mentions in r/${subreddit.name}\n\n` +
               `${table}\n` +
               `^(Tracking ${leaderboard.length.toLocaleString()} users in r/${subreddit.name}. ` +
               `Generated by) [^Moderator ^Mentions](https://developers.reddit.com/apps/mod-mentions)^(. ` +
               `Requested by u/${currentUser.username}.)`;

  await context.reddit.modMail
    .createConversation({
      to: "mod-mentions",
      subject: "Moderator Mentions Leaderboard",
      body: body,
      subredditName: subreddit.name,
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

/**
 * Cache modlist during app install or upgrade
 * @param event An AppInstall or AppUpgrade object
 * @param context A TriggerContext object
 */
export async function onAppChanged(_event: AppInstall | AppUpgrade, context: TriggerContext) {
  await context.redis
    .del("mods")
    .then(() => console.log("Cleared cached modlist on app change"));
  
  // Migrate existing KV Store data to Redis 'user' hash
  const keys = await context.kvStore.list();
  keys.forEach(async key => {
    if (key === "users" || key === "mods") {
      return;
    }
    if (key != "$mods") {
      console.log(`Migrating KVStore data for u/${key} to Redis 'user' hash`);
      const value = await context.redis.get(key);
      if (value) {
        await context.redis.hset("users", {[key]: value});
      }
    }
    await context.kvStore.delete(key);
  });

  await refreshModerators(context);
}

/**
 * Update cached modlist on modlist change
 * @param event A ModAction object
 * @param context A TriggerContext object
 */
export async function onModAction(event: ModAction, context: TriggerContext) {
  const action = event.action;
  if (!action) {
    throw new Error(`Missing action in onModAction`);
  }
  const actions = ['acceptmoderatorinvite', 'addmoderator', 'removemoderator', 'reordermoderators'];
  if (actions.includes(action)) {
    await context.redis
      .del("mods")
      .then(() => console.log(`Cleared cached modlist on ${action}`));
    await refreshModerators(context);
  }
}

/**
 * Refresh cached subreddit modlist
 * @param context A TriggerContext object
 */
async function refreshModerators(context: TriggerContext) {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const moderators: string[] = [];
  try {
    for await(const moderator of subreddit.getModerators({ pageSize: 500 })) {
      moderators.push(moderator.username);
    }
  } catch (err) {
    throw new Error(`Error fetching modlist for r/${subreddit.name}: ${err}`);
  }
  if (!moderators.length) {
    throw new Error(`Fetched modlist for r/${subreddit.name} is empty, skipping cache update`);
  }
  await storeModerators(moderators, context);
}
