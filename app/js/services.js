'use strict';

/* Services */
angular.module('Gatunes.services', [])
.value('Storage', function() {
	var fs = require('fs'),
		path = require('path'),
		storage = path.join(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'], 'Gatunes');
	
	!fs.existsSync(storage) && fs.mkdirSync(storage, '0775');
	return storage;
}())
.factory('Keyboard', function($window) {
	var Keyboard = function() {
		var remote = require('remote'),
			win = remote.getCurrentWindow(),
			globalShortcut = remote.globalShortcut,
			callbacks = {},
			emit = function(event, data) {
				callbacks[event] && callbacks[event].forEach(function(cb) {
					cb(data);
				});
			},
			konami = {
				code: [38, 38, 40, 40, 37, 39, 37, 39, 65, 66],
				step: 0,
				stroke: function(key) {
					if(this.code[this.step] !== key) return this.step = 0;
					if(++this.step < this.code.length) return;
					this.step = 0;
					win.webContents.openDevTools();
				}
			},
			handler = function(event) {
				return function(e) {
					var fromInput = e.target.tagName.toLowerCase() === 'input';
					if(fromInput) return;
					[32, 16, 18].indexOf(e.keyCode) !== -1 && e.preventDefault();
					emit(event, {key: e.keyCode, repeat: e.repeat, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey});
					event === 'keydown' && konami.stroke(e.keyCode);
				};
			};

		$window.addEventListener('keydown', handler('keydown'));

		$window.addEventListener('keyup', handler('keyup'));

		['MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack'].forEach(function(key) {
			globalShortcut.register(key, function() {
				emit(key);
			});
		});

		this.on = function(event, callback) {
			!callbacks[event] && (callbacks[event] = []);
			callbacks[event].push(callback);
		};

		this.off = function(event, callback) {
			if(!callbacks[event]) return;
			for(var i=0; i<callbacks[event].length; i++) {
				if(callbacks[event][i] === callback) {
					callbacks[event].splice(i, 1);
					break;
				}
			}
		};
	};

	return new Keyboard();
})
.factory('Mouse', function($window) {
	var Mouse = function() {
		var callbacks = {},
			pos = this.pos = {
				x: -1,
				y: -1
			};

		$window.addEventListener('mousemove', function(e) {
			pos.x = e.clientX;
			pos.y = e.clientY;
		});
	};

	return new Mouse();
})
.factory('LastFm', function($http) {
	var LastFm = function() {
		this.key = '050700332b4c3df96f22a89ce417f934';
	};

	LastFm.prototype.request = function(method, params, callback) {
		params.api_key = this.key;
		params.format = 'json';
		params.method = method;
		$http({
			url: 'http://ws.audioscrobbler.com/2.0/',
			params: params
		}).then(function(response) {
			callback(response.status === 200 && response.data ? response.data : null);
		});
	};

	LastFm.prototype.getArtist = function(name, callback) {
		this.request('artist.getInfo', {
			artist: name
		}, function(data) {
			callback(data && data.artist ? data.artist : null);
		});
	};

	LastFm.prototype.getArtists = function(params, callback) {
		if(params.similar) {
			this.getSimilarArtists(params.similar, callback);
		} else if(params.genre) {
			this.getTagArtists(params.genre, params.page, callback);
		} else {
			this.getTopArtists(params.page, callback);
		}
	};

	LastFm.prototype.getTopArtists = function(page, callback) {
		this.request('chart.getTopArtists', {page: page || 2}, function(data) {
			if(!data || !data.artists || !data.artists.artist) return callback(null);
			callback(Array.isArray(data.artists.artist) ? data.artists.artist : [data.artists.artist], data.artists['@attr'].page < data.artists['@attr'].totalPages);
		});
	};

	LastFm.prototype.getSimilarArtists = function(artist, callback) {
		this.request('artist.getSimilar', {
			artist: artist
		}, function(data) {
			if(!data || !data.similarartists || !data.similarartists.artist) return callback(null);
			callback(Array.isArray(data.similarartists.artist) ? data.similarartists.artist : [data.similarartists.artist]);
		});
	};

	LastFm.prototype.getTagArtists = function(tag, page, callback) {
		this.request('tag.getTopArtists', {
			tag: tag,
			page: page || 2
		}, function(data) {
			if(!data || !data.topartists || !data.topartists.artist) return callback(null);
			callback(Array.isArray(data.topartists.artist) ? data.topartists.artist : [data.topartists.artist]);
		});
	};

	LastFm.prototype.getImage = function(info, desired) {
		desired = desired || 'extralarge';
		var img;
		for(var i=0; i<info.image.length; i++) {
			img = info.image[i]['#text'];
			if(info.image[i].size === desired) break;
		}
		return img;
	};

	return new LastFm();
})
.factory('Player', function($interval, $window, Keyboard, Music, Storage, filenameFilter) {
	var fs = require('fs');

	var Player = function() {
		var self = this;
		this.updateInterval = null;
		
		this.audio = {
			ctx: new ($window.AudioContext || $window.webkitAudioContext)(),
			createSource: function(offset) {
				var that = this;
				this.source = this.ctx.createBufferSource();
				this.source.buffer = this.buffer;
				this.source.connect(this.splitter || this.ctx.destination);
				this.source.onended = function() {
					that.destroySource();
					delete that.buffer;
					self.next();
				};
				this.source.start(0, offset);
				this.initTime = this.ctx.currentTime - offset;
			},
			destroySource: function() {
				if(!this.source) return;
				this.source.onended = null;
				this.source.stop();
				this.source.disconnect();
				delete this.source;

				if(self.arduino && self.arduino.isOpen()) {
					for(var c=0; c<2; c++) {
						var avgs = [254, c];
						for(var i=0; i<self.audio.fft.bands.length - 1; i++) avgs.push(0);
						self.arduino.write(new Buffer(avgs));
					}
				}
			},
			seek: function(offset) {
				if(!this.buffer) return;
				this.destroySource();
				this.createSource(Math.max(0, Math.min(self.duration, offset)));
			}
		};
		if($window.localStorage.getItem('Gatunes:arduino')) {
			var serialport = require('serialport');
			this.arduino = new serialport.SerialPort($window.localStorage.getItem('Gatunes:arduino'), {
				baudrate: 115200/*,
				parser: serialport.parsers.readline('\n', 'ascii')*/
			});
			this.arduino.mode = 0;
			/*this.arduino.on('data', function(data) {
				console.log(data);
			});*/
			this.audio.splitter = this.audio.ctx.createChannelSplitter(2);
			this.audio.merger = this.audio.ctx.createChannelMerger(2);
			this.audio.analysers = [
				this.audio.ctx.createAnalyser(),
				this.audio.ctx.createAnalyser()
			];
			this.audio.fft = {
				bands: [0, 1, 2, 4, 7, 15, 29, 58, 117],
				data: new Uint8Array(this.audio.analysers[0].frequencyBinCount)
			};
			this.audio.analysers.forEach(function(analyser, channel) {
				analyser.smoothingTimeConstant = 0.3;
				analyser.fftSize = 2048;
				self.audio.splitter.connect(analyser, channel, 0)
	      		analyser.connect(self.audio.merger, 0, channel);
			});
			this.audio.merger.connect(this.audio.ctx.destination);
		}

		this.shuffle = false;

		Keyboard.on('MediaPlayPause', function() {
			self.pause();
		});

		Keyboard.on('MediaNextTrack', function() {
			self.next();
		});

		Keyboard.on('MediaPreviousTrack', function() {
			self.prev();
		});

		Keyboard.on('keydown', function(e) {
			if(!self.track) return;
			var meta = e.ctrlKey || e.metaKey || e.altKey;
			switch(e.key) {
				case 37:
					if(meta) self.prev();
					else self.audio.seek(self.currentTime - 5);
				break;
				case 39:
					if(meta) self.next();
					else self.audio.seek(self.currentTime + 5);
				break;
				case 32:
					!e.repeat && self.pause();
				break;
				case 77:
					if(meta && self.arduino && self.arduino.isOpen()) {
						++self.arduino.mode >= 10 && (self.arduino.mode = 0);
						self.arduino.write(new Buffer([253, self.arduino.mode]));
					}
				break;
			}
		});
	};

	Player.prototype.play = function(track, playlist) {
		var self = this;

		this.currentTime = 0;
		this.duration = track.duration;
		
		this.audio.loading && (this.audio.loading.aborted = true);
		this.audio.destroySource();
		delete this.audio.paused;
		delete this.audio.buffer;
		
		var loading = this.audio.loading = {};
		fs.readFile(Storage + '/' + filenameFilter(track.album.artist.name) + '/' + filenameFilter(track.album.title) + '/' + track.filename, function(err, raw) {
			if(err || !raw) {
				if(!loading.aborted) delete self.audio.loading;
				return;
			}
			self.audio.ctx.decodeAudioData(raw.buffer, function(decoded) {
				if(loading.aborted) return;
				delete self.audio.loading;
				self.audio.buffer = decoded;
				if(track.duration !== decoded.duration) {
					self.duration = track.duration = decoded.duration;
					Music.saveTrack(track);
				}
				self.audio.createSource(0);
			}, function() {
				if(!loading.aborted) delete self.audio.loading;
			});
		});

		this.track = track;
		this.playlist = playlist;
		this.updateQueue();
		this.resetUpdateInterval();
	};

	Player.prototype.pause = function() {
		if(this.audio.paused) {
			delete this.audio.paused;
			this.audio.createSource(this.currentTime);
		} else {
			this.audio.destroySource();
			this.audio.paused = true;
		}
		this.resetUpdateInterval();
	};

	Player.prototype.prev = function() {
		this.prevTrack && this.play(this.prevTrack, this.playlist);
	};

	Player.prototype.next = function() {
		this.nextTrack && this.play(this.nextTrack, this.playlist);
	};

	Player.prototype.resetUpdateInterval = function() {
		if(this.updateInterval) {
			$interval.cancel(this.updateInterval);
			this.updateInterval = null;
		}
		if(this.audio.paused) return;
		var self = this;
		this.updateInterval = $interval(function() {
			if(!self.audio.source) return;

			self.currentTime = self.audio.ctx.currentTime - self.audio.initTime;

			if(self.arduino && self.arduino.isOpen()) {
				var avgs = [];
				self.audio.analysers.forEach(function(analyser, channel) {
					analyser.getByteFrequencyData(self.audio.fft.data);
					avgs.push(254);
					avgs.push(channel);
					self.audio.fft.bands.forEach(function(lowerBound, i) {
						if(i === self.audio.fft.bands.length) return;
						var upperBound = self.audio.fft.bands[i + 1],
							avg = 0;
						
						for(var i=lowerBound; i<=upperBound; i++) {
							avg += self.audio.fft.data[i];
						}

						avgs.push(Math.max(0, Math.min(Math.round(avg / (upperBound - lowerBound + 1)), 250)));
					});
				});
				self.arduino.write(new Buffer(avgs));
			}
		}, 1000 / 60);
	};

	Player.prototype.updateQueue = function() {
		if(!this.track) return;
		var playlist = this.playlist || Music;
		var tracks = this.shuffle ? playlist.shuffledTracks : playlist.tracks;
		for(var i=0; i<tracks.length; i++) {
			var track = tracks[i];
			if(track.id === this.track.id) {
				this.prevTrack = i > 0 ? tracks[i - 1] : null;
				this.nextTrack = i < tracks.length - 1 ? tracks[i + 1] : null;
				break;
			}
		}
	};

	Player.prototype.toggleShuffle = function() {
		this.shuffle = !this.shuffle;
		this.updateQueue();
	};

	Player.prototype.reset = function() {
		if(!this.track) return;
		if(this.audio.loading) {
			this.audio.loading.aborted = true;
			delete this.audio.loading;
		}
		this.audio.destroySource();
		delete this.audio.paused;
		delete this.track;
		delete this.currentTime;
		delete this.duration;
		delete this.prevTrack;
		delete this.nextTrack;
		if(this.updateInterval) {
			$interval.cancel(this.updateInterval);
			this.updateInterval = null;
		}
	};

	return new Player();
})
.factory('Searches', function($window) {
	var MAX_SEARCHES = 3;

	var Searches = function() {
		this.data = [];
		var cache;
		if(cache = $window.localStorage.getItem('Gatunes:searches')) {
			try {
				cache = JSON.parse($window.localStorage.getItem('Gatunes:searches'));
				this.data = cache;
			} catch(e) {}
		}
	};

	Searches.prototype.add = function(query) {
		for(var i=0; i<this.data.length; i++) {
			if(this.data[i] === query) return;
		}
		this.data.unshift(query);
		this.data.length > MAX_SEARCHES && this.data.pop();
		this.save();
	};

	Searches.prototype.save = function() {
		$window.localStorage.setItem('Gatunes:searches', JSON.stringify(this.data));
	};

	return new Searches();
})
.factory('Music', function($window, $timeout, LastFm, Storage, addzeroFilter, filenameFilter, searchableFilter) {
	var musicmetadata = require('musicmetadata'),
		fs = require('fs'),
		path = require('path');

	var Music = function() {
		this.artists = [];
		
		var self = this, stored;
		if(stored = $window.localStorage.getItem('Gatunes:artists')) {
			try {
				stored = JSON.parse(stored);
				stored.forEach(function(artist, i) {
					try {
						var artistData = JSON.parse($window.localStorage.getItem('Gatunes:artist:' + artist)),
							albums = JSON.parse($window.localStorage.getItem('Gatunes:albums:' + artist));

						albums.forEach(function(album, i) {
							var albumData = {
									artist: artistData,
									title: album
								},
								tracks = JSON.parse($window.localStorage.getItem('Gatunes:tracks:' + artist + ':' + album));

							tracks.forEach(function(id, i) {
								var track = JSON.parse($window.localStorage.getItem('Gatunes:track:' + id));
								track.id = id;
								track.album = albumData;
								tracks[i] = track;
							});

							albumData.tracks = tracks;
							albums[i] = albumData;
						});
						
						artistData.name = artist;
						artistData.albums = albums;

						stored[i] = artistData;
					} catch(e) {}
				});
				this.artists = stored;
			} catch(e) {}
		}

		this.handlers = {};
		this.on = function(event, callback) {
			!this.handlers[event] && (this.handlers[event] = []);
			this.handlers[event].push(callback);
		};

		this.tracks = [];
		this.updateTracks();
	};

	Music.prototype.getArtist = function(name) {
		for(var i=0; i<this.artists.length; i++) {
			if(searchableFilter(this.artists[i].name) === searchableFilter(name)) return this.artists[i];
		}

		var artist = {
				name: name,
				albums: []
			};

		this.artists.push(artist);
		this.artists.sort(function(a, b) {
			a = searchableFilter(a.name);
			b = searchableFilter(b.name);
			var c = a.localeCompare(b);
			return c < 0 ? -1 : (c > 0 ? 1 : 0);	
		});

		var artists = [];
		this.artists.forEach(function(artist) {
			artists.push(artist.name);	
		});

		$window.localStorage.setItem('Gatunes:albums:' + name, '[]');
		$window.localStorage.setItem('Gatunes:artists', JSON.stringify(artists));

		$window.localStorage.setItem('Gatunes:artist:' + name, '{}');
		LastFm.getArtist(artist.name, function(info) {
			var data = {};
			info.bio && info.bio.summary && (artist.bio = data.bio = info.bio.summary.replace(/<[^>]*>/g, '').replace(/ Read more on Last\.fm/g, ''));
			info.image && info.image.length && (artist.picture = data.picture = LastFm.getImage(info));
			$window.localStorage.setItem('Gatunes:artist:' + name, JSON.stringify(data));
		});

		return artist;
	};

	Music.prototype.getAlbum = function(artist, title) {	
		for(var i=0; i<artist.albums.length; i++) {
			if(searchableFilter(artist.albums[i].title) === searchableFilter(title)) return artist.albums[i];
		}
		
		var album = {
				artist: artist,
				title: title,
				tracks: []
			};

		artist.albums.push(album);
		artist.albums.sort(function(a, b) {
			a = searchableFilter(a.title);
			b = searchableFilter(b.title);
			var c = a.localeCompare(b);
			return c < 0 ? -1 : (c > 0 ? 1 : 0);	
		});
		
		var albums = [];
		artist.albums.forEach(function(album) {
			albums.push(album.title);	
		});

		$window.localStorage.setItem('Gatunes:tracks:' + artist.name + ':' + title, '[]');
		$window.localStorage.setItem('Gatunes:albums:' + artist.name, JSON.stringify(albums));
	
		return album;
	};

	Music.prototype.getTrack = function(id) {
		for(var i=0; i<this.tracks.length; i++) if(this.tracks[i].id === id) return this.tracks[i];
	};

	Music.prototype.addTrack = function(stream, filename, length, id, index, albumTitle, callback, dontWrite) {
		var self = this,
			data = new Buffer(length),
			offset = 0,
			metadata = null,
			done = {
				data: false,
				metadata: false
			},
			end = function() {
				if(!done.metadata || !done.data) return;

				var file = filename.substr(0, filename.lastIndexOf('.')),
					extension = filename.substr(filename.lastIndexOf('.')),
					track = {
						id: id || uuid.v4()
					};

				if(metadata) {
					track.title = metadata.title ? metadata.title : file;
					track.artist = metadata.albumartist && metadata.albumartist[0] ? metadata.albumartist[0] : (metadata.artist && metadata.artist[0] ? metadata.artist[0] : 'Unknown Artist');
					track.album = metadata.album ? metadata.album : albumTitle;
					metadata.genre && (track.genre = metadata.genre);
					metadata.disk && metadata.disk.of > 1 && (track.album += ' (CD ' + metadata.disk.no + ')');
					metadata.duration && (track.duration = metadata.duration);
					track.order = metadata.track && metadata.track.no ? metadata.track.no - 1 : index;
					file = filenameFilter(track.title);
					metadata.track && metadata.track.no && (file = addzeroFilter(metadata.track.no) + ' ' + file);
				} else {
					track.title = file;
					track.album = albumTitle;
					track.artist = 'Unknown Artist';
					track.order = index;
					file = filenameFilter(track.title);
				}

				var artist = self.getArtist(track.artist),
					artistPath = filenameFilter(artist.name),
					album = self.getAlbum(artist, track.album),
					albumPath = filenameFilter(album.title);

				track.filename = file + extension;
				delete track.artist;
				delete track.album;

				!fs.existsSync(path.join(Storage, artistPath)) && fs.mkdirSync(path.join(Storage, artistPath), '0775');
				!fs.existsSync(path.join(Storage, artistPath, albumPath)) && fs.mkdirSync(path.join(Storage, artistPath, albumPath), '0775');

				var writeCallback = function() {
					var trackData = JSON.parse(JSON.stringify(track));

					track.album = album;
					album.tracks.push(track);

					var tracks = [];
					album.tracks.forEach(function(track) {
						tracks.push(track.id);
					});
					album.tracks.sort(function(a, b) {
						return a.order < b.order ? -1 : (a.order > b.order ? 1 : 0);	
					});

					self.updateTracks();

					var trackId = trackData.id;
					delete trackData.id;
					$window.localStorage.setItem('Gatunes:tracks:' + artist.name + ':' + album.title, JSON.stringify(tracks));
					$window.localStorage.setItem('Gatunes:track:' + trackId, JSON.stringify(trackData));

					callback && callback();
				};

				if(!dontWrite) fs.writeFile(path.join(Storage, artistPath, albumPath, track.filename), data, writeCallback);
				else writeCallback();
			};

		stream.on('data', function(chunk) {
			chunk.copy(data, offset);
			offset += chunk.length;
		});

		stream.on('end', function() {
			done.data = true;
			end();
		});

		musicmetadata(stream, {duration: true, fileSize: length}, function(err, data) {
			!err && (metadata = data);
			done.metadata = true;
			end();
		});
	};

	Music.prototype.saveTrack = function(track) {
		var id = track.id,
			data = {};

		for(var i in track) data[i] = track[i];
		delete data.$$hashKey;
		delete data.id;
		delete data.album;
		$window.localStorage.setItem('Gatunes:track:' + id, JSON.stringify(data));
	};

	Music.prototype.removeTracks = function(tracks) {
		var track = tracks.shift();
		if(!track) return;

		var artistPath = path.join(Storage, filenameFilter(track.album.artist.name)),
			albumPath = path.join(artistPath, filenameFilter(track.album.title));

		try {
			fs.unlinkSync(path.join(albumPath, track.filename));
		} catch(e) {}

		$window.localStorage.removeItem('Gatunes:track:' + track.id);
		for(var i=0; i<track.album.tracks.length; i++) {
			if(track.album.tracks[i].id === track.id) {
				track.album.tracks.splice(i, 1);
				break;
			}
		}

		var albumTracks = [];
		track.album.tracks.forEach(function(track) {
			albumTracks.push(track.id);
		});

		if(albumTracks.length) $window.localStorage.setItem('Gatunes:tracks:' + track.album.artist.name + ':' + track.album.title, JSON.stringify(albumTracks));
		else {
			try {
				fs.rmdirSync(albumPath);
			} catch(e) {}

			$window.localStorage.removeItem('Gatunes:tracks:' + track.album.artist.name + ':' + track.album.title);
			for(var i=0; i<track.album.artist.albums.length; i++) {
				if(track.album.artist.albums[i].title === track.album.title) {
					track.album.artist.albums.splice(i, 1);
					break;
				}
			}

			var artistAlbums = [];
			track.album.artist.albums.forEach(function(album) {
				artistAlbums.push(album.title);
			});
			if(artistAlbums.length) $window.localStorage.setItem('Gatunes:albums:' + track.album.artist.name, JSON.stringify(artistAlbums));
			else {
				try {
					fs.rmdirSync(artistPath);
				} catch(e) {}

				$window.localStorage.removeItem('Gatunes:albums:' + track.album.artist.name);
				$window.localStorage.removeItem('Gatunes:artist:' + track.album.artist.name);
				for(var i=0; i<this.artists.length; i++) {
					if(this.artists[i].name === track.album.artist.name) {
						this.artists.splice(i, 1);
						break;
					}
				}

				var artists = [];
				this.artists.forEach(function(artist) {
					artists.push(artist.name);	
				});
				$window.localStorage.setItem('Gatunes:artists', JSON.stringify(artists));
			}
		}

		this.handlers.removeTrack && this.handlers.removeTrack.forEach(function(cb) {
			cb(track.id);
		});

		var self = this;
		$timeout(function() {
			self.removeTracks(tracks);
		}, 0);
	};

	Music.prototype.updateTracks = function() {
		this.tracks.length = 0;
		var tracks = this.tracks;
		this.artists.forEach(function(artist) {
			artist.albums.forEach(function(album) {
				album.tracks.forEach(function(track) {
					tracks.push(track);
				});
			});
		});
		
		this.shuffledTracks = tracks.slice(0);
		var index = tracks.length;
		while(0 !== index) {
			var randomIndex = Math.floor(Math.random() * index);
			index--;

			var val = this.shuffledTracks[index];
			this.shuffledTracks[index] = this.shuffledTracks[randomIndex];
			this.shuffledTracks[randomIndex] = val;
		}
	};

	return new Music();
})
.factory('Playlists', function($window, Music, searchableFilter) {
	var Playlists = function() {
		this.data = [];
		
		var self = this, stored;
		if(stored = $window.localStorage.getItem('Gatunes:playlists')) {
			try {
				stored = JSON.parse(stored);
				stored.forEach(function(id, i) {
					try {
						var playlist = JSON.parse($window.localStorage.getItem('Gatunes:playlist:' + id));
						playlist.id = id;
						playlist.tracks.forEach(function(id, i) {
							playlist.tracks[i] = Music.getTrack(id);
						});
						self.updateShuffled(playlist);
						stored[i] = playlist;
					} catch(e) {}
				});
				this.data = stored;
			} catch(e) {}
		}

		Music.on('removeTrack', function(id) {
			self.data.forEach(function(playlist) {
				for(var i=0; i<playlist.tracks.length; i++) {
					if(playlist.tracks[i].id === id) {
						playlist.tracks.splice(i, 1);
						self.updateShuffled(playlist);
						self.savePlaylist(playlist);
						break;
					}
				}
			});
		});
	};

	Playlists.prototype.get = function(id) {
		for(var i=0; i<this.data.length; i++) if(this.data[i].id === id) return this.data[i];
	};

	Playlists.prototype.add = function(title) {
		var playlist = {
				id: uuid.v4(),
				title: title,
				tracks: [],
				shuffledTracks: []
			};

		this.data.push(playlist);
		this.data.sort(function(a, b) {
			a = searchableFilter(a.title);
			b = searchableFilter(b.title);
			var c = a.localeCompare(b);
			return c < 0 ? -1 : (c > 0 ? 1 : 0);
		});
		this.savePlaylist(playlist);
		this.save();

		return playlist;
	};

	Playlists.prototype.remove = function(playlist) {
		for(var i=0; i<this.data.length; i++) {
			if(this.data[i].id === playlist.id) {
				this.data.splice(i, 1);
				break;
			}
		}
		this.save();
		$window.localStorage.removeItem('Gatunes:playlist:' + playlist.id);
	};

	Playlists.prototype.addTracks = function(playlist, tracks) {
		var track = tracks.shift();
		if(!track) return this.savePlaylist(playlist);
		var already = false;
		for(var i=0; i<playlist.tracks.length; i++) {
			if(playlist.tracks[i].id === track.id) {
				already = true;
				break;
			}
		}
		if(!already) {
			playlist.tracks.push(track);
			this.updateShuffled(playlist);
		}
		(!already || tracks.length) && this.addTracks(playlist, tracks);
	};

	Playlists.prototype.removeTracks = function(playlist, tracks) {
		var track = tracks.shift();
		if(!track) return this.savePlaylist(playlist);
		for(var i=0; i<playlist.tracks.length; i++) {
			if(playlist.tracks[i].id === track.id) {
				playlist.tracks.splice(i, 1);
				break;
			}
		}
		this.updateShuffled(playlist);
		this.removeTracks(playlist, tracks);
	};

	Playlists.prototype.reorderTracks = function(playlist, below, tracks) {
		var ids = [];
		tracks.forEach(function(track) {
			ids.push(track.id);
		});

		var l = playlist.tracks.length;
		for(var i=0; i<l; i++) {
			if(ids.indexOf(playlist.tracks[i].id) !== -1) {
				playlist.tracks.splice(i, 1);
				i--;
				l--;
			}
		}

		if(below) {
			for(var i=0; i<playlist.tracks.length; i++) {
				if(playlist.tracks[i].id === below) {
					tracks.forEach(function(track, o) {
						playlist.tracks.splice(i + o, 0, track);
					});
					break;
				}
			}
		} else {
			tracks.forEach(function(track) {
				playlist.tracks.push(track);
			});
		}

		this.savePlaylist(playlist);
	};

	Playlists.prototype.updateShuffled = function(playlist) {
		playlist.shuffledTracks = playlist.tracks.slice(0);
		var index = playlist.shuffledTracks.length;
		while(0 !== index) {
			var randomIndex = Math.floor(Math.random() * index);
			index--;

			var val = playlist.shuffledTracks[index];
			playlist.shuffledTracks[index] = playlist.shuffledTracks[randomIndex];
			playlist.shuffledTracks[randomIndex] = val;
		}
	};

	Playlists.prototype.save = function() {
		var ids = [];
		this.data.forEach(function(playlist) {
			ids.push(playlist.id);
		});
		$window.localStorage.setItem('Gatunes:playlists', JSON.stringify(ids));
	};

	Playlists.prototype.savePlaylist = function(playlist) {
		var data = {
				title: playlist.title,
				tracks: []
			};

		playlist.tracks.forEach(function(track) {
			data.tracks.push(track.id);
		});
		$window.localStorage.setItem('Gatunes:playlist:' + playlist.id, JSON.stringify(data));
	};

	return new Playlists();
})
.factory('Torrents', function($window, $rootScope, Music, Player, Storage) {
	var torrentStream = require('torrent-stream');

	var Torrents = function() {
		this.data = [];
		this.downloading = [];

		var stored;
		if(stored = $window.localStorage.getItem('Gatunes:torrents')) {
			try {
				stored = JSON.parse(stored);
				stored.forEach(function(id, i) {
					try {
						var torrent = JSON.parse($window.localStorage.getItem('Gatunes:torrent:' + id));
						torrent.files.forEach(function(file) {
							file.selected = true;
						});
						stored[i] = torrent;
					} catch(e) {}
				});
				this.data = stored;
			} catch(e) {}
			for(var i=this.data.length - 1; i>=0; i--) this.download(this.data[i]);
		}
	};

	Torrents.prototype.getByMagnet = function(magnet, title, desc) {
		for(var i=0; i<this.data.length; i++) {
			var torrent = this.data[i];
			if(torrent.magnet === magnet) return torrent;
		}

		var torrent = {
				magnet: magnet,
				title: title,
				desc: desc
			};

		this.data.unshift(torrent);
		return torrent;
	};

	Torrents.prototype.remove = function(torrent) {
		for(var i=0; i<this.data.length; i++) {
			if(this.data[i] === torrent) {
				this.data.splice(i, 1);
				break;
			}
		}
		for(var i=0; i<this.downloading.length; i++) {
			if(this.downloading[i] === torrent) {
				this.downloading.splice(i, 1);
				break;
			}
		}
		torrent.engine && torrent.engine.destroy(function() {
			torrent.engine.remove(function() {});
		});
		$window.localStorage.removeItem('Gatunes:torrent:' + torrent.id);
		this.save();
	};

	Torrents.prototype.getEngine = function(torrent, callback) {
		if(torrent.engine) {
			if(torrent.engine.ready) callback(torrent.engine);
			else torrent.engine.on('ready', function() {
				callback(torrent.engine);
			});
			return;
		}
		torrent.engine = torrentStream(torrent.magnet, {tmp: Storage});
		torrent.engine.on('ready', function() {
			torrent.engine.ready = true;
			callback(torrent.engine);
		});
	};

	Torrents.prototype.getMetadata = function(torrent, callback) {
		var self = this;
		this.getEngine(torrent, function(engine) {
			var files = [];
			engine.files.forEach(function(file, index) {
				if(['.mp3', '.ogg', '.flac', '.m4a'].indexOf(file.name.substr(file.name.lastIndexOf('.'))) === -1) return;
				files.push({
					offset: file.offset,
					length: file.length,
					filename: file.name,
					path: file.path || file.name,
					selected: true
				});
			});
			files.sort(function(a, b) {
				return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0);	
			});

			torrent.files = files;
			torrent.id = engine.infoHash;

			callback();
		});
	};

	Torrents.prototype.download = function(torrent) {
		if(torrent.downloading) return;
		var self = this;
		torrent.downloading = true;
		this.downloading.unshift(torrent);
		this.getEngine(torrent, function(engine) {
			var allDone = function() {
					var done = true;
					for(var i=0; i<torrent.files.length; i++) {
						var file = torrent.files[i];
						file.selected && !file.done && (done = false);
					}
					done && self.remove(torrent);
				},
				addFirst = function() {
					for(var i=0; i<torrent.files.length; i++) {
						var file = torrent.files[i];
						if(file.selected && !file.added && !file.done) {
							file.added = true;
							Music.addTrack(engine.files[file.index].createReadStream(), file.filename, file.length, torrent.id + ':' + file.offset + ':' + file.length, i, torrent.title, function() {
								file.done = true;
								Player.updateQueue();
								self.saveTorrent(torrent);
								var done = allDone();
								$rootScope.$apply();
								!done && addFirst();
							});
							break;
						}
					}
				};

			torrent.files.forEach(function(file, i) {
				if(file.selected && !file.done) {
					if(!file.pieces) {
						var firstPiece = Math.floor(file.offset / engine.torrent.pieceLength),
							lastPiece = Math.floor((file.offset + file.length) / engine.torrent.pieceLength);
						
						file.pieceOffset = firstPiece;
						file.pieces = [];
						for(var p=0; p<=lastPiece-firstPiece; p++) file.pieces.push(0);
					}

					for(var j=0; j<engine.files.length; j++) {
						var engineFile = engine.files[j];
						if(engineFile.offset === file.offset && engineFile.length === file.length) {
							engineFile.select();
							file.index = j;
							break;
						}
					}
				}
			});

			engine.on('download', function(piece) {
				for(var i=0; i<torrent.files.length; i++) {
					var file = torrent.files[i],
						offseted = piece - file.pieceOffset;

					if(offseted >= 0 && offseted < file.pieces.length) {
						if(file.done) return;
						file.pieces[offseted] = 1;
						if(!file.added) {
							var done = true;
							for(var p=1; p<file.pieces.length - 1; p++) {
								if(file.pieces[p] === 0) {
									done = false;
									break;
								}
							}
							if(done) {
								var engineFile = engine.files[file.index];
								Music.addTrack(engineFile.createReadStream(), file.filename, file.length, torrent.id + ':' + file.offset + ':' + file.length, i, torrent.title, function() {
									file.done = true;
									Player.updateQueue();
									allDone();
									$rootScope.$apply();
								});
								file.added = true;
							}
						}
						self.saveTorrent(torrent);
						$rootScope.$apply();
						break;
					}
				}
			});

			addFirst();

			self.saveTorrent(torrent);
			self.save();
		});
	};

	Torrents.prototype.save = function() {
		var torrents = [];
		this.downloading.forEach(function(torrent) {
			torrents.push(torrent.id);
		});
		$window.localStorage.setItem('Gatunes:torrents', JSON.stringify(torrents));
	};

	Torrents.prototype.saveTorrent = function(torrent) {
		var data = {
				id: torrent.id,
				magnet: torrent.magnet,
				title: torrent.title,
				desc: torrent.desc,
				files: []
			};

		torrent.picture && (torrent.picture = torrent.picture);
		torrent.files.forEach(function(file) {
			var fileData = {
					offset: file.offset,
					length: file.length,
					filename: file.filename,
					pieceOffset: file.pieceOffset,
					pieces: file.pieces
				};

			file.done && (fileData.done = true);
			file.selected && data.files.push(fileData);
		});

		$window.localStorage.setItem('Gatunes:torrent:' + torrent.id, JSON.stringify(data));
	};

	Torrents.prototype.destroy = function(callback) {
		var torrents = [];
		this.data.forEach(function(torrent) {
			torrent.engine && torrents.push(torrent);
		});
		this.data.length = 0;
		this.downloading.length = 0;
		var count = torrents.length;
		if(!count) return callback();
		torrents.forEach(function(torrent) {
			torrent.engine.destroy(function() {
				var cb = function() {
						--count === 0 && callback();
					};

				if(torrent.downloading) cb();
				else torrent.engine.remove(cb);
			});
		});
	};

	return new Torrents();
});
