# Transfer Chat Bot

A Telegram bot for managing transfer claims with Google Sheets integration. This bot allows agents to submit transfer claims with screenshots, which leaders can approve or reject.

## Features

- **Transfer Claims**: Agents submit screenshots and initiate transfer claims
- **Leader Approval**: Only group admins can approve/reject claims
- **Google Sheets Integration**: Approved transfers are automatically logged to Google Sheets
- **Rejection Reasons**: Leaders must provide reasons for rejected claims
- **Unique Transfer IDs**: Each claim gets a unique ID (TR-YYYYMMDD-XXXXXX)
- **Thread Support**: Works within Telegram group threads/topics

## Setup Instructions

### 1. Prerequisites

- Node.js (v14 or higher)
- Google Cloud account with Sheets API enabled
- Telegram Bot Token
- Admin access to target Telegram group

### 2. Google Sheets Setup

Create a Google Sheet with two tabs:

**Tab: "Transfer chat"** - For approved transfers
- Column A: transfer_id
- Column B: decided_at_local
- Column C: date_key
- Column D: claimant_username
- Column E: transferred_from
- Column F: decided_by

**Tab: "Transfer summary"** - For daily summaries
- Column A: date_key
- Column B: claimant_username
- Column C: count_transfers
- Column D: generated_at

### 3. Google Cloud Setup

1. Enable Google Sheets API in Google Cloud Console
2. Create a service account
3. Download the credentials JSON file
4. Share your Google Sheet with the service account email
5. Place the credentials file as `credentials.json` in the project root

### 4. Installation

```bash
# Clone the repository
git clone https://github.com/maxchan91/transferchat.git
cd transferchat

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials
```

### 5. Configuration

Edit the `.env` file:
- `BOT_TOKEN`: Your Telegram bot token
- `CHAT_ID`: The Telegram group chat ID
- `SPREADSHEET_ID`: Your Google Spreadsheet ID

### 6. Running the Bot

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

## Usage

### For Agents

1. Post a screenshot in the group (preferably in the Claims thread)
2. Reply to your screenshot with: `/transfer @fromAgent`
   - Replace `@fromAgent` with the actual agent username

### For Leaders

1. Review the claim card that appears
2. Click ✅ Approve or ❌ Reject
3. If rejecting, provide a reason when prompted

### Rules

- `/transfer` command must be a reply to a message with a photo
- Only group admins can approve/reject claims
- Each claim can only be processed once
- Rejections require a reason from the leader

## Project Structure

```
transferchat/
├── bot.js              # Main bot application
├── package.json        # Dependencies
├── .env               # Environment variables (not in repo)
├── .env.example       # Environment template
├── credentials.json   # Google service account (not in repo)
└── README.md         # Documentation
```

## Error Handling

- Invalid commands show helpful error messages
- Non-leaders attempting to approve/reject get a popup notification
- Duplicate claim processing is prevented
- All errors are logged to console

## Security Notes

- Never commit `.env` or `credentials.json` to version control
- Keep bot token and credentials secure
- Regularly rotate credentials
- Monitor bot activity logs

## Troubleshooting

**Bot not responding:**
- Check bot token is correct
- Verify chat ID matches your group
- Ensure bot is added to group as admin

**Google Sheets not updating:**
- Verify service account has edit access to sheet
- Check credentials.json is valid
- Confirm spreadsheet ID is correct

**Leaders can't approve/reject:**
- Ensure they have admin rights in the group
- Check bot has permission to read admin list

## Support

For issues or questions, please check the existing documentation or contact the development team.