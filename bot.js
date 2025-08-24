const { Telegraf, Markup } = require('telegraf');
const { google } = require('googleapis');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TIMEZONE = 'Asia/Manila';

const pendingClaims = new Map();
const awaitingRejectionReason = new Map();

async function initializeGoogleSheets() {
    let auth;
    
    if (process.env.GOOGLE_CREDENTIALS) {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    } else {
        auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, 'credentials.json'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    
    return sheets;
}

function generateTransferId() {
    const date = moment().tz(TIMEZONE).format('YYYYMMDD');
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TR-${date}-${randomStr}`;
}

bot.command('transfer', async (ctx) => {
    try {
        if (ctx.chat.id.toString() !== CHAT_ID) {
            return;
        }

        if (!ctx.message.reply_to_message) {
            return ctx.reply('Please reply to the screenshot with /transfer.');
        }

        const replyMsg = ctx.message.reply_to_message;
        if (!replyMsg.photo && !replyMsg.document) {
            return ctx.reply('Please reply to a screenshot message with /transfer.');
        }

        const commandText = ctx.message.text;
        const parts = commandText.split(' ');
        if (parts.length < 2) {
            return ctx.reply('Usage: /transfer @fromAgent');
        }

        const fromAgent = parts[1];
        if (!fromAgent.startsWith('@')) {
            return ctx.reply('Please specify the agent with @ (e.g., /transfer @agentName)');
        }

        const transferId = generateTransferId();
        const claimant = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        
        const claimData = {
            transferId,
            claimant,
            claimantUserId: ctx.from.id,
            transferredFrom: fromAgent,
            status: 'PENDING',
            createdAt: moment().tz(TIMEZONE).toISOString(),
            photoMessageId: replyMsg.message_id,
            threadId: ctx.message.message_thread_id
        };

        pendingClaims.set(transferId, claimData);

        const claimCard = `🔄 *Transfer Claim*
*ID:* \`${transferId}\`
*Claimant:* ${claimant.replace(/_/g, '\\_')}
*Transferred from:* ${fromAgent.replace(/_/g, '\\_')}
*Leaders:* review below`;

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Approve', `approve_${transferId}`),
                Markup.button.callback('❌ Reject', `reject_${transferId}`)
            ]
        ]);

        let sentMessage;
        if (replyMsg.photo) {
            const photo = replyMsg.photo[replyMsg.photo.length - 1];
            sentMessage = await ctx.replyWithPhoto(photo.file_id, {
                caption: claimCard,
                parse_mode: 'Markdown',
                reply_to_message_id: replyMsg.message_id,
                ...keyboard
            });
        } else {
            sentMessage = await ctx.reply(claimCard, {
                parse_mode: 'Markdown',
                reply_to_message_id: replyMsg.message_id,
                ...keyboard
            });
        }

        claimData.claimCardMessageId = sentMessage.message_id;
        pendingClaims.set(transferId, claimData);

    } catch (error) {
        console.error('Error in transfer command:', error);
        ctx.reply('An error occurred while processing the transfer claim.');
    }
});

bot.action(/approve_(.+)/, async (ctx) => {
    try {
        const transferId = ctx.match[1];
        const claim = pendingClaims.get(transferId);
        
        if (!claim) {
            return ctx.answerCbQuery('This claim has already been processed.');
        }

        const admins = await ctx.getChatAdministrators();
        const isAdmin = admins.some(admin => admin.user.id === ctx.from.id);
        
        if (!isAdmin) {
            return ctx.answerCbQuery('Only leaders can action this.');
        }

        const leaderUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        
        claim.status = 'APPROVED';
        claim.decidedBy = leaderUsername;
        claim.decidedAt = moment().tz(TIMEZONE).toISOString();
        
        await writeToGoogleSheets(claim);

        const updatedCaption = `✅ *Transfer Claim — APPROVED*
*ID:* \`${transferId}\`
*Claimant:* ${claim.claimant.replace(/_/g, '\\_')}
*Transferred from:* ${claim.transferredFrom.replace(/_/g, '\\_')}
*By leader:* ${leaderUsername.replace(/_/g, '\\_')}`;

        await ctx.editMessageCaption(updatedCaption, {
            parse_mode: 'Markdown'
        });

        pendingClaims.delete(transferId);
        
        await ctx.answerCbQuery('Transfer approved successfully!');
        
    } catch (error) {
        console.error('Error in approve action:', error);
        ctx.answerCbQuery('An error occurred while approving.');
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    try {
        const transferId = ctx.match[1];
        const claim = pendingClaims.get(transferId);
        
        if (!claim) {
            return ctx.answerCbQuery('This claim has already been processed.');
        }

        const admins = await ctx.getChatAdministrators();
        const isAdmin = admins.some(admin => admin.user.id === ctx.from.id);
        
        if (!isAdmin) {
            return ctx.answerCbQuery('Only leaders can action this.');
        }

        const leaderUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
        
        awaitingRejectionReason.set(ctx.from.id, {
            transferId,
            claimCardMessageId: claim.claimCardMessageId,
            claim
        });

        await ctx.reply(`Leader ${leaderUsername}, please reply here with a short rejection reason for ${transferId}.`, {
            reply_to_message_id: claim.claimCardMessageId
        });

        await ctx.answerCbQuery('Please provide a rejection reason.');
        
    } catch (error) {
        console.error('Error in reject action:', error);
        ctx.answerCbQuery('An error occurred while rejecting.');
    }
});

bot.on('text', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const pendingRejection = awaitingRejectionReason.get(userId);
        
        if (pendingRejection && ctx.message.reply_to_message) {
            const { transferId, claimCardMessageId, claim } = pendingRejection;
            
            if (ctx.message.reply_to_message.message_id === claimCardMessageId || 
                ctx.message.reply_to_message.text?.includes(transferId)) {
                
                const reason = ctx.message.text;
                const leaderUsername = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
                
                const updatedCaption = `❌ *Transfer Claim — REJECTED*
*ID:* \`${transferId}\`
*Claimant:* ${claim.claimant.replace(/_/g, '\\_')}
*Transferred from:* ${claim.transferredFrom.replace(/_/g, '\\_')}
*Reason:* ${reason}`;

                await ctx.telegram.editMessageCaption(
                    ctx.chat.id,
                    claimCardMessageId,
                    null,
                    updatedCaption,
                    { parse_mode: 'Markdown' }
                );

                awaitingRejectionReason.delete(userId);
                pendingClaims.delete(transferId);
                
                await ctx.reply('Rejection recorded.', {
                    reply_to_message_id: ctx.message.message_id
                });
            }
        }
    } catch (error) {
        console.error('Error processing rejection reason:', error);
    }
});

async function writeToGoogleSheets(claim) {
    try {
        const sheets = await initializeGoogleSheets();
        const spreadsheetId = SPREADSHEET_ID;
        
        const decidedAtLocal = moment(claim.decidedAt).tz(TIMEZONE);
        const dateKey = decidedAtLocal.format('YYYY-MM-DD');
        
        const values = [[
            claim.transferId,
            decidedAtLocal.format('YYYY-MM-DD HH:mm:ss'),
            dateKey,
            claim.claimant,
            claim.transferredFrom,
            claim.decidedBy
        ]];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Transfer chat!A:F',
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });

        await updateTransferSummary(sheets, spreadsheetId, dateKey, claim.claimant);
        
    } catch (error) {
        console.error('Error writing to Google Sheets:', error);
        throw error;
    }
}

async function updateTransferSummary(sheets, spreadsheetId, dateKey, claimantUsername) {
    try {
        const summaryRange = 'Transfer summary!A:D';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: summaryRange
        });

        const rows = response.data.values || [];
        let rowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] === dateKey && rows[i][1] === claimantUsername) {
                rowIndex = i;
                break;
            }
        }

        const generatedAt = moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
        
        if (rowIndex > 0) {
            const currentCount = parseInt(rows[rowIndex][2] || 0);
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `Transfer summary!A${rowIndex + 1}:D${rowIndex + 1}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[dateKey, claimantUsername, currentCount + 1, generatedAt]]
                }
            });
        } else {
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: summaryRange,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[dateKey, claimantUsername, 1, generatedAt]]
                }
            });
        }
    } catch (error) {
        console.error('Error updating transfer summary:', error);
    }
}

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Transfer claim bot is running...');