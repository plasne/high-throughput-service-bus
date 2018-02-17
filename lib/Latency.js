
class Bucket {

    get range() {
        return this._range;
    }

    get total() {
        return this._total;
    }

    get count() {
        return this._count;
    }

    get avg() {
        return this._avg;
    }

    get min() {
        return this._min;
    }

    get max() {
        return this._max;
    }

    calc(times) {

        // trim down to the range
        const trimmed = times.slice(0);
        const trimBy = Math.ceil( (1.0 - this.range) * trimmed.length );
        trimmed.splice(-trimBy, trimBy);

        // calculate
        this._count = trimmed.length;
        for (let time of trimmed) {
            this._total += time;
            if (time < this.min) this._min = time;
            if (time > this.max) this._max = time;
        }
        this._avg = Math.ceil(this._total / this._count);

    }

    constructor(range) {
        this._range = range;
        this._total = 0;
        this._count = 0;
        this._avg = 0;
        this._min = Number.MAX_SAFE_INTEGER;
        this._max = Number.MIN_SAFE_INTEGER;
    }
}

module.exports = class Latency {

    get times() {
        return this._times;
    }

    get count() {
        return this._times.length;
    }

    add(time) {
        if (Array.isArray(time)) {
            this._times = this._times.concat(time);
        } else {
            this._times.push(time);
        }
    }

    calc() {

        // sort the times (ascending)
        this._times.sort((a, b) => { return a - b; });

        // create the buckets to examine
        const buckets = [
            new Bucket(1.0),
            new Bucket(0.9999),
            new Bucket(0.999),
            new Bucket(0.99),
            new Bucket(0.95),
            new Bucket(0.90)
        ];

        // calculate
        for (let bucket of buckets) {
            bucket.calc(this._times);
        }

        return buckets;
    }

    constructor() {
        this._times = [];
    }

}