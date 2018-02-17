
const request = require("request");

setInterval(_ => {
    request({
        method: "POST",
        uri: "http://localhost:8000/messages"
    }, (err, response, body) => {
        if (!err) {
            console.log(body);
        } else {
            console.log(err);
        }
    });
}, 10 * 1000); // every 10 sec
