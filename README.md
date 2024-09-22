# Moderator Mentions

Get notified about moderator username mentions in your subreddit and (optionally) action the content. Supports Modmail, Slack, and Discord. Generate reports to easily identify the top offenders.

[https://developers.reddit.com/apps/mod-mentions](https://developers.reddit.com/apps/mod-mentions)

## Features

* Minimal setup requiring **zero** knowledge about AutoModerator or coding
* Automatically handles changes to your mod team - No input required!
  * Easily exclude moderators
* Monitors posts and comments (both new and edited)
* Action identified content (Report, Lock, and Remove)
* Notifications via Modmail, Slack, or Discord
* Tracks users to identify repeat offenders
  * Top 10 report delivered via Modmail

## Installation Settings

![Screenshot of Installation Settings](https://github.com/user-attachments/assets/8b881107-6179-49ce-afa1-9e41e20de2e6)

* **Require u/ prefix:** Mentions must contain the `u/` username-linking prefix to trigger an action or notification. Disable to check for any username mention regardless of the presence of the prefix (vulnerable to false positives if moderator usernames are common words).
  * When enabled, "Hey u/spez" will trigger the app but "Hey spez" will not. When disabled, both phrases will trigger the app.
* **Excluded Moderators:** Ignore mentions of these moderators, entered as a comma-separated list (e.g. `spez, kn0thing, KeyserSosa`)
  * AutoModerator and the app account (`u/mod-mentions`) are automatically excluded
* **Actions:** Moderator actions (report, lock, and remove) to take on content that mentions a subreddit moderator
* **Notifications**
  * **Send Modmail:** Send notification via Modmail
  * **Webhook URL:** Send notification to Slack or Discord via webhook
    * [Slack: Sending messages using Incoming Webhooks](https://api.slack.com/messaging/webhooks)
    * [Discord: Intro to Webhooks](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)

## Notifications

### Modmail

![Modmail Example](https://github.com/shiruken/mod-mentions/assets/867617/bb89c958-2dad-4f3e-9945-d102ceb718a2)

### Slack

![Slack Example](https://github.com/shiruken/mod-mentions/assets/867617/327884e3-ca20-4f77-b5aa-47506a1c58dd)

### Discord

![Discord Example](https://github.com/shiruken/mod-mentions/assets/867617/337cee69-c9da-4e9b-b6b0-73eda2efe90f)

## Menu Action

### Mod Mentions Leaderboard

![Screenshot of 'Mod Mentions Leaderboard' Menu Action](https://github.com/user-attachments/assets/25da0405-eca7-4c1a-b9a4-4180a82472f8) ![Screenshot of 'Mod Mentions Leaderboard' Modmail Message](https://github.com/shiruken/mod-mentions/assets/867617/6ee19879-6882-419a-8750-9d8331e9995c)

## Changelog

*[View Releases on GitHub](https://github.com/shiruken/mod-mentions/releases)*

* v1.0
  * Include `subreddit-ModTeam` account
  * Add setting to disable `u/` prefix when detecting mentions
  * Improved robustness of username detection
* v0.9
  * Improve readability of Modmail and Slack notifications
  * Send Modmail messages via conversation rather than Mod Discussion
  * Added Terms of Service and Privacy Policy
  * Major refactor to minimize API calls to avoid rate limits
* v0.8
  * Initial Release

## Links

* [Source Code](https://github.com/shiruken/mod-mentions)
* [Terms and Conditions](https://github.com/shiruken/mod-mentions/blob/main/TERMS.md)
* [Privacy Policy](https://github.com/shiruken/mod-mentions/blob/main/PRIVACY.md)

*Note: The [avatar](https://raw.githubusercontent.com/shiruken/mod-mentions/main/assets/avatar.jpg) used in this project was generated using Image Creator from Microsoft Designer.*
