import config from '../../config'
import Post from '../../models/post'
import { removeSpecialTags } from '../../utils'
import { getParentMessageId, isUserInChannel, sendEphemeralMessage, sendMessage } from '../../utils/slack'

// /prox lockdown <post number>
export default async ({ client, command }, args) => {
    // Check if the user is part of the review channel
    if (!(await isUserInChannel(client, command.user_id, config.reviewChannelId))) {
        await sendEphemeralMessage(client, command.channel_id, command.user_id, 'You don’t have permission to run this command.')
        return
    }

    if (!args[1]) {
        await sendEphemeralMessage(client, command.channel_id, command.user_id, 'Please specify a post number.')
        return
    }

    if (isNaN(args[1])) {
        await sendEphemeralMessage(client, command.channel_id, command.user_id, 'Input must be a post number.')
        return
    }

    const post = await Post.findOne({ postNumber: args[1] })
    if (!post) {
        await sendEphemeralMessage(client, command.channel_id, command.user_id, 'The specified post couldn’t be found.')
        return
    }

    post.lockedDownAt = post.lockedDownAt ? null : Date.now() // Toggle the post's lock status
    await post.save()

    // Update the post message with the new lock status
    await client.chat.update({
        channel: config.postChannelId,
        ts: post.postMessageId,
        text: `${post.lockedDownAt ? ':lock: ' : ''}*#${post.postNumber}:* ${removeSpecialTags(post.body)}`
    })

    // Post status update in post thread. Attempt to get the parent message's ID.
    // If it's null, then this must already be the top-level message.
    const parentId = await getParentMessageId(client, config.postChannelId, post.postMessageId)
    await sendMessage(client, config.postChannelId, {
        text: post.lockedDownAt
            ? ':lock: _This post is now locked. Anonymous replies sent after this will not be shown._'
            : ':unlock: _This post is no longer locked. Anonymous replies sent will be shown again._',
        thread_ts: parentId || post.postMessageId
    })

    // Notify the command sender
    await sendEphemeralMessage(client, command.channel_id, command.user_id, 'Lock status updated.')

    // Log status change
    const { permalink: postPermalink } = await client.chat.getPermalink({
        channel: config.postChannelId,
        message_ts: post.postMessageId
    })
    await sendMessage(client, config.streamChannelId, {
        text: `_<@${command.user_id}> ${post.lockedDownAt ? 'locked' : 'unlocked'} <${postPermalink}|*#${post.postNumber}*>._`,
        unfurl_links: false
    })
}