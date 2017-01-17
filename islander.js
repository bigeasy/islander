// TODO Optionally surrender retries on collapse.
var assert = require('assert')
var Monotonic = require('monotonic').asString
var RBTree = require('bintrees').RBTree
var unshift = [].unshift
var logger = require('prolific.logger').createLogger('islander')
var Vestibiule = require('vestibule')

function Islander (id) {
    this.id = id
    this.boundary = null
    this.flush = false
    this.cookie = '0'
    this.sent = { ordered: [], indexed: {} }
    this.pending = { ordered: [], indexed: {} }
    this.sending = false
    this.length = 0
    this.outgoing = new Vestibiule
    this.log = new RBTree(function (a, b) { return Monotonic.compare(a.promise, b.promise) })
}

Islander.prototype._trace = function (method, vargs) {
    logger.trace(method, { $vargs: vargs })
}

Islander.prototype.publish = function (value, internal) {
    this._trace('publish', [ value, internal ])
    var cookie = this.nextCookie()
    var request = { cookie: cookie, value: value, internal: !!internal }
    this.pending.ordered.push(request)
    this.outgoing.notify()
    this.pending.indexed[cookie] = request
    return cookie
}

Islander.prototype.nextCookie = function () {
    this._trace('nextCookie', [])
    return this.cookie = Monotonic.increment(this.cookie, 0)
}

// TODO Need to timeout flushes, make sure we're not hammering a broken
// government.
Islander.prototype.outbox = function () {
    this._trace('outbox', [])
    assert(!this.sending)
    var outbox = []
    if (this.flush) {
        outbox = [{ id: this.id, cookie: this.nextCookie(), value: 0 }]
    } else if (!this.boundary && this.sent.ordered.length == 0 && this.pending.ordered.length != 0) {
        this.sent = this.pending
        outbox = this.sent.ordered.map(function (request) {
            return { id: this.id, cookie: request.cookie, value: request.value, internal: request.internal }
        }, this)
        this.pending = { ordered: [], indexed: {} }
    }
    this.sending = outbox.length != 0
    return outbox
}

Islander.prototype.published = function (receipts) {
    this._trace('published', [ receipts ])
    this.sending = false
    if (receipts.length === 0) {
        this.flush = true
    } else if (this.flush) {
        assert(receipts.length == 1, 'too many receipts')
        this.flush = false
        this.boundary = receipts[0]
    } else {
        receipts.forEach(function (receipt) {
            assert(!this.sent.indexed[receipt.cookie].promise, 'duplicate receipt')
            this.sent.indexed[receipt.cookie].promise = receipt.promise
        }, this)
    }
    delete this.sent.indexed
    this.playUniform()
}

Islander.prototype.prime = function (entry) {
    this._trace('prime', [ entry ])
    // TODO Create new object or sub-object instead of copy.
    entry = JSON.parse(JSON.stringify(entry))
    this.uniform = entry.promise
    this.length = 1
    this.log.insert(entry)
    this.log.min().uniform = true
    return entry
}

Islander.prototype.retry = function () {
    this._trace('retry', [])
    unshift.apply(this.pending.ordered, this.sent.ordered)
    this.sent.ordered.forEach(function (request) {
        delete request.promise
        this.pending.indexed[request.cookie] = request
    }, this)
    this.sent = { ordered: [], indexed: {} }
}

Islander.prototype.playUniform = function (entries) {
    this._trace('playUniform', [ entries ])
    var start = this.uniform, iterator = this.log.findIter({ promise: start }),
        previous, current,
        request

    if (this.sending) {
        return start
    }

    for (;;) {
        previous = iterator.data(), current = iterator.next()
        if (!current) {
            break
        }
        current.uniform = current.previous == previous.promise
        if (!current.uniform) {
            break
        }
        previous.next = current
        this.uniform = current.promise
        this.length++
        var request = this.sent.ordered[0] || { id: null, cookie: null }, boundary = this.boundary
        if (this.id == current.value.id && request.cookie == current.value.cookie) {
            assert(request.promise == null
                || request.promise == current.promise, 'cookie/promise mismatch')
            this.sent.ordered.shift()
        } else if (messagesLost.call(this)) {
            if (Monotonic.isBoundary(current.promise, 0) && current.value && current.value.map) {
                if (this.boundary) {
                    var mapping = current.value.map.filter(function (mapping) {
                        return this.boundary.promise == mapping.was
                    }, this).shift()
                    assert(mapping, 'remap did not include posted boundary')
                    this.boundary.promise = mapping.is
                } else {
                    var remapped = []
                    current.value.map.forEach(function (mapping) {
                        if (this.sent.ordered.length && mapping.was == this.sent.ordered[0].promise) {
                            var request = this.sent.ordered.shift()
                            request.promise = mapping.is
                            remapped.push(request)
                        }
                    }, this)
                    assert(this.sent.ordered.length == 0, 'remap did not remap all posted entries')
                    this.sent.ordered = remapped
                }
            } else {
                this.retry()
            }
            delete this.boundary
        }
    }

    function messagesLost () {
        return (boundary && Monotonic.compare(current.promise, boundary.promise) >= 0) ||
               (request.promise && Monotonic.compare(current.promise, request.promise) > 0)
    }

    return start
}

Islander.prototype._ingest = function (entries) {
    this._trace('_ingest', [ entries ])
    entries.forEach(function (entry) {
        var found = this.log.find({ promise: entry.promise })
        if (!found) {
            this.log.insert(JSON.parse(JSON.stringify(entry)))
        }
    }, this)
}

Islander.prototype.receive = function (entries) {
    this._trace('receive', [ entries ])
    this._ingest(entries)
    return this.playUniform()
}

module.exports = Islander
