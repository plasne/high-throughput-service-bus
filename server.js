const azure = require("azure");
const randomstring = require("randomstring");
const Latency = require("./lib/Latency.js");
const tedious = require("tedious");
const express = require("express");

const app = express();

const scenario = "appsrv/container";
const port = process.env.PORT || 8000;

const retryOperations = new azure.ExponentialRetryPolicyFilter();
const service = azure.createServiceBusService("Endpoint=sb://pelasne-servicebus.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=Un2Efi+ANsVtznBuVS5mqAj9MJs9JfM0uHBoL7S5v3M=").withFilter(retryOperations);

function write(query) {
    return new Promise((resolve, reject) => {

        // open a connection
        const connection = new tedious.Connection({
            userName: "plasne",
            password: "Vampyr0000!!!!",
            server: "pelasne-statsdb.database.windows.net",
            options: {
                encrypt: true,
                database: "pelasne-stats"
            }
        });
        
        // write the query
        connection.on("connect", err => {
            const request = new tedious.Request(query, (err, count) => {
                if (!err) {
                    resolve();
                } else {
                    reject(err);
                }
            });
            connection.execSql(request);
        });

    });
}

function create() {
    
    // create the table
    return write(`DROP TABLE dbo.log; IF NOT EXISTS (
        SELECT * FROM sys.tables t JOIN sys.schemas s ON (t.schema_id = s.schema_id)
        WHERE s.name = 'dbo' AND t.name = 'log'
    ) CREATE TABLE dbo.log (
        scenario varchar(50) NOT NULL,
        timestamp datetime2 NOT NULL, success int NOT NULL,
        failure int NOT NULL, latency int NOT NULL
    )`).then(_ => {
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
    });

}

// provide a space to record times
let latency = new Latency();

create().then(_ => {

    // generate 10 messages per second
    setInterval(_ => {
        
        // generate a fake message
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
        const body = JSON.stringify(msg);

        // send the message
        const start = new Date().getTime();
        service.sendTopicMessage("MyTopic", {
            body: body
        }, err => {
            const end = new Date().getTime();
            if (!err) {
                const duration = end - start;
                latency.add(duration);
                //console.log(`success after ${duration}ms.`);
            } else {
                latency.fail();
                console.error(err);
            }
        });

    }, (1000 / 8)); // 8 per second

    // calculate results
    setInterval(_ => {
        const buckets = latency.calc();
        const all = buckets[0];
        write(`INSERT INTO dbo.log (scenario, timestamp, success, failure, latency) VALUES ('${scenario}', GetDate(), ${all.count}, ${all.fails}, ${all.avg});`);
        for (let bucket of buckets) {
            console.log(`bucket ${bucket.range}, success: ${bucket.count}, fails: ${bucket.fails}, min: ${bucket.min}ms, max: ${bucket.max}ms, avg: ${bucket.avg}ms`);
        }
        latency = new Latency();
    }, 60000 * 15); // every 15 minutes

}).catch(err => {
    console.error(err);
});

app.get("/latency", (req, res) => {
    const buckets = latency.calc();
    res.send(buckets);
});

app.get("/", (req, res) => {
    res.redirect("/latency");
});

app.listen(port, _ => {
    console.log(`listening on port ${port}...`);
});