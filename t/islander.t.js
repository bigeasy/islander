require('proof')(28, prove)

function prove (assert) {
    var Client = require('../islander')

    var islander = new Client('x')

    var iterator = islander.prime({ value: null, promise: '1/0' })

    islander.receive([
        { id: '2', cookie: '0', promise: '1/1', value: 1, previous: '1/0' },
    ])

    assert(!!iterator.next, 'next')

    assert(islander.outbox(), [], 'outbox is empty')
    assert(islander.outbox(), [], 'outbox is still empty')
    assert(islander.outbox(), [], 'outbox is ever still empty')
    assert(islander.publish(1), '1', 'cookie')
    assert(islander.publish(2), '2', 'second cookie')
    assert(islander.outbox(), [
        { id: 'x', cookie: '1', value: 1, internal: false },
        { id: 'x', cookie: '2', value: 2, internal: false }
    ], 'outbox is not empty')

    islander.published([
        { id: 'x', cookie: '1', promise: '1/3' },
        { id: 'x', cookie: '2', promise: '1/4' }
    ])

    islander.receive([
        { id: 'x', cookie: '1', promise: '1/3', value: 2, previous: '1/2' },
    ])

    islander.receive([
        { id: '1', cookie: '1', promise: '1/2', value: 1, previous: '1/1' },
        { id: 'x', cookie: '1', promise: '1/3', value: 2, previous: '1/2' },
        { id: 'x', cookie: '2', promise: '1/4', value: 2, previous: '1/3' }
    ])

    while (iterator.next) {
        iterator = iterator.next
    }
    assert(iterator.promise, '1/4', 'filled')

    islander.receive([
        { id: 'x', cookie: '2', promise: '1/4', value: 2, previous: '1/3' }
    ])

    assert(!iterator.next, 'duplicate')

    assert(islander.outbox(), [], 'outbox is empty after publshing')

    islander.publish(1)
    islander.publish(2)
    islander.publish(3)
    assert(islander.outbox(), [
        { id: 'x', cookie: '3', value: 1, internal: false },
        { id: 'x', cookie: '4', value: 2, internal: false },
        { id: 'x', cookie: '5', value: 3, internal: false }
    ], 'outbox for boundary')
    islander.publish(4)
    islander.publish(5)
    islander.publish(6)
    islander.published([])
    assert(islander.outbox(), [{ id: 'x', cookie: '9', value: 0 }], 'boundary outbox will fail')
    islander.published([])
    assert(islander.outbox(), [{ id: 'x', cookie: 'a', value: 0 }], 'boundary outbox')
    islander.published([{ id: 'x', cookie: 'a', promise: '1/9' }])
    assert(islander.outbox(), [], 'boundary outbox published')
    islander.receive([
        { id: 'x', cookie: '3', promise: '1/5', value: 1, previous: '1/4' },
        { id: 'x', cookie: '4', promise: '1/6', value: 2, previous: '1/5' },
        { id: 'x', cookie: '5', promise: '1/7', value: 3, previous: '1/6' },
        { id: 'x', cookie: '9', promise: '1/8', value: 0, previous: '1/7' }
    ])
    assert(islander.outbox(), [], 'boundary outbox sent empty')
    assert(islander.sent.ordered, [], 'messages before boundary consumed')
    assert(islander.boundary != null, 'boundary exists')
    assert(islander.outbox(), [], 'boundary exists outbox')
    islander.receive([
        { id: 'x', cookie: 'a', promise: '1/9', value: 0, previous: '1/8' },
    ])
    assert(islander.boundary == null, 'boundary cleared')
    assert(islander.outbox(), [
        { id: 'x', cookie: '6', value: 4, internal: false },
        { id: 'x', cookie: '7', value: 5, internal: false },
        { id: 'x', cookie: '8', value: 6, internal: false }
    ], 'boundary cleared outbox')
    islander.published([])
    assert(islander.outbox(), [
        { id: 'x', cookie: 'b', value: 0 }
    ], 'second boundary outbox')
    islander.published([{ promise: '1/d', cookie: '0/b' }])
    islander.publish(7)
    islander.publish(8)
    islander.publish(9)
    islander.receive([
        { id: 'x', cookie: '6', promise: '1/a', value: 1, previous: '1/9' },
        { id: 'x', cookie: '7', promise: '1/b', value: 2, previous: '1/a' },
        { id: 'x', cookie: '0', promise: '2/0', value: 0, previous: '1/b' },
    ])
    assert(islander.outbox(), [
        { id: 'x', cookie: '8', value: 6, internal: false },
        { id: 'x', cookie: 'c', value: 7, internal: false },
        { id: 'x', cookie: 'd', value: 8, internal: false },
        { id: 'x', cookie: 'e', value: 9, internal: false }
    ], 'second boundary resend outbox')
    islander.published([])
    assert(islander.outbox(), [
        { id: 'x', cookie: 'f', value: 0 }
    ], 'third boundary')
    islander.published([{ id: 'x', promise: '2/5', cookie: 'f' }])
    islander.receive([
        { id: 'x', cookie: '8', promise: '2/1', value: 6, previous: '2/0' },
        { id: 'x', cookie: 'c', promise: '2/2', value: 7, previous: '2/1' },
        { id: 'x', cookie: '0', promise: '3/0', value: 0, previous: '2/2',
            value: {
                remap: [
                    { was: '2/3', is: '3/1' },
                    { was: '2/4', is: '3/2' },
                    { was: '2/5', is: '3/3' }
                ]
            }
        }
    ])
    islander.receive([
        { id: 'x', cookie: 'd', promise: '3/1', value: 8, previous: '3/0' },
        { id: 'x', cookie: 'e', promise: '3/2', value: 9, previous: '3/1' },
        { id: 'x', cookie: 'f', promise: '3/3', value: 0, previous: '3/2' }
    ])
    assert(islander.boundary == null, 'third bounary consumed')
    islander.publish(1)
    islander.publish(2)
    islander.publish(3)
    assert(islander.outbox(), [
        { id: 'x', cookie: '10', value: 1, internal: false },
        { id: 'x', cookie: '11', value: 2, internal: false },
        { id: 'x', cookie: '12', value: 3, internal: false }
    ], 'fourth outbox')
    islander.published([
        { id: 'x', cookie: '10', promise: '3/6' },
        { id: 'x', cookie: '11', promise: '3/7' },
        { id: 'x', cookie: '12', promise: '3/8' }
    ])
    islander.receive([
        { id: 'x', cookie: '0', promise: '4/0', value: 0, previous: '3/3',
            value: {
                remap: [
                    {  was: '3/5', is: '4/1' },
                    {  was: '3/6', is: '4/2' },
                    {  was: '3/7', is: '4/3' },
                    {  was: '3/8', is: '4/4' }
                ]
            }
        }
    ])
    islander.receive([
        { id: '8', cookie: '10', promise: '4/1', value: 1, previous: '4/0' },
        { id: 'x', cookie: '10', promise: '4/2', value: 1, previous: '4/1' },
        { id: 'x', cookie: '0', promise: '5/0', value: 0, previous: '3/4',
            value: {
                remap: [
                    {  was: '4/2', is: '5/1' },
                    {  was: '4/3', is: '5/2' },
                    {  was: '4/4', is: '5/3' }
                ]
            }
        }
    ])
    assert(islander.sent.ordered.length, 2, 'all remapped')
    assert(islander.outbox(), [], 'after remap, nothing to transmit')
    islander.receive([
        { cookie: '0/11', promise: '5/1', value: 2, previous: '5/0' },
        { cookie: '0/12', promise: '5/2', value: 3, previous: '5/1' }
    ])
    assert(islander.sent.ordered.length, 2, 'all consumed')
}
