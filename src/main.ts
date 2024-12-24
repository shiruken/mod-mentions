import { Devvit } from '@devvit/public-api';
import { generateLeaderboard, onAppChanged, onCommentEvent, onModAction, onPostEvent } from './handlers.js';
import { configSettings } from './settings.js';

Devvit.configure({
  redditAPI: true,
  http: true,
});

Devvit.addSettings(configSettings);

// Check new and edited posts for moderator mentions
Devvit.addTrigger({
  events: ['PostSubmit', 'PostUpdate'],
  onEvent: onPostEvent
});

// Check new and edited comments for moderator mentions
Devvit.addTrigger({
  events: ['CommentSubmit', 'CommentUpdate'],
  onEvent: onCommentEvent
})

// Generate leaderboard of users with most moderator mentions
Devvit.addMenuItem({
  label: 'Mod Mentions Leaderboard',
  description: 'Get the Moderator Mentions leaderboard via Modmail',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: generateLeaderboard
});

// Cache modlist during app install or upgrade
Devvit.addTrigger({
  events: ['AppInstall', 'AppUpgrade'],
  onEvent: onAppChanged
});

// Update cached modlist on modlist change
Devvit.addTrigger({
  event: 'ModAction',
  onEvent: onModAction
});

export default Devvit;
