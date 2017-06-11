#!/bin/env node
Array.prototype.unique = function (a) {
    return function () {
        return this.filter(a)
    }
}(function (a, b, c) {
    return c.indexOf(a, b + 1) < 0
});

var DEBUG = true;     // Default: false


// Change to host IP & Port, if hosted.
// var IPADDRESS = 'stellar.com.au';
// var PORT      = 3000;
console.warn('\nRunning on \n----------\nIP: 127.0.0.1\nPort: 8080\n\n');
var IPADDRESS = "127.0.0.1";
var PORT = 8080;

var config = require("./config"),
    http = require('http'),
    util = require('util'),
    request = require('request'),
    qs = require('querystring');

var app = require('express')();
var fs = require('fs');
var server = require('http').Server(app);
var io = require('socket.io')(server);

io.set('origins', '*:*');
// io.set('transports', ['websocket']);

var Twit = require('twit')

var LanguageDetect = require('languagedetect');
var lngDetector = new LanguageDetect();

var allowCrossDomain = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.send(200);
    }
    else {
        next();
    }
};

//...
app.configure(function () {
    app.use(require('express').methodOverride());
    app.use(allowCrossDomain);
});


// The root path should serve the client HTML.
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/index.html');
});
app.get("/health", function (req, res) {
    res.send('1');
});

var oauth = config.oauth;

// Todo: remove obama
var track = "obama,HHPPC,paperplane,Stellar";
var params = {
    track: track
};

var tweets = [];


var aliases = {};

//Hold some stats on the topics
var stats = {
    topics: {
        "trump": 0,
        "obama": 0,
        "isis": 0,
        "comey": 0,
        "HHPPC": 0,
        "paperplane": 0,
        "Stellar": 0
    }
};

var words = track.split(","),
    l_words = words.length;

//Start server
server.listen(PORT, IPADDRESS, function () {
    console.log('%s: Node server started on %s:%d ...',
        Date(Date.now()), IPADDRESS, PORT);
});

io.on('connection', function (socket) {
    console.log("[kaan] connected!");

    socket.emit('open', {status: 'connected'});

    socket.on('disconnect', function () {
        if (DEBUG) {
            console.log("disconnect")
        }
        io.sockets.emit('close', {status: "disconnected"});
    });

});

//Initialize Twitter API Client
var T = new Twit({
    consumer_key: config.oauth.consumer_key
    , consumer_secret: config.oauth.consumer_secret
    , access_token: config.oauth.token
    , access_token_secret: config.oauth.token_secret
})

function createRequest() {
    var oauth = config.oauth;

    //Initialize stream of tweets
    var stream = T.stream('statuses/filter', {
        track: params.track
    });

    //Listener on tweets coming in from the streaming API
    stream.on('tweet', function (tweet) {
        if (DEBUG) {
            console.log(tweet.text)
        }


        // Todo:   ********  EN SON BURDAYIZ !!??? *************
        var __topics = calculateTopic(tweet.text);
        for (var i = 0; i < __topics.length; i++) {
            if (DEBUG) {
                console.log("sending", __topics[i])
            }
            sendTweet(__topics[i], tweet);
        }

    })

}
createRequest();

//XHR service to send buffered data at the beginning of the visualization to
//avoid empty starting sea
app.get('/data', function (req, res) {
    if (DEBUG) {
        console.log("request for data")
    }

    res.send(JSON.stringify(tweets));

});

//Analyze, prepare, package and emit the tweet via web socket
function sendTweet(c, d) {
    if (DEBUG) {
        console.log("SENDING TWEET")
        console.log(d)
        console.log(c, aliases[c] ? aliases[c] : c)
    }

    //Create Tweet/Wave
    var t = {
        c: c,
        t: new Date(d.created_at).getTime(),
        d: d.text,
        id: d.id_str,
        uid: d.user.id,
        name: d.user.name,
        sname: d.user.screen_name,
        f: d.user.followers_count,
        l: d.lang,
        h: d.hashtags || [],
        r_id: d.in_reply_to_status_id_str || -1
    };

    if (d.hashtags) {
        t.h = doc.hashtags;
    }
    if (d.in_reply_to_status_id_str) {
        t.r_id = d.in_reply_to_status_id_str;
    }
    if (tweets.length > 1) {
        var t_last = tweets[tweets.length - 1].t;
        //keep a buffer 1 week of tweets
        tweets = tweets.filter(function (d) {
            return (d.t > (t_last - (1000 * 60 * 60 * 24 * 7)));
        });
    }
    //limit/slice buffer to 100 tweets
    if (tweets.length > 100) {
        tweets = tweets.slice(tweets.length - 100, tweets.length);
    }
    tweets.push(t);

    //emit the tweet via socket
    io.sockets.emit('tweet', t);
}

//Analyze which topics are talked about in the text
function calculateTopic(text) {
    var topics = [];

    for (var c in stats.topics) {
        if (text.toLowerCase().indexOf(c) != -1) {
            stats.topics[c]++;
            topics.push(c);
        }
    }

    return topics.unique();
}