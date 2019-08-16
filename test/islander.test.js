describe('islander', () => {
    const assert = require('assert')
    it('can pass this test', () => {
        const Islander = require('../islander')

        const outbox = []
        const islander = new Islander('x', outbox)
        let messages

        assert.equal(outbox.shift(), null, 'outbox is empty')

        islander.push({ body: {}, promise: '1/0', previous: '0/0' })

        assert.equal(outbox.length, 0, 'outbox is still empty')

        islander.push({ body: { id: '2', cookie: '0', body: 1 }, promise: '1/1', previous: '1/0' })

        islander.publish(1)
        islander.publish(2)
        islander.publish(3)
        assert.deepStrictEqual(islander.health(), { waiting: 1, pending: 2 }, 'sent')
        messages = outbox.shift()
        assert(messages, 'outbox ready')
        assert.deepStrictEqual(messages, {
            cookie: '1',
            messages: [{ id: 'x', cookie: '1', body: 1 }]
        }, 'outbox is not empty')
        islander.sent('1', { '1': '1/3' })

        islander.push({ body: { id: 'y', cookie: '1', body: 1 }, promise: '1/2', previous: '1/1' })
        islander.push({ body: { id: 'x', cookie: '1', body: 1 }, promise: '1/3', previous: '1/2' })

        messages = outbox.shift()
        assert.deepStrictEqual(messages, {
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
        assert.deepStrictEqual(islander.health(), { waiting: 0, pending: 0 }, 'consumed')

        islander.publish(4)

        islander.push({
            promise: '2/0', previous: '1/5',
            body: { map: null }
        })

        islander.push({
            promise: '3/0', previous: '2/0',
            body: { map: {} }
        })

        assert.deepStrictEqual([ outbox.shift(), outbox.shift(), outbox.shift() ], [{
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

        assert.deepStrictEqual(islander.health(), { waiting: 0, pending: 0 }, 'publish response too late consumed')

        islander.push({
            promise: '4/2', previous: '4/1',
            body: { id: 'x', cookie:  '5' }
        })

        islander.push({
            promise: '4/3', previous: '4/2',
            body: { id: 'x', cookie:  '6' }
        })

        islander.publish(5)

        assert.deepStrictEqual(outbox.shift(), {
            cookie: '7',
            messages: [{ id: 'x', cookie: '7', body: 5 }]
        }, 'publish miss remapping')
        islander.push({
            promise: '5/0', previous: '4/3',
            body: { map: { '4/4': '5/1' } }
        })
        islander.sent('7', { '7': '4/3' })

        assert.deepStrictEqual(outbox.shift(), {
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
        assert.deepStrictEqual(outbox.shift(), {
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

        assert.deepStrictEqual(islander.health(), { waiting: 0, pending: 0 }, 'publish miss remapping consumed')

        islander.publish(7)
        assert.deepStrictEqual(outbox.shift(), {
            cookie: 'a',
            messages: [{ id: 'x', cookie: 'a', body: 7 }]
        }, 'publish and skip remapping messages')
        islander.sent('a', { 'a': '8/1' })
        islander.push({
            promise: '8/0', previous: '7/1',
            body: { map: {} }
        })
        islander.push({
            promise: '8/1', previous: '8/0',
            body: { id: 'x', cookie:  'a' }
        })

        assert.deepStrictEqual(islander.health(), { waiting: 0, pending: 0 }, 'publish and skip remapping messages consumed')

        islander.publish(8)
        assert.deepStrictEqual(outbox.shift(), {
            cookie: 'b',
            messages: [{ id: 'x', cookie: 'b', body: 8 }]
        }, 'publish failure')
        islander.sent('b', null)
        assert.deepStrictEqual(outbox.shift(), {
            cookie: 'c',
            messages: [{ id: 'x', cookie: 'c', body: null }]
        }, 'publish failure flush')
        islander.sent('c', { 'c': '8/2' })
        islander.push({
            promise: '8/2', previous: '8/1',
            body: { id: 'x', cookie:  'c' }
        })
        assert.deepStrictEqual(outbox.shift(), {
            cookie: 'd',
            messages: [{ id: 'x', cookie: 'd', body: 8 }]
        }, 'publish failure resend')
        islander.sent('d', { 'd': '8/3' })
        islander.push({
            promise: '8/3', previous: '8/2',
            body: { id: 'x', cookie:  'd' }
        })

        assert.deepStrictEqual(islander.health(), { waiting: 0, pending: 0 }, 'done')

        islander.push(null)
    })
})
