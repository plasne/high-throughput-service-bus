
const request = require("request");

setInterval(_ => {
    request({
        method: "POST",
        uri: "http://localhost:8000/messages",
        body: "default"
    }, (err, response, body) => {
        if (!err && response.statusCode >= 200 && response.statusCode <= 299) {
            console.log(body);
        } else if (err) {
            console.error(err);
        } else {
            console.error(`${response.statusCode}: ${response.statusMessage}`);
        }
    });
}, 10 * 1000); // every 10 sec
