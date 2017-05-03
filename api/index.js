require('dotenv').config({path: '../.env'})

const mysql = require('mysql');
const fs = require('fs');
const sql = mysql.createConnection({
  host     : 'localhost',
  user     : process.env.DB_USER,
  password : process.env.DB_PASS,
  database : process.env.DB_DATABASE
});
sql.connect();

const express = require('express');
const https = require('https');
const cors = require('cors');
const app = new express();
app.use(cors());
const port = process.env.PORT || 8080;

const router = express.Router();

router.get('/channel/:channel', function(req, res) {
  let limit = req.query.limit ? parseInt(req.query.limit) : 50;
  if(limit > 200) limit = 200;
  
  const where = [];
  where.push('`channelName` = ' + sql.escape(req.params.channel));

  if(req.query.before) {
    where.push('`messageId` < ' + req.query.before.replace(/\D+/g, ''));
  }

  if(req.query.after) {
    where.push('`messageId` > ' + req.query.after.replace(/\D+/g, ''));
  }
  
  console.log('SELECT * FROM `messages` WHERE ' + where.join(' AND ') + ' ORDER BY `messageId` DESC LIMIT 0, ?');
  sql.query('SELECT * FROM `messages` WHERE ' + where.join(' AND ') + ' ORDER BY `messageId` DESC LIMIT 0, ?', [limit], (er, response, fields) => {
    if(response && response.length > 0) {
      Promise.all(response.reverse().map(parseDiscordMessage))
        .then(parsedMessages => {
          res.json({ 
            paginate: {
              prev: '/channel/' + req.params.channel + '?limit=' + limit + '&before=' + response[0].messageId,
              next: '/channel/' + req.params.channel + '?limit=' + limit + '&after=' + response[response.length - 1].messageId,
            },
            messages: parsedMessages
          });
        }) 
    }
    else {
      res.json({
        messages: [],
        paginate: {
          
        },        
      })
    }   
  }) 
});

const parseDiscordMessage = (message) => {
  
  const userIds = message.content.match(/<@([0-9]+)>/g);
  if(userIds && userIds.length > 0) {
    return Promise.all(userIds.map(getUsernameById))
      .then(userNames => {
        userIds.forEach((userId, index) => {
          message.content = message.content.replace(userId, `@${userNames[index]}`);
        })
        return message
      });
  }
  else return message;
  
};

const cacheUserNames = {};
const getUsernameById = (userId) => {
  userId = userId.replace(/\D+/g, '');
  if(cacheUserNames[userId]) return cacheUserNames[userId];

  return new Promise((res) => {
    console.log('[API] Lookup user ' + userId);
    sql.query('SELECT `authorName` from `messages` WHERE `authorId` = ? LIMIT 0, 1', [userId], (er, results) => {
      if(results && results.length !== 0) {        
        cacheUserNames[userId] = results[0].authorName;
        res(cacheUserNames[userId]);
      }
      else res("{MISSINGUSER}");
    })    
  });
}

app.use('/api', router);

app.listen(port);
console.log('[API] Listening on port ' + port)


if(process.env.USE_SSL == 'true') {
  const options = {
      cert: fs.readFileSync(`${process.env.SSL_CERT_DIR}/fullchain.pem`),
      key: fs.readFileSync(`${process.env.SSL_CERT_DIR}/privkey.pem`)
  };  
  console.log('[API] SSL Listening on port ' + process.env.SSL_PORT)
  https.createServer(options, app).listen(process.env.SSL_PORT);
}