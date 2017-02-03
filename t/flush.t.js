require('proof/redux')(20, prove)

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
// * That our first boundary was unsuccessful.
// * That our second boundary was successful but a network error prevented us
// from receiving a response.
// * That a new batch is added to outbox after the second boundary clears the
// outbox.
// * That the third boundary posts after the second boundary clears the outbox
// and the new batch is enqueued.
// * That our retry submission succeeds but the response fails to return.
// * That our retry clears before it's boundary is posted.

//
function prove (assert) {
    var Islander = require('../islander')

    var islander = new Islander('x')
    var outbox = islander.outbox.shifter()
    var shifter = islander.log.shifter()
    var envelope

    assert(islander.publish(1), '1', 'cookie')
    assert(islander.publish(2), '2', 'second cookie')
    assert(islander.publish(3), '3', 'third cookie')
    assert(islander.health(), { waiting: 1, pending: 2, boundaries: 0 }, 'sent')

    envelope = outbox.shift().body
    assert(envelope, 'outbox ready')
    assert(envelope.messages, [
        { id: 'x', cookie: '1', body: 1 } // ,
    ], 'outbox is not empty')

    islander.receipts(envelope.cookie, { '1': '1/1' })

    islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/1', previous: '1/0' })

    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '2', body: 2
    }, {
        id: 'x', cookie: '3', body: 3
    }], 'multiple messages')

    islander.receipts(envelope.cookie, null)
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '4', body: null
    }], 'first boundary messages')
    islander.receipts(envelope.cookie, null)
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '5', body: null
    }], 'second boundary message')
    islander.receipts(envelope.cookie, null)
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '6', body: null
    }], 'third boundary message')
    islander.receipts(envelope.cookie, { '6': '3/2' })
    assert(islander.health(), { waiting: 2, pending: 0, boundaries: 3 }, 'bound')

    // Successful first entry.
    islander.push({ body: { id: 'x', cookie: '2', body: 2 }, promise: '1/2', previous: '1/1' })
    // Would have been a succesful remap, but we do not have the promises.
    islander.push({
        promise: '2/0', previous: '1/2',
        body: {
            map: { '1/3': '2/1' }
        }
    })
    islander.push({
        promise: '3/0', previous: '2/0',
        body: {
            map: null
        }
    })
    islander.push({
        promise: '3/1', previous: '3/0', body: { id: 'x', cookie: '5', body: null }
    })
    assert(islander.health(), { waiting: 1, pending: 0, boundaries: 0 }, 'flushed')
    islander.push({
        promise: '3/2', previous: '3/1', body: { id: 'x', cookie: '6', body: null }
    })
    assert(islander.health(), { waiting: 1, pending: 0, boundaries: 0 }, 'retry health')

    // Let's fail on the retry. The message is going to come through before the
    // boundary is even submitted to the consensus algorithm.
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '3', body: 3
    }], 'retry messages')
    islander.receipts(envelope.cookie, null)

    islander.push({
        promise: '3/3', previous: '3/2', body: { id: 'x', cookie: '3', body: 3 }
    })
    assert(islander.health(), { waiting: 0, pending: 0, boundaries: 0 }, 'consumed')

    // Put another message into the Islander so it posts when the queue is
    // cleared.
    // TODO Move this up to right after the second batch posts.
    assert(islander.publish(4), '8', 'fourth message')
    assert(islander.health(), { waiting: 1, pending: 0, boundaries: 0 }, 'next batch')

    // Should pass through without an issue since all our messages are posted.

    // We're now going to submit a boundary that we need to ignore while still
    // looking for valid messages and boundaries.
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '7', body: null
    }], 'retry messages')
    islander.push({
        promise: '3/4', previous: '3/3', body: { id: 'x', cookie: '7', body: null }
    })
    islander.receipts(envelope.cookie, { '7': '3/4' })

    // Let's fail again.
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '8', body: 4
    }], 'next batch messages')
    islander.receipts(envelope.cookie, null)

    // Correctly posted.
    islander.push({
        promise: '3/5', previous: '3/4', body: { id: 'x', cookie: '8', body: 4 }
    })

    // Now we process a boundary when there are no messages waiting.
    envelope = outbox.shift().body
    assert(envelope.messages, [{
        id: 'x', cookie: '9', body: null
    }], 'next batch boundary')
    islander.receipts(envelope.cookie, { '9': '3/6' })

    // Pass through ignored.
    islander.push({
        promise: '3/6', previous: '3/5', body: { id: 'x', cookie: '9', body: null }
    })
}
