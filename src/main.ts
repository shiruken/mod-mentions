import { Devvit } from '@devvit/public-api';
import { configSettings } from "./settings.js";
import { checkModMention, generateLeaderboard } from './handlers.js';

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true,
});

Devvit.addSettings(configSettings);

// Check all new posts and comments (including edits) for moderator mentions
Devvit.addTrigger({
  events: ['PostSubmit', 'PostUpdate', 'CommentSubmit', 'CommentUpdate'],
  onEvent: checkModMention
});

// Generate leaderboard of users with most moderator mentions
Devvit.addMenuItem({
  label: 'Mod Mentions Leaderboard',
  description: 'Get the Moderator Mentions leaderboard via Modmail',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: generateLeaderboard
});

export default Devvit;