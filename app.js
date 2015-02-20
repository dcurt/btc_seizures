var express = require('express');
var path = require('path');
var logger = require('morgan');    // Do I need this?
var http = require('http');
var fs = require('fs');
var extract = require('pdf-text-extract')
var app = express();
var Dropbox = require("dropbox");
var Twit = require('twit');

var T = new Twit({
    consumer_key:         'IH0edpizzsaxO3hM1gxi2Idq2'                              //DO SOMETHING ABOUT THESE TO HIDE THEM? AND DO I NEED BOTH?
  , consumer_secret:      'ypdG2XKViolJKJh9T9Ii9U9xwmzpcwOFuS3XS0DRUN90DradK4'
  , access_token:         '2997873525-yBKfXRGsUQkyFiq0diHETCb45kngqoTxCV1LvaL'
  , access_token_secret:  'stzho6P3mzb8IgSgMVAxKhFX4gCV1HEhdWWPXW3RMqQQn'
});

var client = new Dropbox.Client({
    key: "x03c5bkajjm7oxe",
    secret: "ms7v825o9hag938",
    token:"LSD2Mn0o_LkAAAAAAAABMgorFxfHb1cPkbUrYfssySPQyrA7KKO4vPxuNOyL9q5_", //got from implicit grant
});

client.onError.addListener(function(error) {
    console.error(error);
});


app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));


// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;

start();


function start() {
    console.log(getDate().fullDateTime + ":   Checking www.forfeiture.gov every 24 hours, starting now.");
    cycleAgencies();
    setInterval(cycleAgencies, 60000);
}

function cycleAgencies() {
    var agencies = ['ATF', 'DEA', 'FBI', /*'USAO', */'CBP', 'USPS', 'USSS']  

    for (i = 0; i < agencies.length; i++) {
        getNotice(agencies[i]) 
    }
}

function getDate() {
    var d = new Date();

    return {
        month: d.getMonth(),
        date: d.getDate(),
        fullDate: d.toLocaleDateString(),
        fullDateTime: d.toString(),
        fullYear: d.getFullYear()
    }
}

function getNotice(agency) {

    var file = fs.createWriteStream("temp_pdf/" + agency + ".pdf"); 
    var request = http.get("http://www.forfeiture.gov/pdf/" + agency + "/OfficialNotification.pdf", function(response) {
        response.pipe(file).on('close', function(){
            var filePath = path.join(__dirname, 'temp_pdf/' + agency + '.pdf');    
            extract(filePath, function (err, pages) {
                if (err) {
                    console.log(err)
                    return
                }
                fs.writeFileSync('temp_pdf/' + agency + '.txt', pages)
                fs.readFile('temp_pdf/' + agency + '.txt', function (err, data) {
                    if (err) throw err;
                    if (compareDate(data.toString('utf8')) == true) {
                        newNotice(data.toString('utf8'), agency);
                    } else {
                        console.log("Today's " + agency + " notice (" + getDate().fullDate + ") has not yet been posted. Will try again in one hour...")
                        retry(agency);
                    } 
                })
            })
        })
    }).on('error', function(e) {
        console.log("Got error while attempting to retrieve notice: " + e.message);
    });
}

function compareDate(text) {
    var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ]
    var date = monthNames[getDate().month] + getDate().date
    
    var index = text.split(' ').join('').search(/POSTEDON/i)
    var x = text.toUpperCase().split(' ').join('').slice(index).search(/January|February|March|April|May|June|July|August|September|October|November|December/i)
    var y = text.toUpperCase().split(' ').join('').slice(index).match(/January|February|March|April|May|June|July|August|September|October|November|December/i)
    var z = y[0].length+2

    return date.toUpperCase() == text.toUpperCase().split(' ').join('').slice(index + x, index + x + z)
}

function retry(agency) {
    setTimeout(function() {
        getNotice(agency)
    }, 3600000);
}

function newNotice(text, agency) {
    if (text.search(/bitcoin|btc|bit coin/ig) != -1) {
        checkID(text, agency);
    } else { console.log("Today's " + agency + " notice has been posted (" + getDate().fullDate + "), but does not mention Bitcoins. Will try again tomorrow.") }
}

function checkID(text, agency) {
    var index = 0;
    var saveNotice = false;
    var array = [];
    var noticeID; 
    var address = [];  

    for (i = 0; i < text.match(/bitcoin|btc|bit coin/ig).length; ++i) {
        array = fs.readFileSync('./noticelogs/' + agency + 'log.txt').toString().split("\n"); 
        index = (text.slice(index + 8).search(/bitcoin|btc|bit coin/ig)) + index + 8;

        
        //***NOTICE ID FORMATS:
        //ATF ---> 776036-15-0006
        //DEA ---> 14-DEA-604481
        //FBI ---> 3390-15-F-0016
        //CBP ---> 2015520600025601-005-0000
        //USSS ---> 102-2015-001-0003
        //USAO ---> not consistent, seems to include seizures from lots of cases***DO MANUALLY FOR NOW AND REMOVE FROM ARRAY

        switch (agency) {
            case 'ATF':
                noticeID = text.slice(0, index).match(/\b\d{6}-\d{2}-\d{4}\b(?![\s\S]*\b\d{6}-\d{2}-\d{4}\b)/g);
                break;
            case 'DEA':
                noticeID = text.slice(0, index).match(/\b\d{2}-(dea)-\d{6}\b(?![\s\S]*\b\d{2}-\w(dea)-\d{6}\b)/ig);
                break;
            case 'FBI':
                noticeID = text.slice(0, index).match(/\b\d{4}-\d{2}-F-\d{4}\b(?![\s\S]*\b\d{4}-\d{2}-F-\d{4}\b)/ig);
                break;
            // case 'USAO':
            //     noticeID = text.slice(0, index).match(/\b\d{3}-\d{2}-\d{3}\b(?![\s\S]*\b\d{3}-\d{2}-\d{3}\b)/);
            //     break;
            case 'CBP':
                noticeID = text.slice(0, index).match(/\b\d{16}-\d{3}-\d{4}\b(?![\s\S]*\b\d{16}-\d{3}-\d{4}\b)/g);
                break;
            case 'USPS':
                noticeID = text.slice(0, index).match(/\b\d{3}-\d{2}-\d{3}\b(?![\s\S]*\b\d{3}-\d{2}-\d{3}\b)/g);
                break;
            case 'USSS':
                noticeID = text.slice(0, index).match(/\b\d{3}-\d{4}-\d{3}-\d{4}\b(?![\s\S]*\b\d{3}-\d{4}-\d{3}-\d{4}\b)/g);
                break;
            }

        if (noticeID == null) {
            console.log("A referece to bitcoins was found in " + agency + " notice, but no valid ID. If no new IDs are found, I will treat as \"no new bitcoins seizures.\"");

        } else if (array.indexOf(noticeID[0]) == -1) {
            console.log("New " + agency + " bitcoin seizure: " + noticeID[0] + ". Adding ID number to log file.");
            fs.appendFileSync('./noticelogs/' + agency + 'log.txt', '\n' + noticeID[0], encoding='utf8');
            if ((text.slice(index, (text.slice(index).search(/\b\d{3}-\d{2}-\d{3}\b(?![\s\S]*\b\d{3}-\d{2}-\d{3}\b)/g))).match(/[13][a-km-zA-HJ-NP-Z0-9]{26,33}/g)) != null) {
                address.push(text.slice(index, (text.slice(index).search(/\b\d{3}-\d{2}-\d{3}\b(?![\s\S]*\b\d{3}-\d{2}-\d{3}\b)/g))).match(/[13][a-km-zA-HJ-NP-Z0-9]{26,33}/g));
            }
            saveNotice = true;
        }
    }

    if (saveNotice == true) {
        console.log("New " + agency + " bitcoin seizure(s) posted on " + getDate().fullDate + ". Now saving PDF, uploading to Dropbox, and issuing tweet...")
        newSeizure(agency, address)
    } else console.log("No new " + agency + " bitcoin seizures posted on " + getDate().fullDate + ". Will try again tomorrow.");     
} 

function newSeizure(agency, address) {
    var fileName = getDate().fullYear + "-" + (getDate().month + 1) + "-" + getDate().date + "-" + agency + '.pdf';;

    fs.createReadStream('./temp_pdf/' + agency + '.pdf').pipe(fs.createWriteStream('./pdfs/' + fileName)).on('close', function(){
        dropbox(fileName, agency, address)
    })
}

function dropbox(file, agency, address) {
    fs.readFile('pdfs/' + file, function (err, pdf) { 
       client.authenticate(function(error, client) {
        if (error) {
            return showError(error); 
        }
        client.writeFile('/' + agency + '/' + file, pdf, function(error, stat) {   
            if (error) {
                return showError(error); 
            }
            console.log("File saved to Dropbox as " + file + ". Creating link and posting tweet..."); 
            client.makeUrl('/' + agency + '/' + file, function(error, data) {
                if (error) {
                    return showError(error); 
                }
                tweet(data.url, agency, address);
            });
        });
    });
   });
}

function tweet(link, agency, address) {
    var tweetText = 'New Bitcoin seizure notice(s) posted by the ' + agency + ' today: http://www.forfeiture.gov/pdf/' + agency + '/OfficialNotification.pdf. (Archived @ ' + link + ')';
    var tweetText2;

    if (address == null || address.length == 0) {
        T.post('statuses/update', { status: tweetText }, function(err, data, response) {
            if (err) {
                return showError(err); 
            }
            console.log("Tweeted the following: " + tweetText)
        })
    } else {
        for (i = 0; i < address.length; i++) {
            address[i] = 'https://blockchain.info/address/' + address[i];
        }
        tweetText2 = 'Today\'s ' + agency + ' seizure notice references the following BTC address(es): ' + address.join(', ');
        T.post('statuses/update', { status: tweetText }, function(err, data, response) {
            if (err) {
                return showError(err); 
            }
            console.log("Tweeted the following: " + tweetText)
        })
        T.post('statuses/update', { status: tweetText2 }, function(err, data, response) {
            if (err) {
                return showError(err); 
            }
            console.log("Tweeted the following: " + tweetText2)
        })
    }
}
  





