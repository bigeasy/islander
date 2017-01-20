require('proof/redux')(14, prove)

// Test that a failed response will trigger a boundary.
//
// * In this convoluted test we assume that the publish failed to return, but
// did indeed enqueue our request.
// * That our first item made it through a consensus round.
// * That a new goverment was formed that remapped our flush boundary.
// * That the government then collapsed causing us to retry our remaing message.
//
// * That our submission was successful but a network error prevented us from
// receiving a response.
// * That our first boundary was successful but a network error prevented us
// from receiving a response.
// * The second boundary was remapped.

//
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
        { id: 'x', cookie: '1', value: 1, internal: false } // ,
    ], 'outbox is not empty')

    envelope.sent({ '1': '1/1' })

    islander.push({ value: { id: 'x', cookie: '1', value: 1 }, promise: '1/1', previous: '1/0' })

    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '2', value: 2, internal: false
    }, {
        id: 'x', cookie: '3', value: 3, internal: false
    }], 'multiple messages')

    envelope.sent(null)
    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '4', value: null
    }], 'first boundary messages')
    envelope.sent(null)
    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '5', value: null
    }], 'second boundary message')
    envelope.sent({ '5': '3/2' })
    assert(islander.health(), { waiting: 2, pending: 0, boundaries: 2 }, 'bound')

    // Successful first entry.
    islander.push({ value: { id: 'x', cookie: '2', value: 2 }, promise: '1/2', previous: '1/1' })
    // Would have been a succesful remap, but we do not have the promises.
    islander.push({
        promise: '2/0', previous: '1/2',
        value: {
            map: { '1/3': '2/1' }
        }
    })
    islander.push({
        promise: '3/0', previous: '2/0',
        value: {
            map: null
        }
    })
    islander.push({
        promise: '3/1', previous: '3/0', value: { id: 'x', cookie: '4', value: null }
    })
    assert(islander.health(), { waiting: 1, pending: 0, boundaries: 0 }, 'flushed')
    islander.push({
        promise: '3/2', previous: '3/1', value: { id: 'x', cookie: '5', value: null }
    })
    assert(islander.health(), { waiting: 1, pending: 0, boundaries: 0 }, 'retry health')

    envelope = outbox.shift()
    assert(envelope.messages, [{
        id: 'x', cookie: '3', value: 3, internal: false
    }], 'retry messages')
    envelope.sent({ '3': '3/3' })

    islander.push({
        promise: '3/3', previous: '3/2', value: { id: 'x', cookie: '3', value: 3 }
    })
    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'consumed')
}
