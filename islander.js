// TODO Optionally surrender retries on collapse.
var assert = require('assert')
var Monotonic = require('monotonic').asString
var cadence = require('cadence')
var unshift = [].unshift
var logger = require('prolific.logger').createLogger('islander')
var Procession = require('procession')

function Islander (id) {
    this.id = id
    this._cookie = '0'
    // TODO What is the structure, how are objects grouped? It appears that
    // `_seeking` are sent batches, generally zero or one outstanding messages
    // followed by zero or more flush messages. Confirm and document.
    //
    // Our structure somelinke like the one in `Sequester`, but not really.
    this._seeking = { messages: [] }
    // Pending appears to be the next first entry into `_seeking`, one that we
    // biuld while we are waiting for all of the seeking entries to arrive.
    this._pending = []
    this.log = new Procession
    this.log.push({ promise: '0/0' })
    // Only pull one message from the outbox at a time.
    this.outbox = new Procession
}

Islander.prototype._nextCookie = function () {
    return this._cookie = Monotonic.increment(this._cookie, 0)
}

Islander.prototype.publish = function (body) {
    assert(body, 'body cannot be null')
    this._pending.push({ id: this.id, cookie: null, body: body, promise: null })
    this._nudge()
}

Islander.prototype._nudge = function () {
    if (
        this._seeking.messages.length == 0 &&
        this._pending.length != 0
    ) {
        var messages = this._pending.splice(0, this._pending.length)
        // Assign cookies. If some of the messages are retries, we need to reset
        // the messages.
        messages.forEach(function (message) {
            message.cookie = this._nextCookie()
            message.promise = null
        }, this)
        this._seeking = { cookie: this._cookie, messages: messages }
        this._seeking.messages.forEach(function (message) {
            message.promise = null
        })
        this.outbox.push({
            cookie: this._seeking.cookie,
            messages: JSON.parse(JSON.stringify(this._seeking.messages))
        })
    }
}

// TODO Ensure that `_retry` is not called when we're waiting on a send. Come
// back and read through the code, add assertions.

//
Islander.prototype._flush = function () {
    if (this._seeking.cookie == null) {
        this._seeking.flushing = true
        this._seeking.cookie = this._nextCookie()
        this.outbox.push({
            cookie: this._seeking.cookie,
            messages: [{ id: this.id, cookie: this._seeking.cookie, body: null }]
        })
    }
}

// TODO Need to timeout flushes, make sure we're not hammering a broken
// government.

// Called from the envelope with receipts from a submission to the consensus
// algorithm. Using the `receipts` we assign a promise to each of messages we
// sent based on their cookie. If `receipts` is `null`, than the submission
// failed for whatever reason. We also mark the submission completed.

//
Islander.prototype.sent = function (cookie, receipts) {
    if (this._seeking.cookie == cookie) {
        if (receipts == null) {
            this._seeking.cookie = null
        } else if (!this._seeking.flushing) {
            this._seeking.messages.forEach(function (message) {
                message.promise = receipts[message.cookie]
            })
        }
        this._flush()
    }
}

// Long diatribe. Initially about race conditions possibly introduced by the
// process bounardy between the Compassion Colleague and the Conference based
// application that it is running. Doesn't seem likely to me.

// Then a wondering why we don't just track the cookies alone. This trails off
// into a realization that the current system with the remapping is definitive.

// Possibly there is some confusion about using an outbox when there is only
// ever one message outbound at a time. It is a single message with an array of
// accumulated messages to send. A structure like Turnstile.Check seems more
// appropriate, but it isn't really, because the callback is assigned at
// construction. Procession indicates you can connect later.

//
Islander.prototype.push = function (entry) {
    // User must provide items in order.
    assert(this._previous == entry.previous || this._previous == null, 'out of order')

    // Make note of the previous promise.
    this._previous = entry.promise

    // Whatever it is, we can forward it. This is not a filter nor a transform.
    this.log.push(entry)

    // If we are not waiting on any messages then there is nothing to do.
    if (this._seeking.messages.length == 0) {
        return
    }

    // Take note of a new government.
    if (Monotonic.isBoundary(entry.promise, 0)) {
        var map = entry.body.map
        if (map == null) {
            // We will never remap anything so if any cookie we're using for
            // flushing will now be invalid.
            this._seeking.cookie = null
        }
        if (map == null || this._seeking.messages[0].promise == null) {
            // Failed a remap because of a consensus collapse or else we didn't
            // get our receipts in time.
            this._flush()
        } else {
            // Remap.
            this._seeking.messages.forEach(function (message) {
                message.promise = map[message.promise]
            })
            assert(this._seeking.messages.reduce(function (remapped, message) {
                return remapped && message.promise != null
            }, true), 'remap did not remap all posted entries')
        }
    // If this entry does pertains to us, look closer.
    } else if (this.id == entry.body.id) {
        // Shift a message from our list of awaiting messages if we see it.
        if (entry.body.cookie == this._seeking.messages[0].cookie) {
            this._seeking.messages.shift()
            // If we've consumed all the messages, maybe sent out another batch.
            if (this._seeking.messages.length == 0) {
                this._nudge()
            }
        } else if (entry.body.cookie == this._seeking.cookie) {
            // We've flushed so it is time to retry.
            var retries = this._seeking.messages.splice(0, this._seeking.messages.length)
            Array.prototype.unshift.apply(this._pending, retries)
            this._nudge()
        }
    }
}

Islander.prototype.enqueue = cadence(function (async, entry) {
    this.push(entry)
})

Islander.prototype.health = function () {
    return {
        waiting: this._seeking.messages.length,
        pending: this._pending.length
    }
}

module.exports = Islander
