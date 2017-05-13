require('dotenv').config()

const discord = require("discord.js");
const fetch = require('node-fetch');
const mysql = require('mysql');

const sql = mysql.createConnection({
  host     : 'localhost',
  user     : process.env.DB_USER,
  password : process.env.DB_PASS,
  database : process.env.DB_DATABASE,
	supportBigNumbers: true	
});
sql.connect();


const bot = new discord.Client();
bot.login(process.env.DISCORD_HASH);

const normalizeUrl = (url) => {	
	url = url.trim();
	const ssl = url.indexOf('https:');
	url = url.replace('http://www.', '');
	url = url.replace('https://www.', '');
	url = url.replace('http://', '');
	url = url.replace('https://', '');
	if(url.substr(-1) === '/') url = url.substr(0, url.length - 1);


	return (ssl ? 'https://' : 'http://') + url;
}

bot.on("messageUpdate", (oldMsg, newMsg) => {
	sql.query('UPDATE `messages` SET `content` = ? WHERE `messageId` = ?', [newMsg.content, oldMsg.id], (er) => {
		if(er) {
			console.log('ERROR', er);
		}
	});
})

bot.on("message", msg => {
	const contextRequests = msg.cleanContent.match(/(!context [0-9]+)/g);
	if(contextRequests && contextRequests.length > 0) {
		const promises = contextRequests.map(messageId => {
			messageId = messageId.replace(/\D+/g, '');
			return new Promise(res => {
				sql.query('SELECT * FROM `messages` WHERE `messageId` = ? LIMIT 1', [messageId], (er, results) => {
					if(er) console.log('ERROR', er);
					if(results && results[0]) res(results[0].channelName)
				});
			});
		});

		Promise.all(promises).then(channels => {
			const messages = [];
			channels.forEach((channel, index) => {
				messages.push('https://reactistory.com/#/channel/' + channel + '/' + contextRequests[index].replace(/\D+/g, ''));
			});

			msg.channel.send("For more context please see " + messages.join(" "));
		})
					
	}

	const payload = [
		msg.id,
		msg._timestamp,
		msg.author.username,
		msg.author.id,
		msg.channel.name,
		msg.cleanContent
	];
	sql.query('INSERT INTO `messages` SET `messageId` = ?, `createdAt` = FROM_UNIXTIME(?), `authorName` = ?, `authorId` = ?, `channelName` = ?, `content` = ?', payload, (er, res, fields) => {
		if(er) {
			console.log('ERROR', er);
		}
	});

	/**
	 * find URLs
	 */
	const links = msg.content.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g);
	if(links && links.length > 0) {
		links.map((link) => {			
			const linkPayload = [
				normalizeUrl(link),
				msg._timestamp,
				msg.author.username,
				msg.author.id,
				msg.channel.name
			];
			
			sql.query('INSERT INTO `links` SET `link` = ?, `postedAt` = FROM_UNIXTIME(?), `authorName` = ?, `authorId` = ?, `channelName` = ?', linkPayload, (er) => {
				
			});
		})
	}
});

console.log('[INI] Bootstrap complete')
bot.on('ready', () => {
  console.log('[BOT] Connected to Discord');
});