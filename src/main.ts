import { Context, Devvit, UserContext } from '@devvit/public-api';

import { configSettings } from "./settings.js";
import { checkModMention, generateLeaderboard } from './handlers.js';

Devvit.addSettings(configSettings);

// Check all posts and comments (including edits) for moderator mentions
Devvit.addTrigger({
  events: [
    Devvit.Trigger.PostSubmit, Devvit.Trigger.PostUpdate,
    Devvit.Trigger.CommentSubmit, Devvit.Trigger.CommentUpdate
  ],
  handler: checkModMention
});

// Generate leaderboard for users with most moderator mentions
Devvit.addAction({
  name: 'Mod Mentions Leaderboard',
  description: 'Get the Moderator Mentions leaderboard via Modmail',
  context: Context.SUBREDDIT,
  userContext: UserContext.MODERATOR,
  handler: generateLeaderboard
});

export default Devvit;