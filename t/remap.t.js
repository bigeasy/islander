require('proof')(8, prove)

function prove (okay) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.shifter()
    var envelope

    islander.publish(1)
    islander.publish(2)
    islander.publish(3)
    okay(islander.health(), { waiting: 1, pending: 2 }, 'sent')

    envelope = outbox.shift()
    okay(envelope, {
        cookie: '1',
        messages: [{ id: 'x', cookie: '1', body: 1, promise: null }]
    }, 'outbox is not empty')

    islander.sent('1', { '1': '1/1' })

    islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/1', previous: '1/0' })

    envelope = outbox.shift()
    okay(envelope, {
        cookie: '3',
        messages: [{
            id: 'x', cookie: '2', body: 2, promise: null
        }, {
            id: 'x', cookie: '3', body: 3, promise: null
        }]
    }, 'multiple messages')

    islander.sent('3', { '2': '1/2', '3': '1/3' })

    islander.push({ body: { id: 'x', cookie: '2', body: 2 }, promise: '1/2', previous: '1/1' })
    islander.push({
        promise: '2/0', previous: '1/2',
        body: {
            map: { '1/3': '2/1' }
        }
    })
    islander.push({ body: { id: 'x', cookie: '3', body: 3 }, promise: '2/1', previous: '2/0' })
    okay(islander.health(), { waiting: 0, pending: 0 }, 'remapped')
    okay(islander.health(), { waiting: 0, pending: 0 }, 'consumed')

    islander.publish(4)
    envelope = outbox.shift()
    okay(envelope, {
        cookie: '4',
        messages: [{ id: 'x', cookie: '4', body: 4, promise: null }]
    }, 'outbox for before remap')
    islander.sent('4', { '4': '3/1' })
    islander.push({
        promise: '3/0', previous: '2/1',
        body: { map: {} }
    })
    okay(islander.health(), { waiting: 1, pending: 0 }, 'skip remapped')
    islander.push({ body: { id: 'x', cookie: '4', body: 4 }, promise: '3/1', previous: '3/0' })
    okay(islander.health(), { waiting: 0, pending: 0 }, 'skip remapped consumed')
}
