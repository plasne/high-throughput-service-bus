
// includes
const cmd = require("commander");
const config = require("config");
const request = require("request");

// define options
cmd
    .version("0.1.0")
    .option("-u, --uri <value>", "Specify the URL of the service endpoint.")
    .option("-e, --every <value>", "Specify the interval in ms for producing messages.")
    .option("-c, --count <value>", "Specifies the number of messages to produce on a service call.")
    .option("-m, --max <value>", "Specifies the concurrency used by the server to write records. By default, it defers to server.")
    .option("-p, --produce", "If specified, this changes the default to only produce traffic.")
    .option("-s, --status", "If specified, this changes the default to only show status.")
    .parse(process.argv);

// variables
const uri = cmd.uri || config.get("serviceUri");
console.log(`Service URI will be: ${uri}.`);
const every = cmd.every || config.get("every");
const count = cmd.count || config.get("count");
const concurrency = cmd.max || config.get("concurrency");
const produce = (cmd.status && !cmd.produce) ? false : true;
const status = (cmd.produce && !cmd.status) ? false : true;
if (produce) {
    console.log(`Produce ${count} messages every ${every}ms with ${concurrency} concurrency.`);
}
if (status) {
    console.log(`Status will be shown every 10 seconds.`);
}

// instruct the endpoint to query for more 
if (produce) {
    setInterval(_ => {
        request({
            method: "POST",
            uri: `${uri}/messages?count=${count}&concurrency=${concurrency}`,
            json: true
        }, (err, response, body) => {
            if (!err && response.statusCode >= 200 && response.statusCode <= 299) {
                for (let error of body.errors) {
                    console.error(error);
                }
                console.log(body.msg);
            } else if (err) {
                console.error(err);
            } else {
                console.error(`${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }, every);
}

// get status
if (status) {
    setInterval(_ => {
        request({
            method: "GET",
            uri: `${uri}/status`,
            json: true
        }, (err, response, body) => {
            if (!err && response.statusCode >= 200 && response.statusCode <= 299) {
                console.log("===== status =====");
                console.log(`queued: ${body.queued}`);
                console.log(`inflight: ${body.inflight}`);
                console.log(`errors: ${body.errors}`);
                console.log(`concurrency: ${body.concurrency}`);
                for (let bucket of body.latency) {
                    const latency = (bucket._avg) ? `, ${bucket._avg} ms avg latency (${bucket._min} - ${bucket._max})` : "";
                    console.log(`${(bucket._range < 1) ? " " : ""}${(bucket._range * 100).toFixed(3)}%: ${bucket._count} written${latency}`);
                }
            } else if (err) {
                console.error(err);
            } else {
                console.error(`${response.statusCode}: ${response.statusMessage}`);
            }
        });
    }, 1000 * 10); // every 10 sec
}
