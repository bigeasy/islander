require('proof')(18, (okay) => {
    const Islander = require('../islander')

    const outbox = []
    const islander = new Islander('x', outbox)
    let messages

    islander.push({ body: {}, promise: '1/0', previous: '0/0' })

    okay(outbox.length, 0, 'outbox is still empty')

    islander.push({ body: { id: '2', cookie: '0', body: 1 }, promise: '1/1', previous: '1/0' })

    islander.publish(1)
    islander.publish(2)
    islander.publish(3)
    okay(islander.health(), { waiting: 1, pending: 2 }, 'sent')
    messages = outbox.shift()
    okay(messages, 'outbox ready')
    okay(messages, {
        cookie: '1',
        messages: [{ id: 'x', cookie: '1', body: 1 }]
    }, 'outbox is not empty')
    islander.sent('1', { '1': '1/3' })

    islander.push({ body: { id: 'y', cookie: '1', body: 1 }, promise: '1/2', previous: '1/1' })
    islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/3', previous: '1/2' })

    messages = outbox.shift()
    okay(messages, {
        cookie: '3',
        messages: [{
            id: 'x', cookie: '2', body: 2
        }, {
            id: 'x', cookie: '3', body: 3
        }]
    }, 'multiple messages')
    islander.sent('3', { '2': '1/4', '3': '1/5' })
    islander.push({ body: { id: 'x', cookie: '2', body: 2 }, promise: '1/4', previous: '1/3' })
    islander.push({ body: { id: 'x', cookie: '3', body: 3 }, promise: '1/5', previous: '1/4' })
    okay(islander.health(), { waiting: 0, pending: 0 }, 'consumed')

    islander.publish(4)

    islander.push({
        promise: '2/0', previous: '1/5',
        body: { map: null }
    })

    islander.push({
        promise: '3/0', previous: '2/0',
        body: { map: {} }
    })

    okay([ outbox.shift(), outbox.shift(), outbox.shift() ], [{
        cookie: '4',
        messages: [{ id: 'x', cookie: '4', body: 4 }]
    }, {
        cookie: '5',
        messages: [{ id: 'x', cookie: '5', body: null }]
    }, {
        cookie: '6',
        messages: [{ id: 'x', cookie: '6', body: null }]
    }], 'publish response too late and two flushes')

    islander.sent('4', { '4': '3/1' })
    islander.sent('5', { '5': '3/2' })
    islander.sent('6', { '6': '3/3' })

    islander.push({
        promise: '4/0', previous: '3/0',
        body: { map: { '3/1': '4/1', '3/2': '4/2', '3/3': '4/3' } }
    })

    islander.push({
        promise: '4/1', previous: '4/0',
        body: { id: 'x', cookie:  '4' }
    })

    okay(islander.health(), { waiting: 0, pending: 0 }, 'publish response too late consumed')

    islander.push({
        promise: '4/2', previous: '4/1',
        body: { id: 'x', cookie:  '5' }
    })

    islander.push({
        promise: '4/3', previous: '4/2',
        body: { id: 'x', cookie:  '6' }
    })

    islander.publish(5)

    okay(outbox.shift(), {
        cookie: '7',
        messages: [{ id: 'x', cookie: '7', body: 5 }]
    }, 'publish miss remapping')
    islander.push({
        promise: '5/0', previous: '4/3',
        body: { map: { '4/4': '5/1' } }
    })
    islander.sent('7', { '7': '4/3' })

    okay(outbox.shift(), {
        cookie: '8',
        messages: [{ id: 'x', cookie: '8', body: null }]
    }, 'publish miss remapping flush that skips remapping')
    islander.sent('8', { '8': '6/2' })

    // This government will skip remapping the flush, the government record is
    // less than the promise assigned to the flush.
    islander.push({
        promise: '6/0', previous: '5/0',
        body: { map: { '5/1': '6/1' } }
    })

    // Here we test that islander will ignore the flush messages.
    islander.publish(6)

    islander.push({
        promise: '6/1', previous: '6/0',
        body: { id: 'x', cookie:  '7' }
    })
    okay(outbox.shift(), {
        cookie: '9',
        messages: [{ id: 'x', cookie: '9', body: 6 }]
    }, 'publish with flushes outstanding')
    islander.sent('9', { '9': '6/3' })

    islander.push({
        promise: '6/2', previous: '6/1',
        body: { id: 'x', cookie:  '8' }
    })

    // Test remapping sought messages.
    islander.push({
        promise: '7/0', previous: '6/2',
        body: { map: { '6/3': '7/1' } }
    })

    islander.push({
        promise: '7/1', previous: '7/0',
        body: { id: 'x', cookie:  '9' }
    })

    okay(islander.health(), { waiting: 0, pending: 0 }, 'publish miss remapping consumed')

    islander.publish(7)
    okay(outbox.shift(), {
        cookie: '10',
        messages: [{ id: 'x', cookie: '10', body: 7 }]
    }, 'publish and skip remapping messages')
    islander.sent('10', { '10': '8/1' })
    islander.push({
        promise: '8/0', previous: '7/1',
        body: { map: {} }
    })
    islander.push({
        promise: '8/1', previous: '8/0',
        body: { id: 'x', cookie:  '10' }
    })

    okay(islander.health(), { waiting: 0, pending: 0 }, 'publish and skip remapping messages consumed')

    islander.publish(8)
    okay(outbox.shift(), {
        cookie: '11',
        messages: [{ id: 'x', cookie: '11', body: 8 }]
    }, 'publish failure')
    islander.sent('11', null)
    okay(outbox.shift(), {
        cookie: '12',
        messages: [{ id: 'x', cookie: '12', body: null }]
    }, 'publish failure flush')
    islander.sent('12', { '12': '8/2' })
    islander.push({
        promise: '8/2', previous: '8/1',
        body: { id: 'x', cookie:  '12' }
    })
    okay(outbox.shift(), {
        cookie: '13',
        messages: [{ id: 'x', cookie: '13', body: 8 }]
    }, 'publish failure resend')
    islander.sent('13', { '13': '8/3' })
    islander.push({
        promise: '8/3', previous: '8/2',
        body: { id: 'x', cookie:  '13' }
    })

    okay(islander.health(), { waiting: 0, pending: 0 }, 'done')

    islander.push(null)
})
