// Promise remapping is not required to function. You could post, track cookies
// and flush on failure or if we get a government that is mapped as collapsed.
// We'd trust that Paxos is remapping so long as the government doesn't
// collapse.
//
// There is a race involving whether you got confirmation before or after
// collapse that promises make unambiguous and at the time of writing I'm not
// going to assume you're simply err on the side of flushing. It's probably
// worth it to fuss with promises to resolve this ambiguity, but then remapping
// is probably not necessary to function.
//
// Remapping is, however, a powerful assertion that these different different
// algorithms are working together properly. We're asserting that Paxos is
// remapping completely and correctly.
//
const assert = require('assert')
const Paxos = require('paxos')

class Islander {
    constructor (id, outbox) {
        this.id = id
        this._cookie = '0'
        // TODO What is the structure, how are objects grouped? It appears that
        // `_seeking` are sent batches, generally zero or one outstanding messages
        // followed by zero or more flush messages. Confirm and document.
        //
        // Our structure is something like the one in `Sequester`, but not really.
        this._seeking = { messages: [] }
        // Pending appears to be the next first entry into `_seeking`, one that we
        // build while we are waiting for all of the seeking entries to arrive.
        this._pending = []
        // Only pull one message from the outbox at a time.
        this.outbox = outbox
    }

    _nextCookie () {
        return this._cookie = Paxos.increment(this._cookie, 0)
    }

    // We publish a batch of messages and wait for that batch to pass through
    // consensus before publishing a subsequent batch. While we're waiting for
    // messages to pass through pending messages accumulate in our pending list.

    //
    publish (body) {
        assert(body, 'body cannot be null')
        this._pending.push({ id: this.id, cookie: null, body: body, promise: null })
        this._nudge()
    }

    // Possibly publish a batch messages if there are messages available and we're
    // not currently waiting on any to pass through consensus.
    //
    // Properties of a submission are that our results will have promises that are
    // all from the same government. We reassign cookies. They are for Islander to
    // track, not for public consumption. If their are retries in the submission,
    // they will get new cookies.

    //
    _nudge () {
        if (
            this._seeking.messages.length == 0 &&
            this._pending.length != 0
        ) {
            const messages = this._pending.splice(0, this._pending.length)
            // Assign cookies. Cookies get reset on retry. We need to reset their
            // promises to null because some of the messages may be retries.
            for (const message of messages) {
                message.cookie = this._nextCookie()
                message.promise = null
            }
            this._seeking = { cookie: this._cookie, messages: messages }
            this.outbox.push({
                cookie: this._seeking.cookie,
                messages: this._seeking.messages.map((message) => {
                    return {
                        id: message.id,
                        cookie: message.cookie,
                        body: JSON.parse(JSON.stringify(message.body))
                    }
                })
            })
        }
    }

    // TODO Ensure that `_retry` is not called when we're waiting on a send. Come
    // back and read through the code, add assertions.

    // A flush message is a message with a cookie but no body. We send a flush
    // message to resolve race conditions between the waiting on a return value from
    // the submission of messages into the consensus and the arrival of messages
    // about changes in government with associated promise remapping.

    //
    _flush () {
        this._seeking.cookie = this._nextCookie()
        this._seeking.flushing = true
        this.outbox.push({
            cookie: this._seeking.cookie,
            messages: [{ id: this.id, cookie: this._seeking.cookie, body: null }]
        })
    }

    // TODO Need to timeout flushes, make sure we're not hammering a broken
    // government.

    // Called from the envelope with receipts from a submission to the consensus
    // algorithm. Using the `receipts` we assign a promise to each of messages we
    // sent based on their cookie. If `receipts` is `null`, than the submission
    // failed for whatever reason. We also mark the submission completed.

    //
    sent (cookie, receipts) {
        if (this._seeking.cookie == cookie) {
            if (receipts == null) {
                this._flush()
            } else if (this._seeking.flushing) {
                this._seeking.promise = receipts[this._seeking.cookie]
            } else {
                for (const message of this._seeking.messages) {
                    message.promise = receipts[message.cookie]
                }
            }
        }
    }

    // Long diatribe. Initially about race conditions possibly introduced by the
    // process boundary between the Compassion Colleague and the Conference based
    // application that it is running. Doesn't seem likely to me.

    // Then a wondering why we don't just track the cookies alone. This trails off
    // into a realization that the current system with the remapping is definitive.

    // Possibly there is some confusion about using an outbox when there is only
    // ever one message outbound at a time. It is a single message with an array of
    // accumulated messages to send. A structure like Turnstile. Check seems more
    // appropriate, but it isn't really, because the callback is assigned at
    // construction. Procession indicates you can connect later.

    //
    push (entry) {
        // End-of-stream.
        if (entry == null) {
            return
        }

        // User must provide items in order.
        assert(this._previous == entry.previous || this._previous == null, 'out of order')

        // Make note of the previous promise.
        this._previous = entry.promise

        // If we are not waiting on any messages then there is nothing to do.
        if (this._seeking.messages.length == 0) {
            return
        }

        // Take note of a new government.
        if (Paxos.isGovernment(entry.promise)) {
            const map = entry.body.map
            if (map == null) {
                // Government collapse so all pending messages have been discarded.
                // We could simply resubmit now anything we're holding that has a
                // promise assigned. That promise means it's queued and the queued
                // is empty, but we'd probably just be hammering on a government
                // trying to hold an election. If we don't hold a promise, we are
                // waiting on our publish request which might yet succeed, so we
                // wouldn't want to post. But, still, seems best to flush first as a
                // means to determine when Paxos has recovered.
                this._flush()
            } else if (this._seeking.flushing) {
                if (this._seeking.promise == null) {
                    // Didn't get our flushing promise so try again.
                    this._flush()
                } else if (Paxos.compare(this._seeking.promise, entry.promise) < 0) {
                    // This government entry may proceed our request and response so
                    // that the promise we're waiting for in order to flush comes
                    // after the government and is therefore not remapped.
                    this._seeking.promise = map[this._seeking.promise]
                    assert(this._seeking.promise, 'remap did not remap all posted entries')
                }
            } else if (this._seeking.messages[0].promise != null) {
                // This government entry may proceed our request and response so
                // that the first promise we're waiting for comes after the
                // government and is therefore not remapped.
                if (Paxos.compare(this._seeking.messages[0].promise, entry.promise) < 0) {
                    // Remap.
                    for (const message of this._seeking.messages) {
                        message.promise = map[message.promise]
                    }
                    assert(this._seeking.messages.reduce(function (remapped, message) {
                        return remapped && message.promise != null
                    }, true), 'remap did not remap all posted entries')
                }
            } else {
                // We received a new government entry before we received promises we
                // could receive promises used to remap.
                this._flush()
            }
        // If this entry does pertains to us, look closer.
        } else if (this.id == entry.body.id) {
            // Shift a message from our list of awaiting messages if we see it.
            if (entry.body.cookie == this._seeking.messages[0].cookie) {
                const message = this._seeking.messages.shift()
                assert(message.promise == null || message.promise == entry.promise, 'promise mismatch')
                // If we've consumed all the messages, maybe sent out another batch.
                if (this._seeking.messages.length == 0) {
                    this._nudge()
                }
            } else if (entry.body.cookie == this._seeking.cookie) {
                // We've flushed so it is time to retry.
                Array.prototype.unshift.apply(this._pending, this._seeking.messages)
                this._seeking.messages.length = 0
                this._nudge()
            }
        }
    }

    health () {
        return {
            waiting: this._seeking.messages.length,
            pending: this._pending.length
        }
    }
}

module.exports = Islander
