require('proof')(8, prove)

function prove (assert) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.shifter()
    var messages

    assert(outbox.shift(), null, 'outbox is empty')

    islander.enqueue({ body: {}, promise: '1/0', previous: '0/0' }, function (error) {
        assert(!error, 'enqueued')
    })

    assert(outbox.peek(), null, 'outbox is still empty')

    islander.push({ body: { id: '2', cookie: '0', body: 1 }, promise: '1/1', previous: '1/0' })

    islander.publish(1)
    islander.publish(2)
    islander.publish(3)
    assert(islander.health(), { waiting: 1, pending: 2 }, 'sent')
    messages = outbox.shift()
    assert(messages, 'outbox ready')
    assert(messages, {
        cookie: '1',
        messages: [{ id: 'x', cookie: '1', body: 1, promise: null }]
    }, 'outbox is not empty')
    islander.sent('1', { '1': '1/3' })

    islander.push({ body: { id: 'y', cookie: '1', body: 1 }, promise: '1/2', previous: '1/1' })
    islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/3', previous: '1/2' })

    messages = outbox.shift()
    assert(messages, {
        cookie: '3',
        messages: [{
            id: 'x', cookie: '2', body: 2, promise: null
        }, {
            id: 'x', cookie: '3', body: 3, promise: null
        }]
    }, 'multiple messages')
    islander.sent({ '2': '1/4', '3': '1/5' })
    islander.push({ body: { id: 'x', cookie: '2', body: 2 }, promise: '1/4', previous: '1/3' })
    islander.push({ body: { id: 'x', cookie: '3', body: 3 }, promise: '1/5', previous: '1/4' })
    assert(islander.health(), { waiting: 0, pending: 0 }, 'consumed')
}
