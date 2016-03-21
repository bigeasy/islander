var assert = require('assert')
var Monotonic = require('monotonic')
var RBTree = require('bintrees').RBTree
var Id = require('paxos/id')
var unshift = [].unshift

function Islander (id) {
    this.id = id
    this.boundary = null
    this.flush = false
    this.cookie = id + '/' + 0
    this.sent = { ordered: [], indexed: {} }
    this.pending = { ordered: [], indexed: {} }
    this.length = 0
    this.log = new RBTree(function (a, b) { return Id.compare(a.promise, b.promise) })
}

Islander.prototype.publish = function (value, internal) {
    var cookie = this.nextCookie()
    var request = { cookie: cookie, value: value, internal: !!internal }
    this.pending.ordered.push(request)
    this.pending.indexed[cookie] = request
    return cookie
}

Islander.prototype.nextCookie = function () {
    return this.cookie = Id.increment(this.cookie, 1)
}

Islander.prototype.outbox = function () {
    var outbox = []
    if (this.flush) {
        outbox = [{ cookie: this.nextCookie(), value: 0 }]
    } else if (!this.boundary && this.sent.ordered.length == 0 && this.pending.ordered.length != 0) {
        this.sent = this.pending
        outbox = this.sent.ordered.map(function (request) {
            return { cookie: request.cookie, value: request.value, internal: request.internal }
        }, this)
        this.pending = { ordered: [], indexed: {} }
    }
    return outbox
}

Islander.prototype.published = function (receipts) {
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
}

Islander.prototype.prime = function (entry) {
    this.uniform = entry.promise
    this.length = 1
    this.log.insert(entry)
    this.log.min().uniform = true
    return entry
}

Islander.prototype.retry = function () {
    unshift.apply(this.pending.ordered, this.sent.ordered)
    this.sent.ordered.forEach(function (request) {
        delete request.promise
        this.pending.indexed[request.cookie] = request
    }, this)
    this.sent = { ordered: [], indexed: {} }
}

Islander.prototype.playUniform = function (entries) {
    var start = this.uniform, iterator = this.log.findIter({ promise: start }),
        previous, current,
        request

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
        var request = this.sent.ordered[0] || { cookie: '/' }, boundary = this.boundary
        if (request.cookie == current.cookie) {
            assert(request.promise == null
                || Id.compare(request.promise, current.promise) == 0, 'cookie/promise mismatch')
            this.sent.ordered.shift()
        } else if (messagesLost.call(this)) {
            if (Id.isGovernment(current.promise) && current.value && current.value.remap) {
                if (this.boundary) {
                    var mapping = current.value.remap.filter(function (mapping) {
                        return this.boundary.promise == mapping.was
                    }, this).shift()
                    assert(mapping, 'remap did not include posted boundary')
                    this.boundary.promise = mapping.is
                } else {
                    var remapped = []
                    current.value.remap.forEach(function (mapping) {
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
        return (boundary && Id.compare(current.promise, boundary.promise) >= 0) ||
               (request.promise && Id.compare(current.promise, request.promise) > 0)
    }

    return start
}

Islander.prototype._ingest = function (entries) {
    entries.forEach(function (entry) {
        var found = this.log.find({ promise: entry.promise })
        if (!found) {
            this.log.insert(entry)
        }
    }, this)
}

Islander.prototype.receive = function (entries) {
    this._ingest(entries)
    return this.playUniform()
}

module.exports = Islander
