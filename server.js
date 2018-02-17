
// includes
const config  = require("config");
const azure = require("azure");
const randomstring = require("randomstring");
const Latency = require("./lib/Latency.js");
const express = require("express");
const async = require("async");

// global variables
let concurrency = config.get("concurrency");
const latency = new Latency();
let messages = [];
const errors = [];
let errorPointer = 0;
const serverStart = new Date().getTime();

let _in = 0;
let _out = 0;

// configure express
const app = express();
const port = process.env.PORT || config.get("port");

// establish a connection to Azure Service Bus
const retryOperations = new azure.ExponentialRetryPolicyFilter();
const connectionString = config.get("connectionString");
const service = azure.createServiceBusService(connectionString).withFilter(retryOperations);

function isInt(a) {
    return (typeof a==='number' && (a%1)===0);
}

// create topic / subscription
function create() {
    return new Promise((resolve, reject) => {

        // create the topic
        const topicOptions = {
            MaxSizeInMegabytes: '5120',
            DefaultMessageTimeToLive: 'PT5S'
        };
        service.createTopicIfNotExists("MyTopic", topicOptions, err => {
            if (!err) {

                // create the subscription
                service.getSubscription("MyTopic", "AllMessages", err => {
                    if (!err) {
                        resolve(); // already exists
                    } else {
                        service.createSubscription("MyTopic", "AllMessages", err => {
                            if (!err) {
                                resolve();
                            } else {
                                reject(err);
                            }
                        });
                    }
                });

            } else {
                reject(err);
            }
        });

    });
}

// send a message to the hub
function send(message) {
    return new Promise((resolve, reject) => {
        _in++;
        const start = new Date().getTime();
        service.sendTopicMessage("MyTopic", {
            body: message
        }, err => {
            _out++;
            const end = new Date().getTime();
            if (!err) {
                const duration = end - start;
                latency.add(duration);
                resolve();
            } else {
                console.log("heads up:");
                reject(err);
            }
        });
    });
}

// dispatch all messages
function dispatch() {
    if (messages.length > 0) {

        // dispatch messages per concurrency
        async.mapLimit(messages, concurrency, async message => {

            // send the message
            try {
                await send(message);
            } catch (ex) {
                errors.push(ex);
                console.error(ex);
            }

        }, (err, results) => {
            
            // recur at next opportunity
            messages = [];
            setTimeout(dispatch, 0);

        });

    } else {

        // recur at next opportunity
        setTimeout(dispatch, 0);

    }
}

// create and then put up interface
create().then(_ => {

    // write a batch of messages
    app.post("/messages", (req, res) => {

        // generate and queue a batch of messages
        const count = req.query.count;
        for (let i = 0; i < count; i++) {
            const msg = {
                v0: randomstring.generate(171),
                v1: randomstring.generate(164),
                v2: randomstring.generate(167),
                v3: randomstring.generate(194),
                v4: randomstring.generate(137),
                v5: randomstring.generate(199),
                v6: randomstring.generate(159),
                v7: randomstring.generate(173),
                v8: randomstring.generate(187),
                v9: randomstring.generate(128)
            };
            messages.push(JSON.stringify(msg));
        }

        // change concurrency
        const c = parseInt(req.query.concurrency, 10);
        if (!Number.isNaN(c) && c !== concurrency) {
            concurrency = c;
            console.log(`concurrency changed to ${concurrency}.`);
        }

        // send a response
        res.send({
            msg: `adding ${count} to existing batch of ${messages.length}...`,
            errors: errors.slice(errorPointer)
        });
        errorPointer = errors.length;

    });

    // get status
    app.get("/status", (req, res) => {
        const buckets = latency.calc();
        res.send({
            queued: messages.length,
            in: _in,
            out: _out,
            concurrency: concurrency,
            errors: errors.length,
            last: errors.slice(errors.length - 10),
            latency: buckets
        });
    });
    
    // redirect to status if nothing is specified
    app.get("/", (req, res) => {
        res.redirect("/status");
    });

    // start dispatching
    setTimeout(dispatch, 0);

}).catch(err => {
    errors.push(err);
    console.error(err);
});
   
// start listening
app.listen(port, _ => {
    console.log(`listening on port ${port}...`);
});