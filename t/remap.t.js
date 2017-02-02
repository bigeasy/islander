require('proof/redux')(10, prove)

function prove (assert) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.consumer()
    var consumer = islander.log.consumer()
    var envelope

    assert(islander.publish(1), '1', 'cookie')
    assert(islander.publish(2), '2', 'second cookie')
    assert(islander.publish(3), '3', 'third cookie')
    assert(islander.health(), { waiting: 1, pending: 2, boundaries: 0 }, 'sent')

    envelope = outbox.shift()
    assert(envelope, 'outbox ready')
    assert(envelope.messages, [
        { id: 'x', cookie: '1', value: 1 }
    ], 'outbox is not empty')

    islander.receipts(envelope.cookie, { '1': '1/1' })

    islander.push({ value: { id: 'x', cookie: '1', value: 1 }, promise: '1/1', previous: '1/0' })

    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '2', value: 2
    }, {
        id: 'x', cookie: '3', value: 3
    }], 'multiple messages')

    islander.receipts(envelope.cookie, { '2': '1/2', '3': '1/3' })

    islander.push({ value: { id: 'x', cookie: '2', value: 2 }, promise: '1/2', previous: '1/1' })
    islander.push({
        promise: '2/0', previous: '1/2',
        value: {
            map: { '1/3': '2/1' }
        }
    })
    islander.push({ value: { id: 'x', cookie: '3', value: 3 }, promise: '2/1', previous: '2/0' })
    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'remapped')
    assert([ consumer.shift(), consumer.shift(), consumer.shift(), consumer.shift() ], [{
        value: { id: 'x', cookie: '1', value: 1 }, promise: '1/1', previous: '1/0'
    }, {
        value: { id: 'x', cookie: '2', value: 2 }, promise: '1/2', previous: '1/1'
    }, {
        promise: '2/0', previous: '1/2',
        value: {
            map: { '1/3': '2/1' }
        }
    }, {
        value: { id: 'x', cookie: '3', value: 3 }, promise: '2/1', previous: '2/0'
    }], 'pass through')

    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'consumed')
}
