const filterEvents = filterFn => {
    return async ({ event, next }) => {
        if (filterFn(event)) {
            await next()
        }
    }
}

export const channel = id => filterEvents(event => event.channel === id)

export const channelType = type => filterEvents(event => event.channel_type === type)

export const noBotMessages = filterEvents(event => !('subtype' in event) || event.subtype !== 'bot_message')

export const threaded = (shouldBeThreaded = true) => filterEvents(event => 'thread_ts' in event === shouldBeThreaded)
