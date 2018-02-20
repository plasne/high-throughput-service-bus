
// includes
const config  = require("config");
const azure = require("azure");
const randomstring = require("randomstring");
const Latency = require("./lib/Latency.js");
const express = require("express");
const keepalive = require("agentkeepalive");

// global variables
const latency = new Latency();
const messages = [];
const errors = [];
let inflight = 0;
let concurrency = config.get("concurrency");
let errorPointer = 0;
const serverStart = new Date().getTime();

// configure express
const app = express();
const port = process.env.PORT || config.get("port");

// establish a connection to Azure Service Bus
const retryOperations = new azure.ExponentialRetryPolicyFilter();
const connectionString = config.get("connectionString");
const service = azure.createServiceBusService(connectionString).withFilter(retryOperations);
const keepAliveAgent = new keepalive.HttpsAgent();
keepAliveAgent.maxSockets = 40;
keepAliveAgent.maxFreeSockets = 10;
keepAliveAgent.timeout = 60000;
keepAliveAgent.keepAliveTimeout = 300000;
service.setAgent(keepAliveAgent);

// is integer test
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

// send message to topic
function send(message) {
    return new Promise((resolve, reject) => {
        const start = new Date().getTime();
        service.sendTopicMessage("MyTopic", {
            body: message
        }, err => {
            const end = new Date().getTime();
            if (!err) {
                resolve(end - start);
            } else {
                reject(err);
            }
        });
    })
    .then(duration => {
        latency.add(duration);
    })
    .catch(err => {
        console.error(err);
        errors.push(err);
    });
}

// dispatch some queued messages to the topic
function dispatch() {
    while (messages.length > 0 && inflight < concurrency) {
        inflight++;
        const message = messages.shift();
        send(message).then(_ => {
            inflight--;
        });
    }
    setTimeout(dispatch, 0);
}

// create and then put up interface
create().then(_ => {

    // write a batch of messages
    app.post("/messages", (req, res) => {

        // generate and queue a batch of messages
        const count = req.query.count;
        const queueLength = messages.length;
        for (let i = 0; i < count; i++) {

            // generate the message
            const msg = JSON.stringify({
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
            });

            // queue the message
            messages.push(msg);

        }

        // change concurrency
        const c = parseInt(req.query.concurrency, 10);
        if (!Number.isNaN(c) && c !== concurrency) {
            concurrency = c;
            console.log(`concurrency changed to ${concurrency}.`);
        }

        // send a response
        res.send({
            msg: `adding ${count} to queue of ${queueLength} with ${inflight} inflight...`,
            errors: errors.slice(errorPointer)
        });
        errorPointer = errors.length;

    });

    // get status
    app.get("/status", (req, res) => {
        const buckets = latency.calc();
        res.send({
            queued: messages.length,
            inflight: inflight,
            errors: errors.length,
            concurrency: concurrency,
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