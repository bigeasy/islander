require('proof/redux')(13, prove)

function prove (assert) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.consumer()
    var consumer = islander.log.consumer()
    var envelope

    assert(outbox.shift(), null, 'outbox is empty')

    islander.enqueue({ value: {}, promise: '1/0', previous: '0/0' }, function (error) {
        assert(!error, 'enqueued')
    })

    assert(outbox.peek(), null, 'outbox is still empty')

    islander.push({ value: { id: '2', cookie: '0', value: 1 }, promise: '1/1', previous: '1/0' })

    assert([ consumer.shift(), consumer.shift() ], [{
        value: {}, promise: '1/0', previous: '0/0'
    }, {
        value: { id: '2', cookie: '0', value: 1 }, promise: '1/1', previous: '1/0'
    }], 'pass through')

    assert(islander.publish(1), '1', 'cookie')
    assert(islander.publish(2), '2', 'second cookie')
    assert(islander.publish(3), '3', 'third cookie')
    assert(islander.health(), { waiting: 1, pending: 2, boundaries: 0 }, 'sent')
    envelope = outbox.shift()
    assert(envelope, 'outbox ready')
    assert(envelope.messages, [
        { id: 'x', cookie: '1', value: 1 }
    ], 'outbox is not empty')
    envelope.sent({ '1': '1/3' })

    islander.push({ value: { id: 'y', cookie: '1', value: 1 }, promise: '1/2', previous: '1/1' })
    islander.push({ value: { id: 'x', cookie: '1', value: 1 }, promise: '1/3', previous: '1/2' })

    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '2', value: 2
    }, {
        id: 'x', cookie: '3', value: 3
    }], 'multiple messages')
    envelope.sent({ '2': '1/4', '3': '1/5' })
    islander.push({ value: { id: 'x', cookie: '2', value: 2 }, promise: '1/4', previous: '1/3' })
    islander.push({ value: { id: 'x', cookie: '3', value: 3 }, promise: '1/5', previous: '1/4' })
    assert([ consumer.shift(), consumer.shift(), consumer.shift(), consumer.shift() ], [{
        value: { id: 'y', cookie: '1', value: 1 }, promise: '1/2', previous: '1/1'
    }, {
        value: { id: 'x', cookie: '1', value: 1 }, promise: '1/3', previous: '1/2'
    }, {
        value: { id: 'x', cookie: '2', value: 2 }, promise: '1/4', previous: '1/3'
    }, {
        value: { id: 'x', cookie: '3', value: 3 }, promise: '1/5', previous: '1/4'
    }], 'pass through')

    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'consumed')
}
