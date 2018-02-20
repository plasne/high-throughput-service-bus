# High-Throughput to Azure Service Bus

Let this project serve as an example of how to achieve high-throughput to an Azure Service Bus from a backend service.

## Problem Statement

A web request is made to a backend service hosted as a Linux App Service running Node.js in Azure (this used the default Node container image). The backend service translates that request into a number of messages that are sent to Azure Service Bus. The message volume can be between 2-8 per second.

Unfortunately, at a high message volume the App Service would quickly become overloaded and stop processing the outbound requests for a few minutes at a time.

## Root Cause

The issue was determined to be a problem with the number of outbound connections. The container is sending traffic to a public endpoint for Service Bus and that traffic is going through a SNAT process which limits the number of outbound connections. It does not appear to be as simple as the total number of connections, but rather the process of establishing lots of new connections for a sustained period of time.

## Solution

Using a connection pool for the outbound connections to Service Bus was ultimately the fix, however, there is also a queue/dispatch method introduced in this code that should help throttle the traffic to the desired level.

### Connection Pool

The following code snippet shows using [agentkeepalive](https://github.com/node-modules/agentkeepalive) to limit the number of connections to 40 and more importantly to keep a pool of at least 10 connections alive. This significantly reduces the opening/closing of connections and allows the SNAT work properly.

```node
const azure = require("azure");
const keepalive = require("agentkeepalive");

const service = azure.createServiceBusService(connectionString).withFilter(retryOperations);
const keepaliveAgent = new keepalive.HttpsAgent();
keepaliveAgent.maxSockets = 40;
keepaliveAgent.maxFreeSockets = 10;
keepaliveAgent.timeout = 60000;
keepaliveAgent.keepAliveTimeout = 300000;
service.setAgent(keepaliveAgent);
```

### Queue / Dispatch

The following code shows a simple queue and dispatch method that limits the number of messages going to Service Bus at any given time. When the keepaliveagent above does queue the requests if it cannot fulfill them, having a separate queue process:

* allows your application to control what happens when you have too many requests
* would allow you to keep track of total latency (ie. the time from when the client asks to when the request is fulfilled)
* allows you to control the volume to traffic you are sending to the Service Bus in case you want fewer partitions (cheaper cost)

You will see that at the end of every Node event loop, the messages are dispatched up to the concurrency limit. You will notice that as requests are completed, new ones are dispatched immediately.

```node
const messages = [];
let inflight = 0;

function send(message) {
    return new Promise((resolve, reject) => {
    ...
    });
}

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

messages.push("first");
messages.push("second");

setTimeout(dispatch, 0);
```

## Running

Rename the sample.json configuration file to default.json and modify the parameters per your environment.

To start the server:

```bash
node server
```

To start a client showing a status every 10 seconds:

```
node client --status
```

To start a client producing traffic:

```
node client --produce
```

To see a complete list of client commands:

```
node client --help
```

## Proof

Below are the test results prior to adding keepaliveagent, even with the queue/dispatch:

```bash
Produce 8 messages every 1000ms with 100 concurrency.
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 7 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 2 inflight...
adding 8 to queue of 0 with 10 inflight...
adding 8 to queue of 0 with 0 inflight...
adding 8 to queue of 0 with 18 inflight...
adding 8 to queue of 0 with 26 inflight...
adding 8 to queue of 0 with 34 inflight...
adding 8 to queue of 0 with 42 inflight...
adding 8 to queue of 0 with 50 inflight...
adding 8 to queue of 0 with 58 inflight...
...
adding 8 to queue of 550 with 100 inflight...
adding 8 to queue of 558 with 100 inflight...
adding 8 to queue of 566 with 100 inflight...
adding 8 to queue of 574 with 100 inflight...
adding 8 to queue of 582 with 100 inflight...
adding 8 to queue of 590 with 100 inflight...
adding 8 to queue of 598 with 100 inflight...
adding 8 to queue of 606 with 100 inflight...
adding 8 to queue of 614 with 100 inflight...
adding 8 to queue of 622 with 100 inflight...
adding 8 to queue of 630 with 100 inflight...
...
{ code: 'ETIMEDOUT',
  errno: 'ETIMEDOUT',
  syscall: 'connect',
  address: '52.168.133.227',
  port: 443 }
 
===== status =====
queued: 0
inflight: 74
errors: 0
concurrency: 100
100.000%: 126 written, 173 ms avg latency (81 - 407)
99.990%: 125 written, 171 ms avg latency (81 - 401)
99.900%: 125 written, 171 ms avg latency (81 - 401)
99.000%: 124 written, 169 ms avg latency (81 - 399)
95.000%: 119 written, 161 ms avg latency (81 - 320)
90.000%: 113 written, 156 ms avg latency (81 - 222)
===== status =====
queued: 38
inflight: 100
errors: 0
concurrency: 100
100.000%: 126 written, 173 ms avg latency (81 - 407)
99.990%: 125 written, 171 ms avg latency (81 - 401)
99.900%: 125 written, 171 ms avg latency (81 - 401)
99.000%: 124 written, 169 ms avg latency (81 - 399)
95.000%: 119 written, 161 ms avg latency (81 - 320)
90.000%: 113 written, 156 ms avg latency (81 - 222)
...
===== status =====
queued: 924
inflight: 100
errors: 2
concurrency: 100
100.000%: 126 written, 173 ms avg latency (81 - 407)
99.990%: 125 written, 171 ms avg latency (81 - 401)
99.900%: 125 written, 171 ms avg latency (81 - 401)
99.000%: 124 written, 169 ms avg latency (81 - 399)
95.000%: 119 written, 161 ms avg latency (81 - 320)
90.000%: 113 written, 156 ms avg latency (81 - 222)
...
===== status =====
queued: 0
inflight: 0
errors: 696
concurrency: 100
100.000%: 528 written, 9627 ms avg latency (25 - 66519)
99.990%: 527 written, 9519 ms avg latency (25 - 66400)
99.900%: 527 written, 9519 ms avg latency (25 - 66400)
99.000%: 522 written, 8975 ms avg latency (25 - 66228)
95.000%: 501 written, 6582 ms avg latency (25 - 65649)
90.000%: 475 written, 3400 ms avg latency (25 - 63550)
```

Here are the test results after adding it:

```bash
===== status =====
queued: 0
inflight: 3
errors: 0
concurrency: 100
100.000%: 3045 written, 97 ms avg latency (17 - 799)
 99.990%: 3044 written, 97 ms avg latency (17 - 741)
 99.900%: 3041 written, 97 ms avg latency (17 - 537)
 99.000%: 3014 written, 94 ms avg latency (17 - 338)
 95.000%: 2892 written, 89 ms avg latency (17 - 166)
 90.000%: 2740 written, 85 ms avg latency (17 - 145)
```

## Notification Hub

Notification Hub offers the same .setAgent() function and this fix works for it as well.
