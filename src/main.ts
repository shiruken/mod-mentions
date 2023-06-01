import {
  Devvit,
  RedditAPIClient,
 } from '@devvit/public-api';
import { CommentSubmit, Metadata } from '@devvit/protos';

const reddit = new RedditAPIClient();
const lc = Devvit.use(Devvit.Types.RedditAPI.LinksAndComments);

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
  }
}

export default Devvit;