require('proof/redux')(13, prove)

function prove (assert) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.shifter()
    var shifter = islander.log.shifter()
    var messages

    assert(outbox.shift(), null, 'outbox is empty')

    islander.enqueue({ body: {}, promise: '1/0', previous: '0/0' }, function (error) {
        assert(!error, 'enqueued')
    })

    assert(outbox.peek(), null, 'outbox is still empty')

    islander.push({ body: { id: '2', cookie: '0', body: 1 }, promise: '1/1', previous: '1/0' })

    assert([ shifter.shift(), shifter.shift() ], [{
        body: {}, promise: '1/0', previous: '0/0'
    }, {
        body: { id: '2', cookie: '0', body: 1 }, promise: '1/1', previous: '1/0'
    }], 'pass through')

    assert(islander.publish(1), '1', 'cookie')
    assert(islander.publish(2), '2', 'second cookie')
    assert(islander.publish(3), '3', 'third cookie')
    assert(islander.health(), { waiting: 1, pending: 2, boundaries: 0 }, 'sent')
    messages = outbox.shift()
    assert(messages, 'outbox ready')
    assert(messages, [
        { id: 'x', cookie: '1', body: 1 }
    ], 'outbox is not empty')
    islander.sent({ '1': '1/3' })

    islander.push({ body: { id: 'y', cookie: '1', body: 1 }, promise: '1/2', previous: '1/1' })
    islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/3', previous: '1/2' })

    messages = outbox.shift()
    assert(messages, [{
        id: 'x', cookie: '2', body: 2
    }, {
        id: 'x', cookie: '3', body: 3
    }], 'multiple messages')
    islander.sent({ '2': '1/4', '3': '1/5' })
    islander.push({ body: { id: 'x', cookie: '2', body: 2 }, promise: '1/4', previous: '1/3' })
    islander.push({ body: { id: 'x', cookie: '3', body: 3 }, promise: '1/5', previous: '1/4' })
    assert([ shifter.shift(), shifter.shift(), shifter.shift(), shifter.shift() ], [{
        body: { id: 'y', cookie: '1', body: 1 }, promise: '1/2', previous: '1/1'
    }, {
        body: { id: 'x', cookie: '1', body: 1 }, promise: '1/3', previous: '1/2'
    }, {
        body: { id: 'x', cookie: '2', body: 2 }, promise: '1/4', previous: '1/3'
    }, {
        body: { id: 'x', cookie: '3', body: 3 }, promise: '1/5', previous: '1/4'
    }], 'pass through')

    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'consumed')
}
