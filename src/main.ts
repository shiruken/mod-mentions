import {
  Devvit,
  RedditAPIClient,
 } from '@devvit/public-api';
import { CommentSubmit, Metadata } from '@devvit/protos';

const reddit = new RedditAPIClient();
const lc = Devvit.use(Devvit.Types.RedditAPI.LinksAndComments);
Devvit.use(Devvit.Types.HTTP);

Devvit.addTrigger({
  event: Devvit.Trigger.CommentSubmit,
  handler: checkCommentModMention
});

async function checkCommentModMention(event: CommentSubmit, metadata?: Metadata) {
  const subreddit = await reddit.getSubredditById(String(event.subreddit?.id), metadata);
  const moderators = [];
  for await(const moderator of subreddit.getModerators())
    moderators.push(moderator.username);

  // Check if any subreddit moderators are mentioned in comment text
  // Not robust, only returns first mention and cannot handle substrings (e.g. u/spez vs. u/spez_bot)
  const comment = await reddit.getCommentById(String(event.comment?.id), metadata);
  const bodyLowerCase = comment.body.toLowerCase();
  const index = moderators.findIndex(v => bodyLowerCase.includes(`u/${v.toLowerCase()}`));

  if (index >= 0) {

    const moderator = moderators[index];
    console.log(`${comment.id} mentions u/${moderator}`);

    // Report Comment
    await lc.Report(
      {
        thingId: comment.id,
        reason: `Comment mentions the moderator u/${moderator}`
      },
      metadata
    );
    console.log(`Reported ${comment.id}`);
  
    // Lock Comment
    await comment.lock();
    console.log(`Locked ${comment.id}`);
  
    // Remove Comment
    await comment.remove();
    console.log(`Removed ${comment.id}`);

    // Send Modmail
    const permalink = `https://www.reddit.com/r/${subreddit.name}` + 
                      `/comments/${comment.postId.slice(3)}` +
                      `/comment/${comment.id.slice(3)}/`;
    const text = `The following comment by u/${comment.authorName} mentions the moderator u/${moderator}:\n\n` +
                 `**Link:** ${permalink}\n\n` +
                 `**Body:** ${comment.body}`
    await reddit.sendPrivateMessage(
      {
        to: `/r/${subreddit.name}`,
        subject: "Moderator Mentioned",
        text: text,
      },
      metadata
    );
    console.log(`Sent modmail about ${comment.id}`);

    // Send to Slack
    const slack_payload = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `u/${moderator} has been mentioned in a comment:`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Link:* ${permalink}\n` +
                    `*User:* <https://www.reddit.com/user/${comment.authorName}|u/${comment.authorName}>\n` + 
                    `*Body:* ${comment.body}`
            }
          ]
        }
      ]
    };
    const slack_webhook = "https://hooks.slack.com/services/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";
    await fetch(slack_webhook, {
      method: 'POST',
      body: JSON.stringify(slack_payload)
    });
    console.log(`Sent Slack message about ${comment.id}`);
  
    // Send to Discord
    const discord_payload = {
      username: "Moderator Mentions",
      content: `u/${moderator} has been mentioned in a comment`,
      embeds: [
        {
          fields: [
            {
              name: "Link",
              value: permalink
            },
            {
              name: "User",
              value: `[u/${comment.authorName}](https://www.reddit.com/user/${comment.authorName})`
            },
            {
              name: "Body",
              value: comment.body
            }
          ]
        }
      ]
    };
    const discord_webhook = "https://discord.com/api/webhooks/";
    await fetch(discord_webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(discord_payload)
    });
    console.log(`Sent Discord message about ${comment.id}`);

  }
}

export default Devvit;