'use strict';

/* Controllers */
angular.module('Gatunes.controllers', [])
.controller('artist', function($scope, $rootScope, $routeParams, LastFm) {
	$scope.view = 'downloads';
	$rootScope.spinnerTop = '70%';
	$scope.artist = {
		name: $routeParams.name
	};

	LastFm.getArtist($scope.artist.name, function(info) {
		info.bio && info.bio.summary && ($scope.artist.bio = info.bio.summary.replace(/<[^>]*>/g, '').replace(/ Read more on Last\.fm/g, ''));
		info.image && info.image.length && ($scope.artist.picture = LastFm.getImage(info));
	});

	$scope.$on('$destroy', function() {
		delete $rootScope.spinnerTop;
	});
})
.controller('discover', function($scope, $routeParams, LastFm) {
	$scope.baseurl = 'discover';
	$scope.page = parseInt($routeParams.page || 2, 10);
})
.controller('search', function($scope, $routeParams, Searches) {
	$scope.baseurl = 'search/' + $routeParams.query;
	Searches.add($scope.query = $routeParams.query);
	$scope.page = parseInt($routeParams.page || 0, 10);
})
.controller('downloads', function($scope, $location, Torrents) {
	$scope.torrents = Torrents.downloading;
	$scope.$watchCollection('torrents', function(torrents) {
		!torrents.length && $location.path('/music');
	});
})
.controller('music', function($scope, $timeout, $window, Music, Player) {
	$scope.player = Player;
	$scope.artists = Music.artists;
	$scope.tracks = Music.tracks;
	$scope.play = function(track) {
		Player.play(track);
	};
	var debounce;
	$scope.$on('scroll', function(e, scrollTop) {
		debounce && $timeout.cancel(debounce);
		debounce = $timeout(function() {
			debounce = null;
			$window.localStorage.setItem('Gatunes:MusicScroll', scrollTop);
		}, 250);
	});
	$timeout(function() {
		$scope.$emit('setScroll', window.localStorage.getItem('Gatunes:MusicScroll') || 0);
	}, 0);  
})
.controller('playlist', function($scope, $routeParams, $location, ngDialog, Playlists, Player) {
	var playlist = Playlists.get($routeParams.id);
	if(!playlist) return $location.path('/music');
	$scope.playlist = playlist;
	$scope.player = Player;
	$scope.play = function(track) {
		Player.play(track, playlist);
	};
	var originalTitle = playlist.title;
	$scope.rename = function() {
		delete $scope.renaming;
		originalTitle = playlist.title;
		Playlists.savePlaylist(playlist);
	};
	$scope.cancelRename = function() {
		if(!$scope.renaming) return;
		delete $scope.renaming;
		playlist.title = originalTitle;
	};
	$scope.remove = function(e) {
		e.stopPropagation();
		ngDialog.openConfirm({
			template: 'dialogs/confirm.html'
		}).then(function() {
			Playlists.remove(playlist);
			$location.path('/music');
		});
	};
})
.controller('preferences', function($rootScope, $scope, $location, $window, Autoupdater, i18n, Music, ngDialog, Player, Playlists, Storage, Torrents, addzeroFilter, filenameFilter) {
	var	fs = require('fs'),
		path = require('path'),
		dialog = require('remote').dialog;

	$scope.version = Autoupdater.currentVersion;
	$scope.storage = Storage;
	$scope.locale = i18n.locale;
	$scope.$watch('locale', function(locale) {
		i18n.locale !== locale && i18n.reset(locale, true);
	});
	$scope.backup = function() {
		var artists = [],
			playlists = [],
			magnets = [],
			magnetIds = {};

		Music.artists.forEach(function(data) {
			var artist = {
					name: data.name,
					albums: []
				};

			data.albums.forEach(function(data) {
				var album = {
						title: data.title,
						tracks: []
					};

				data.tracks.forEach(function(data) {
					album.tracks.push({
						id: data.id,
						filename: data.filename
					});

					var magnetId = data.id.split(':')[0];
					if(!magnetIds[magnetId]) {
						magnetIds[magnetId] = true;
						var magnet = $window.localStorage.getItem('Gatunes:magnet:' + magnetId);
						magnet && magnets.push({
							id: magnetId,
							magnet: magnet
						});
					}
				});

				artist.albums.push(album);
			});

			artists.push(artist);
		});

		Playlists.data.forEach(function(data) {
			var playlist = {
					title: data.title,
					tracks: []
				};

			data.tracks.forEach(function(track) {
				playlist.tracks.push(track.id);
			});

			playlists.push(playlist);
		});

		var now = new Date();
		dialog.showSaveDialog({
			defaultPath: path.join(Storage, 'Gatunes_' + now.getFullYear() + '-' + addzeroFilter(now.getMonth() + 1) + '-' + addzeroFilter(now.getDate()) + '.json'),
			filters: [
				{name: 'JSON', extensions: ['json']}
			]
		}, function(file) {
			file && fs.writeFileSync(file, JSON.stringify({
				artists: artists,
				magnets: magnets,
				playlists: playlists
			}, null, '\t'));
		});
	};

	var reset = function(callback) {
		Player.track && Player.reset();
		Torrents.data.forEach(function(torrent) {
			torrent.downloading = false;
		});
		Torrents.destroy(function() {
			$window.localStorage.clear();
			callback();
		});
		Music.artists.length = 0;
		Music.tracks.length = 0;
		Music.shuffledTracks.length = 0;
		Playlists.data.length = 0;
	};
	
	$scope.restore = function() {
		dialog.showOpenDialog({
			defaultPath: Storage,
			filters: [
				{name: 'JSON', extensions: ['json']}
			]
		}, function(files) {
			files && fs.readFile(files[0], 'utf-8', function(err, data) {
				if(err) return;
				try {
					data = JSON.parse(data);
				} catch(e) {
					return;
				}

				var artists = data.artists,
					magnets = data.magnets,
					playlists = data.playlists;

				var dialogScope = $scope['$new']();
				dialogScope.progress = 0;

				ngDialog.open({
					template: 'dialogs/restoring.html',
					showClose: false,
					closeByDocument: false,
					closeByEscape: false,
					scope: dialogScope
				});

				var unbindOpened = dialogScope.$on('ngDialog.opened', function() {
					unbindOpened();
					reset(function() {
						$window.localStorage.setItem('Gatunes:AcceptedTerms', 1);

						var tracks = [];
						artists.forEach(function(artist) {
							var artistPath = path.join(Storage, filenameFilter(artist.name));
							artist.albums.forEach(function(album) {
								var albumPath = path.join(artistPath, filenameFilter(album.title));
								album.tracks.forEach(function(track, i) {
									track.artist = artist.name;
									track.album = album.title;
									track.path = path.join(albumPath, track.filename);
									track.order = i;
									tracks.push(track);
								});
							});
						});

						dialogScope.total = tracks.length;

						var torrents = {};

						var process = function() {
							var track = tracks.shift();
							if(!track) {
								for(var i in torrents) torrents[i].id && Torrents.download(torrents[i]);
								playlists.forEach(function(data) {
									var tracks = [];
									data.tracks.forEach(function(id) {
										var track = Music.getTrack(id);
										track && tracks.push(track);
									});
									if(!tracks.length) return;
									var playlist = Playlists.add(data.title);
									Playlists.addTracks(playlist, tracks);
								});
								ngDialog.close();
								$rootScope.$apply();
								return;
							}
							dialogScope.progress++;
							dialogScope.$apply();
							
							var id = track.id.split(':'),
								magnetId = id[0],
								magnetOffset = parseInt(id[1], 10),
								magnetLength = parseInt(id[2], 10);

							if(!torrents[magnetId]) {
								var magnet;
								for(var i=0; i<magnets.length; i++) {
									if(magnets[i].id === magnetId) {
										magnet = magnets[i].magnet;
										torrents[magnetId] = Torrents.getByMagnet(magnet, track.artist + ' - ' + track.album, '');
										break;
									}
								}
								magnet && $window.localStorage.setItem('Gatunes:magnet:' + magnetId, magnet);
							}

							fs.stat(track.path, function(err, stats) {
								if(err) {
									if(!torrents[magnetId]) return process();
									if(!torrents[magnetId].id) {
										torrents[magnetId].id = magnetId;
										torrents[magnetId].files = [];
									}
									torrents[magnetId].files.push({
										offset: magnetOffset,
										length: magnetLength,
										filename: track.filename,
										selected: true
									});
									process();
								} else {
									Music.addTrack(fs.createReadStream(track.path), track.filename, stats.size, track.id, track.order, track.album, function() {
										process();
									}, true);
								}
							});
						};

						process();
					});
				});
			});
		});
	};
	$scope.reset = function() {
		ngDialog.openConfirm({
			template: 'dialogs/confirm.html'
		}).then(function() {
			reset(function() {
				$location.path('/discover');
				ngDialog.open({
					template: 'dialogs/terms.html',
					controller: 'terms',
					showClose: false,
					closeByDocument: false,
					closeByEscape: false
				});
			});
		});
	};
})
.controller('terms', function($scope, $window, ngDialog) {
	var app = require('remote').app;
	$scope.accept = function() {
		$window.localStorage.setItem('Gatunes:AcceptedTerms', 1);
		ngDialog.close();
	};
	$scope.leave = function() {
		app.quit();
	};
})
.controller('updated', function($scope, Autoupdater) {
	var app = require('remote').app;
	$scope.version = Autoupdater.currentVersion;
	$scope.restart = function() {
		app.quit();
	};
});
