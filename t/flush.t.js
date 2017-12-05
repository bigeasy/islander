require('proof')(8, prove)

// TODO This bullet list is no longer in any way true.

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

    islander.sent('3', null)
    envelope = outbox.shift()
    okay(envelope, {
        cookie: '4',
        messages: [{ id: 'x', cookie: '4', body: null }]
    }, 'first boundary message')
    // Wipe out boundary before we can send it in theory.
    islander.push({
        promise: '2/0', previous: '1/1',
        body: {
            map: null
        }
    })
    envelope = outbox.shift()
    okay(envelope, {
        cookie: '5',
        messages: [{ id: 'x', cookie: '5', body: null }]
    }, 'second boundary message')
    islander.sent('4', { '4': '2/1' })
    islander.sent('5', { '5': '2/2' })
    islander.push({ body: { id: 'x', cookie: '4', body: null }, promise: '2/1', previous: '2/0' })
    okay(outbox.shift(), null, 'not yet bounded')
    islander.push({ body: { id: 'x', cookie: '5', body: null }, promise: '2/2', previous: '2/1' })
    envelope = outbox.shift()
    okay(envelope, {
        cookie: '7',
        messages: [{
            id: 'x', cookie: '6', body: 2, promise: null
        }, {
            id: 'x', cookie: '7', body: 3, promise: null
        }]
    }, 'retried')
    islander.push({ body: { id: 'x', cookie: '6', body: 2 }, promise: '2/3', previous: '2/2' })
    islander.push({ body: { id: 'x', cookie: '7', body: 3 }, promise: '2/4', previous: '2/3' })
    okay(islander.health(), { waiting: 0, pending: 0 }, 'consumed')
}
