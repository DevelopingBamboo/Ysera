				////////////////////////////////////////////////////////////////////////////////   
				//    This program is free software: you can redistribute it and/or modify    //   
				//    it under the terms of the GNU General Public License as published by    //   
				//    the Free Software Foundation, either version 3 of the License, or       //   
				//    (at your option) any later version.                                     //   
				//                                                                            //   
				//    This program is distributed in the hope that it will be useful,         //   
				//    but WITHOUT ANY WARRANTY; without even the implied warranty of          //   
				//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           //   
				//    GNU General Public License for more details.                            //   
				//                                                                            //   
				//    You should have received a copy of the GNU General Public License       //   
				//    along with this program.  If not, see <http://www.gnu.org/licenses/>.   //   
				////////////////////////////////////////////////////////////////////////////////

const Discord = require("discord.js");
const fs = require("fs");
const ytdl = require("ytdl-core");
const pedir = require("pedir");

const bot = new Discord.Client({autoReconnect: true, max_message_cache: 0});

const dm_text = "Hola! Escribe !comandos para ver la lista de comandos disponibles.";
const mention_text = "Escribe !comandos para ver la lista de comandos disponibles.";
var aliases_file_path = "aliases.json";

var para = false;
var inform_np = true;

var now_playing_data = {};
var cola = [];
var aliases = {};

var voice_connection = null;
var voice_handler = null;
var text_channel = null;

var yt_api_key = null;

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

var comandos = [

	{
		command: "para",
		description: "Paras la playlist (¡tambien pasará de la canción actual!)",
		parameters: [],
		execute: function(message, params) {
			if(para) {
				message.reply("¡La reproducción ya está parada!");
			} else {
				para = true;
				if(voice_handler !== null) {
					voice_handler.end();
				}
				message.reply("¡Parando!");
			}
		}
	},
	
	{
		command: "continuar",
		description: "Continuar la playlist",
		parameters: [],
		execute: function(message, params) {
			if(para) {
				para = false;
				if(!is_cola_empty()) {
					play_next_song();
				}
			} else {
				message.reply("Ya se está reproduciendo");
			}
		}
	},

    {
        command: "pedir",
        description: "Añade el vídeo solicitado a la cola",
        parameters: ["video URL, video ID, playlist URL or alias"],
        execute: function (message, params) {
            if(aliases.hasOwnProperty(params[1].toLowerCase())) {
                params[1] = aliases[params[1].toLowerCase()];
            }

            var regExp = /^.*(youtu.be\/|list=)([^#\&\?]*).*/;
            var match = params[1].match(regExp);

            if (match && match[2]){
                cola_playlist(match[2], message);
            } else {
                add_to_cola(params[1], message);
            }
        }
    },

	{
		command: "busca",
		description: "buscaes for a video on YouTube and adds it to the cola",
		parameters: ["query"],
		execute: function(message, params) {
			if(yt_api_key === null) {
				message.reply("You need a YouTube API key in order to use the !busca command. Please see https://github.com/agubelu/discord-music-bot#obtaining-a-youtube-api-key");
			} else {
				var q = "";
				for(var i = 1; i < params.length; i++) {
					q += params[i] + " ";
				}
				busca_video(message, q);
			}
		}
	},

	{
		command: "np",
		description: "Muestra la canciçon actual",
		parameters: [],
		execute: function(message, params) {

			var response = "Reproduciendo ahora: ";
			if(is_bot_playing()) {
				response += "\"" + now_playing_data["title"] + "\" (pedido por " + now_playing_data["user"] + ")";
			} else {
				response += "no hay ninguna canción ahora mismo, ¡pero si quieres te canto algo!";
			}

			message.reply(response);
		}
	},

	{
		command: "setnp",
		description: "Estableces si voy a anunciar la próxima canción que vas a escuchar o no (ya sabes, por si te da vergüenza)",
		parameters: ["on/off"],
		execute: function(message, params) {

			if(params[1].toLowerCase() == "on") {
				var response = "Anunciaré el nombre de las canciones en el chat";
				inform_np = true;
			} else if(params[1].toLowerCase() == "off") {
				var response = "No anunciaré el nombre de las canciones en el chat (de qué tienes miedo?)";
				inform_np = false;
			} else {
				var response = "¿Cómo? No te he entendido, prueba otra vez";
			}
			
			message.reply(response);
		}
	},

	{
		command: "comandos",
		description: "Te voy a mostrar una lista de cosas que puedo hacer, ¡flipa!",
		parameters: [],
		execute: function(message, params) {
			var response = "Mira, te comento, puedo hacer estas cosas:";
			
			for(var i = 0; i < comandos.length; i++) {
				var c = comandos[i];
				response += "\n!" + c.command;
				
				for(var j = 0; j < c.parameters.length; j++) {
					response += " <" + c.parameters[j] + ">";
				}
				
				response += ": " + c.description;
			}
			
			message.reply(response);
		}
	},

	{
		command: "salta",
		description: "Se salta la canción actual, ¡menudo aburrimiento!",
		parameters: [],
		execute: function(message, params) {
			if(voice_handler !== null) {
				message.reply("Saltándome esta canción ...");
				voice_handler.end();
			} else {
				message.reply("No estoy reproduciendo nada, ¿qué quieres que salte?");
			}
		}
	},

	{
		command: "cola",
		description: "Muestra la cola the cola",
		parameters: [],
		execute: function(message, params) {
			var response = "";
	
			if(is_cola_empty()) {
				response = "the cola is empty.";
			} else {
				var long_cola = cola.length > 30;
				for(var i = 0; i < (long_cola ? 30 : cola.length); i++) {
					response += "\"" + cola[i]["title"] + "\" (pedido por " + cola[i]["user"] + ")\n";
				}

				if(long_cola) response += "\n**...and " + (cola.length - 30) + " more.**";
			}
			
			message.reply(response);
		}
	},

	{
		command: "clearcola",
		description: "Elimina todas las canciones de la cola",
		parameters: [],
		execute: function(message, params) {
			cola = [];
			message.reply("¡La cola ha sido eliminada, no queda nada ahí!");
		}
	},

	{
		command: "remove",
		description: "Elimina una canción de la cola",
		parameters: ["pedir index or 'last'"],
		execute: function(message, params) {
			var index = params[1];

			if(is_cola_empty()) {
				message.reply("La cola está vacía");
				return;
			} else if(isNaN(index) && index !== "last") {
				message.reply("El argumento '" + index + "' no es un índice válido.");
				return;
			}

			if(index === "last") { index = cola.length; }
			index = parseInt(index);
			if(index < 1 || index > cola.length) {
				message.reply("No se puede eliminar el vídeo #" + index + " de la cola (sólo hay " + cola.length + " vídeos actualmente)");
				return;
			}

			var deleted = cola.splice(index - 1, 1);
			message.reply('El vídeo "' + deleted[0].title +'" ha sido eliminado correctamente.');
		}
	},
	
	{
		command: "aliases",
		description: "Displays the stored aliases",
		parameters: [],
		execute: function(message, params) {

			var response = "Current aliases:";
			
			for(var alias in aliases) {
				if(aliases.hasOwnProperty(alias)) {
					response += "\n" + alias + " -> " + aliases[alias];
				}
			}
			
			message.reply(response);
		}
	},
	
	{
		command: "setalias",
		description: "Sets an alias, overriding the previous one if it already exists",
		parameters: ["alias", "video URL or ID"],
		execute: function(message, params) {

			var alias = params[1].toLowerCase();
			var val = params[2];
			
			aliases[alias] = val;
			fs.writeFileSync(aliases_file_path, JSON.stringify(aliases));
			
			message.reply("Alias " + alias + " -> " + val + " establecido correctamente.");
		}
	},
	
	{
		command: "deletealias",
		description: "Elimina mi alias",
		parameters: ["alias"],
		execute: function(message, params) {

			var alias = params[1].toLowerCase();

			if(!aliases.hasOwnProperty(alias)) {
				message.reply("¡Alias " + alias + " no existe!");
			} else {
				delete aliases[alias];
				fs.writeFileSync(aliases_file_path, JSON.stringify(aliases));
				message.reply("'¡Alias \"" + alias + "\" eliminado correctamente!.");
			}
		}
	},

	{
    command: "setusername",
		description: "Establece mi nombre",
		parameters: ["Nombre de usuario o Alias"],
		execute: function (message, params) {

			var userName = params[1];
			if (aliases.hasOwnProperty(userName.toLowerCase())) {
				userName = aliases[userName.toLowerCase()];
			}

			bot.user.setUsername(userName).then(user => {
				message.reply('✔ Username set!');
			})
			.catch((err) => {
				message.reply('Error: No ha sido posible establecer el nombre de usuario, sigo teniendo el mismo nombre!');
				console.log('¡Ups! Algo ha ido mal con el comando setusername!:', err);
			});
		}
	},
  
  {
    command: "setavatar",
		description: "Establece mi avatar, sobreescribiendo el anterior si existía",
		parameters: ["Image URL or alias"],
		execute: function (message, params) {

			var url = params[1];
			if (aliases.hasOwnProperty(url.toLowerCase())) {
				url = aliases[url.toLowerCase()];
			}

			bot.user.setAvatar(url).then(user => {
				message.reply('✔ Avatar cambiado, ahora tengo una cara nueva!');
			})
			.catch((err) => {
				message.reply('Error: No ha sido posible establecer el avatar, sigo con la misma cara!');
				console.log('¡Ups! Algo ha ido mal con el comando setavatar!:', err); 
      });
		}
  }

];

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

bot.on("disconnect", event => {
	console.log("Disconnected: " + event.reason + " (" + event.code + ")");
});

bot.on("message", message => {
	if(message.channel.type === "dm" && message.author.id !== bot.user.id) { //Message received by DM
		//Check that the DM was not send by the bot to prevent infinite looping
		message.channel.sendMessage(dm_text);
	} else if(message.channel.type === "text" && message.channel.name === text_channel.name) { //Message received on desired text channel
		if(message.isMentioned(bot.user)) {
			message.reply(mention_text);
		} else {
			var message_text = message.content;
			if(message_text[0] == '!') { //Command issued
				handle_command(message, message_text.substring(1));
			}
		}
	}
});

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

function add_to_cola(video, message, mute = false) {

	if(aliases.hasOwnProperty(video.toLowerCase())) {
		video = aliases[video.toLowerCase()];
	}

	var video_id = get_video_id(video);

	ytdl.getInfo("https://www.youtube.com/watch?v=" + video_id, (error, info) => {
		if(error) {
			message.reply("¡Qué mal! El vídeo solicitado (" + video_id + ") no existe o no puede ser reproducido.");
			console.log("Error (" + video_id + "): " + error);
		} else {
			cola.push({title: info["title"], id: video_id, user: message.author.username});
			if (!mute) {
				message.reply('"' + info["title"] + '" ha sido añadido a la cola, relájate y disfruta.');
			}
			if(!para && !is_bot_playing() && cola.length === 1) {
				play_next_song();
			}
		}
	});
}

function play_next_song() {
	if(is_cola_empty()) {
		text_channel.sendMessage("La cola está vacía!");
	}

	var video_id = cola[0]["id"];
	var title = cola[0]["title"];
	var user = cola[0]["user"];

	now_playing_data["title"] = title;
	now_playing_data["user"] = user;

	if(inform_np) {
		text_channel.sendMessage('Now playing: "' + title + '" (pedido por ' + user + ')');
		bot.user.setGame(title);
	}

	var audio_stream = ytdl("https://www.youtube.com/watch?v=" + video_id);
	voice_handler = voice_connection.playStream(audio_stream);

	voice_handler.once("end", reason => {
		voice_handler = null;
		bot.user.setGame();
		if(!para && !is_cola_empty()) {
			play_next_song();
		}
	});

	cola.splice(0,1);
}

function busca_command(command_name) {
	for(var i = 0; i < comandos.length; i++) {
		if(comandos[i].command == command_name.toLowerCase()) {
			return comandos[i];
		}
	}

	return false;
}

function handle_command(message, text) {
	var params = text.split(" ");
	var command = busca_command(params[0]);

	if(command) {
		if(params.length - 1 < command.parameters.length) {
			message.reply("Insufficient parameters!");
		} else {
			command.execute(message, params);
		}
	}
}

function is_cola_empty() {
	return cola.length === 0;
}

function is_bot_playing() {
	return voice_handler !== null;
}

function busca_video(message, query) {
	pedir("https://www.googleapis.com/youtube/v3/busca?part=id&type=video&q=" + encodeURIComponent(query) + "&key=" + yt_api_key, (error, response, body) => {
		var json = JSON.parse(body);
		if("error" in json) {
			message.reply("An error has occurred: " + json.error.errors[0].message + " - " + json.error.errors[0].reason);
		} else if(json.items.length === 0) {
			message.reply("No videos found matching the busca criteria.");
		} else {
			add_to_cola(json.items[0].id.videoId, message);
		}
	})
}

function cola_playlist(playlistId, message, pageToken = '') {
	pedir("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" + playlistId + "&key=" + yt_api_key + "&pageToken=" + pageToken, (error, response, body) => {
		var json = JSON.parse(body);
		if ("error" in json) {
			message.reply("An error has occurred: " + json.error.errors[0].message + " - " + json.error.errors[0].reason);
		} else if (json.items.length === 0) {
			message.reply("No videos found within playlist.");
		} else {
			for (var i = 0; i < json.items.length; i++) {
				add_to_cola(json.items[i].snippet.resourceId.videoId, message, true)
			}
			if (json.nextPageToken == null){
				return;
			}
			cola_playlist(playlistId, message, json.nextPageToken)
		}
	});
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

function get_video_id(string) {
	var regex = /(?:\?v=|&v=|youtu\.be\/)(.*?)(?:\?|&|$)/;
	var matches = string.match(regex);

	if(matches) {
		return matches[1];
	} else {
		return string;
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////

exports.run = function(server_name, text_channel_name, voice_channel_name, aliases_path, token) {

	aliases_file_path = aliases_path;

	bot.on("ready", () => {
		var server = bot.guilds.find("name", server_name);
		if(server === null) throw "Couldn't find server '" + server_name + "'";

		var voice_channel = server.channels.find(chn => chn.name === voice_channel_name && chn.type === "voice"); //The voice channel the bot will connect to
		if(voice_channel === null) throw "Couldn't find voice channel '" + voice_channel_name + "' in server '" + server_name + "'";
		
		text_channel = server.channels.find(chn => chn.name === text_channel_name && chn.type === "text"); //The text channel the bot will use to announce stuff
		if(text_channel === null) throw "Couldn't find text channel '#" + text_channel_name + "' in server '" + server_name + "'";

		voice_channel.join().then(connection => {voice_connection = connection;}).catch(console.error);

		fs.access(aliases_file_path, fs.F_OK, (err) => {
			if(err) {
				aliases = {};
			} else {
				try {
					aliases = JSON.parse(fs.readFileSync(aliases_file_path));
				} catch(err) {
					aliases = {};
				}
			}
		});

		bot.user.setGame();
		console.log("Connectado!");
	});

	bot.login(NDE0NTM4NzI3Nzc2NTgzNjgx.DWypvg.cu8VM2uttr-sXIS_fZR96SeBeCQ);
}

exports.setYoutubeKey = function(key) {
	yt_api_key = key;
}
