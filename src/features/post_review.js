import { SubmissionLayout } from '../blocks'
import config from '../config'
import counter from '../counter'
import Post from '../models/post'
import { removeSpecialTags } from '../utils'
import { sendMessage } from '../utils/slack'

export default app => {
    app.action('post_approve', async ({ ack, action, body, client }) => {
        await ack()

        const id = action.value
        const submission = await Post.findById(id)
        // Handle edge case where ticket isn't in database
        if (!submission) {
            await sendMessage(client, action.channel, {
                text: ':rotating_light: Something went wrong. Reason: `submission not found`',
                thread_ts: body.message_ts
            })
            return
        }

        const newCount = await counter.increment()
        const mainContent = `*#${newCount}:* ${removeSpecialTags(submission.body)}`
        let postMessage = await sendMessage(client, config.postChannelId,
            submission.markedSensitiveAt
                ? `:warning: _*#${newCount}* contains potentially sensitive content. Click on *View thread* to reveal it._`
                : mainContent)

        // If the post is marked sensitive, post in the thread and save that message ID instead.
        // We can always retrieve the parent message's ID if we need it in the future.
        if (submission.markedSensitiveAt) {
            postMessage = await sendMessage(client, config.postChannelId, {
                text: mainContent,
                thread_ts: postMessage.ts
            })
        }

        submission.postMessageId = postMessage.ts
        submission.postNumber = newCount
        submission.approvedAt = Date.now()

        await submission.save()

        const { permalink: postPermalink } = await client.chat.getPermalink({
            channel: config.postChannelId,
            message_ts: submission.postMessageId
        })
        const props = {
            id,
            isSensitive: Boolean(submission.markedSensitiveAt),
            postChannel: config.postChannelId,
            postNumber: submission.postNumber,
            postPermalink,
            status: 'approved',
            text: submission.body,
            user: body.user.id
        }
        await client.chat.update({
            channel: config.reviewChannelId,
            ts: submission.reviewMessageId,
            blocks: SubmissionLayout(props)
        })

        await sendMessage(client, config.streamChannelId, {
            text: `_<@${body.user.id}> approved a submission:_\n>>> ${removeSpecialTags(submission.body)}`,
            unfurl_links: false
        })
    })

    app.action('post_reject', async ({ ack, action, body, client }) => {
        await ack()

        const id = action.value
        const submission = await Post.findById(id)
        // Handle edge case where ticket isn't in database
        if (!submission) {
            await sendMessage(client, action.channel, {
                text: ':rotating_light: Something went wrong. Reason: `submission not found`',
                thread_ts: body.message_ts
            })
            return
        }

        await submission.delete()

        const props = {
            id,
            isSensitive: Boolean(submission.markedSensitiveAt),
            postChannel: config.postChannelId,
            postNumber: submission.postNumber,
            status: 'rejected',
            text: submission.body,
            user: body.user.id
        }
        await client.chat.update({
            channel: config.reviewChannelId,
            ts: submission.reviewMessageId,
            blocks: SubmissionLayout(props)
        })

        await sendMessage(client, config.streamChannelId, {
            text: `_<@${body.user.id}> rejected a submission:_\n>>> ${removeSpecialTags(submission.body)}`,
            unfurl_links: false
        })
    })

    app.action('post_toggle_sensitive', async ({ ack, action, body, client }) => {
        await ack()

        const id = action.value
        const submission = await Post.findById(id)
        // Handle edge case where ticket isn't in database
        if (!submission) {
            await sendMessage(client, action.channel, {
                text: ':rotating_light: Something went wrong. Reason: `submission not found`',
                thread_ts: body.message_ts
            })
            return
        }

        submission.markedSensitiveAt = submission.markedSensitiveAt ? null : Date.now()
        await submission.save()

        const props = {
            id,
            isSensitive: Boolean(submission.markedSensitiveAt),
            status: 'waiting',
            text: submission.body
        }
        await client.chat.update({
            channel: config.reviewChannelId,
            ts: submission.reviewMessageId,
            blocks: SubmissionLayout(props)
        })
    })
}