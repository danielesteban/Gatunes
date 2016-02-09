'use strict';

/* Directives */
angular.module('Gatunes.directives', [])
.directive('header', function($location, $rootScope, i18n, $window) {
	return {
		restrict: 'E',
		templateUrl: 'directives/header.html',
		scope: {},
		link: function(scope, element, attrs) {
			scope.i18n = i18n;

			var gui = require('nw.gui'),
				win = gui.Window.get(),
				maximized = false;

			win.on('resize', function() {
				maximized = false;
			});

			scope.quit = function() {
				win.close();
			};

			scope.minimize = function() {
				win.minimize();
			};

			scope.maximize = function() {
				if(maximized = !maximized) win.maximize();
				else win.unmaximize();
			};

			scope.history = [];
			scope.historyIndex = -1;
			var fromHistory = false;
			$rootScope.$on("$routeChangeSuccess", function(e, current) {
				if(current.$$route && current.$$route.controller === 'search' && current.params.query) scope.query = current.params.query;
				if(fromHistory) return fromHistory = false;
				scope.history = scope.history.slice(0, ++scope.historyIndex);
				scope.history.push($location.path());
			});

			scope.back = function() {
				fromHistory = true;
				$location.path(scope.history[--scope.historyIndex]);
			};

			scope.forward = function() {
				fromHistory = true;
				$location.path(scope.history[++scope.historyIndex]);
			};

			scope.search = function() {
				$location.path('/search/' + scope.query.replace(/\//g, ' '));
			};

			var startPos,
				mousemove = function(e) {
					var minY = 23,
						maxY = $window.screen.height - minY,
						delta = {
							x: e.screenX - startPos.x,
							y: e.screenY - startPos.y
						},
						translate = {
							x: win.x + delta.x,
							y: Math.min(maxY, Math.max(minY, win.y + delta.y))
						};

					startPos = {
						x: e.screenX,
						y: e.screenY
					};

					win.moveTo(translate.x, translate.y);
				},
				mouseup = function() {
					$window.removeEventListener('mousemove', mousemove);
					$window.removeEventListener('mouseup', mouseup);
				};

			element.on('mousedown', function(e) {
				if(e.target !== element[0]) return;
				startPos = {
					x: e.screenX,
					y: e.screenY
				};
				$window.addEventListener('mousemove', mousemove);
				$window.addEventListener('mouseup', mouseup);
			});
		}
	}
})
.directive('aside', function($rootScope, $location, i18n, Searches, Music, Torrents, Playlists, Player) {
	return {
		restrict: 'E',
		templateUrl: 'directives/aside.html',
		scope: {},
		link: function(scope, element, attrs) {
			scope.i18n = i18n;
			scope.searches = Searches.data;
			scope.downloads = Torrents.downloading;
			scope.tracks = Music.tracks;
			scope.playlists = Playlists.data;
			scope.player = Player;
			$rootScope.$on("$routeChangeSuccess", function() {
				var path = $location.path().split('/');
				path[1] === 'browse' && path[2] && path.pop();
				path[1] === 'search' && path[3] && path.pop();
				scope.active = path.join('/');
			});

			scope.playlistTitle = i18n.newPlaylist;
			scope.addPlaylist = function(title) {
				scope.cancelAddPlaylist();
				Playlists.add(title);
			};
			scope.cancelAddPlaylist = function() {
				if(!scope.addingPlaylist) return;
				delete scope.addingPlaylist;
				scope.playlistTitle = i18n.newPlaylist;
			};
		}
	}
})
.directive('player', function(Player, $window) {
	return {
		restrict: 'E',
		templateUrl: 'directives/player.html',
		scope: {},
		link: function(scope, element, attrs) {
			scope.player = Player;
			var dragging = false,
				time = element.find('time'),
				setTime = function(x) {
					Player.track && (scope.time = Player.duration * (x / $window.innerWidth));
					time.css('left', x + 'px');
				},
				mousemove = function(e) {
					if(!Player.track) return;
					setTime(e.clientX);
					Player.audio.seek(Player.duration * (e.clientX / $window.innerWidth));
				},
				mouseup = function() {
					scope.dragging = false;
					$window.removeEventListener('mousemove', mousemove);
					$window.removeEventListener('mouseup', mouseup);
				};

			element.find('progress').on('mousedown', function(e) {
				mousemove(e);
				scope.dragging = true;
				$window.addEventListener('mousemove', mousemove);
				$window.addEventListener('mouseup', mouseup);
			});

			element.find('progress').on('mousemove', function(e) {
				setTime(e.clientX);
				scope.$apply();
			});

			element.find('progress').on('mouseover', function() {
				scope.hover = true;
				scope.$apply();
			});

			element.find('progress').on('mouseout', function() {
				scope.hover = false;
				scope.$apply();
			});
		}
	}
})
.directive('spinner', function($rootScope) {
	return {
		restrict: 'E',
		link: function(scope, element, attrs) {
			var params = {color: '#ffffff'};
			$rootScope.spinnerTop && (params.top = $rootScope.spinnerTop);
			var spinner = new Spinner(params).spin(element[0]);
			element.on('$destroy', function() {
				spinner.stop();
			});
		}
	};
})
.directive('artists', function(i18n, LastFm) {
	return {
		restrict: 'E',
		templateUrl: 'directives/artists.html',
		scope: {
			similar: '=',
			genre: '=',
			page: '=',
			baseurl: '='
		},
		link: function(scope, element, attrs) {
			scope.i18n = i18n;
			scope.loading = true;
			scope.artists = [];

			var params = {
				page: scope.page
			};
			scope.similar && (params.similar = scope.similar);
			scope.genre && (params.genre = scope.genre);

			LastFm.getArtists(params, function(artists, more) {
				artists.forEach(function(info) {
					var artist = {
							name: info.name
						};

					info.bio && info.bio.summary && (artist.bio = info.bio.summary.replace(/<[^>]*>/g, '').replace(/ Read more on Last\.fm\./g, ''));
					info.image && info.image.length && (artist.picture = LastFm.getImage(info));
					scope.artists.push(artist);
				});
				more && (scope.more = true);
				delete scope.loading;
			});
		}
	};
})
.directive('torrents', function($http, $location, $window, i18n, ngDialog, Torrents) {
	return {
		restrict: 'E',
		templateUrl: 'directives/torrents.html',
		scope: {
			torrents: '=',
			query: '=',
			page: '=',
			baseurl: '='
		},
		link: function(scope, element, attrs) {
			scope.i18n = i18n;
			if(!scope.torrents) {
				scope.page = scope.page || 0;
				
				var url;
				if(scope.query) {
					url = 'https://thepiratebay.la/search/' + encodeURIComponent(scope.query) + '/' + scope.page + '/7/101';
				} else {
					url = 'https://thepiratebay.la/browse/101/' + scope.page + '/7/0';
				}

				scope.loading = true;
				$http.get(url, {responseType: 'document'}).then(function(response) {
					if(response.status !== 200 || !response.data) return;
					var torrents = [],
						magnets = [],
						more = false,
						links = response.data.body.getElementsByTagName('a'),
						imgs = response.data.body.getElementsByTagName('img'),
						titles = response.data.body.getElementsByClassName('detLink'),
						descs = response.data.body.getElementsByClassName('detDesc'),
						tilteDescs = [];

					for(var i=0; i<links.length; i++) {
						var link = links[i];
						link.href.substr(0, 7) === 'magnet:' && magnets.push(link.href);
					}

					for(var i=0; i<descs.length; i++) {
						var desc = descs[i];
						desc.tagName === 'FONT' && tilteDescs.push(desc.innerHTML.replace(/<[^>]*>/g, '').replace(/\&nbsp;/g, ' '));
					}

					for(var i=0; i<titles.length; i++) {
						var title = titles[i].text,
							desc = tilteDescs[i];

						torrents.push(Torrents.getByMagnet(magnets[i], title, desc));
					}

					for(var i=0; i<imgs.length; i++) {
						imgs[i].alt === 'Next' && (more = true);
					}

					var t = torrents.slice(0),
						destroyed = false,
						fetchImage = function() {
							var torrent = t.shift();
							if(!torrent || destroyed) return;
							if(torrent.picture) return fetchImage();
							$http({
								url: 'http://ajax.googleapis.com/ajax/services/search/images?v=1.0&q=' + encodeURIComponent(torrent.title.toLowerCase().replace(/mp3/g, '').replace(/torrent/g, '')),
								method: 'GET',
								cache: true
							}).then(function(response) {
								if(
									response.status === 200 &&
									response.data &&
									response.data.responseStatus === 200 &&
									response.data.responseData.results.length
								) {
									torrent.picture = response.data.responseData.results[0].tbUrl;
									torrent.id && torrent.downloading && Torrents.saveTorrent(torrent);
								}
								fetchImage();
							});
						};

					fetchImage();

					scope.$on('$destroy', function() {
						destroyed = true;
					});
					
					scope.more = more;
					scope.torrents = torrents;
					delete scope.loading;
				});
			}

			scope.load = function(torrent) {
				if(torrent.files || torrent.loading) return;
				torrent.loading = true;
				Torrents.getMetadata(torrent, function() {
					delete torrent.loading;
					scope.$apply();
				});
			};

			scope.download = function(torrent) {
				if(torrent.downloading) return;
				$window.localStorage.setItem('Gatunes:magnet:' + torrent.id, torrent.magnet);
				Torrents.download(torrent);
			};

			scope.remove = function(torrent) {
				if(!torrent.downloading) return;
				ngDialog.openConfirm({
					template: 'dialogs/confirm.html'
				}).then(function() {
					Torrents.remove(torrent);
				});
			};
		}
	};
})
.directive('pieces', function() {
	return {
		restrict: 'E',
		scope: {
			pieces: '=',
			done: '='
		},
		link: function(scope, element, attrs) {
			var canvas = document.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				render = function() {
					var pw = canvas.width / scope.pieces.length;
					canvas.width = canvas.width;
					ctx.fillStyle = scope.done ? "#0F0" : "#00F";
					scope.pieces.forEach(function(piece, i) {
						(scope.done || piece) && ctx.fillRect(pw * i, 0, pw, canvas.height);
					});
				};

			canvas.width = 100;
			canvas.height = 20;
			element.append(canvas);

			scope.$watchCollection('pieces', function(pieces) {
				render();
			});

			scope.$watch('done', function(done) {
				render();
			});
		}
	};
})
.directive('arrow', function() {
	return {
		restrict: 'E',
		scope: {
			x: '=',
			y: '=',
			tox: '=',
			toy: '='
		},
		link: function(scope, element, attrs) {
			var canvas = document.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				from = [parseInt(scope.x, 10), parseInt(scope.y, 10)],
				to = [parseInt(scope.tox, 10), parseInt(scope.toy, 10)];

			canvas.width = Math.max(from[0], to[0]) + 10;
			canvas.height = Math.max(from[1], to[1]) + 10;

			ctx.lineWidth = 3;
			ctx.strokeStyle = "#fff";
			ctx.beginPath();
			ctx.moveTo(from[0], from[1]);
			ctx.lineTo(to[0], to[1]);
			ctx.stroke();

			var angle = Math.atan2(
				from[0] - to[0],
				from[1] - to[1]
			),
			deviation = 0.5235987755982988,
			size = 20;

			to[0] += Math.sin(angle) * 1;
			to[1] += Math.cos(angle) * 1;

			for(var j=0; j<2; j++) {
				ctx.beginPath();
				ctx.moveTo(to[0], to[1]);
				ctx.lineTo(to[0] + Math.sin(angle + deviation) * size, to[1] + Math.cos(angle + deviation) * size);
				ctx.stroke();
				deviation *= -1;
			}

			element.append(canvas);
		}
	}
})
.directive('trackscroll', function() {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			element.on('scroll', function() {
				scope.$emit('scroll', element[0].scrollTop);
			});
			scope.$on('$destroy', function() {
				delete scope.scrollTop;
			});
			scope.$on('setScroll', function(e, scrollTop) {
				element[0].scrollTop = scrollTop;
			});
		}
	}
})
.directive('draggable', function($window, Music, Playlists) {
	return {
		restrict: 'A',
		scope: {
			source: '=draggable'
		},
		link: function(scope, element, attrs) {
			var body = angular.element(document.body),
				selected = scope.$parent.selected = {},
				dragging = null;

			var keydown = function(e) {
					if(e.keyCode === 27) {
						for(var i in selected) delete selected[i];
						scope.$apply();
					}
				};

			$window.addEventListener('keydown', keydown);
			scope.$on('$destroy', function() {
				$window.removeEventListener('keydown', keydown);
			});

			Array.isArray(scope.source) && (scope.source = {
				tracks: scope.source
			});

			scope.$parent.$on('dragClick', function(e, data) {
				if(dragging) return;

				if(data.metaKey) {
					if(selected[data.id]) delete selected[data.id];
					else selected[data.id] = true;
				} else {
					if(selected[data.id]) return;
					for(var i in selected) delete selected[i];
					selected[data.id] = true;
				}
				scope.$apply();
			});
			scope.$parent.$on('dragInit', function(e, pos) {
				if(dragging) return;

				var tracks = [];
				scope.source.tracks.forEach(function(item) {
					selected[item.id] && tracks.push(item);
				});

				var text = tracks.length > 1 ? tracks.length + ' tracks' : tracks[0].album.artist.name + ' - ' + tracks[0].title;

				dragging = {
					tracks: tracks,
					element: angular.element('<div>').attr('id', 'drag').text(text)
				};

				var initPos = {x: pos.x, y: pos.y},
					setPos = function(pos) {
						var rect = dragging.element[0].getBoundingClientRect(),
							offset = {
								x: 5,
								y: 10
							};

						pos = {
							x: Math.min($window.innerWidth, Math.max(0, pos.x)) + offset.x,
							y: Math.min($window.innerWidth, Math.max(0, pos.y)) + offset.y
						};

						if(pos.x + rect.width > $window.innerWidth) {
							pos.x -= rect.width + offset.x * 2;
						}

						if(pos.y + rect.height > $window.innerHeight) {
							pos.y -= rect.height + offset.y * 2;
						}

						dragging.element.css('left', pos.x + 'px');
						dragging.element.css('top', pos.y + 'px');
					},
					drop = null,
					mousemove = function(e) {
						setPos({
							x: e.clientX,
							y: e.clientY
						});
						if(drop) {
							drop.element.removeClass('dropping');
							drop = null;
						}
						var element = e.target;
						!element.dataset.drop && (element = element.parentNode);
						if(element.dataset.drop) {
							try {
								drop = {
									element: angular.element(element),
									data: JSON.parse(element.dataset.drop)
								};
							} catch(e) {
								return drop = null;
							}
							switch(drop.data.type) {
								case 'playlist':
									if(scope.source.id === drop.data.id) return drop = null;
								break;
								case 'track':
									if(drop.data.id) {
										for(var i=0; i<dragging.tracks.length; i++) {
											if(dragging.tracks[i].id === drop.data.id) return drop = null;
										}
									}
								break;
							}
							drop.element.addClass('dropping');
						}
					},
					mouseup = function(e) {
						$window.removeEventListener('mousemove', mousemove);
						$window.removeEventListener('mouseup', mouseup);

						if(drop) {
							switch(drop.data.type) {
								case 'track':
									Playlists.reorderTracks(scope.source, drop.data.id, dragging.tracks);
								break;
								case 'playlist':
									Playlists.addTracks(Playlists.get(drop.data.id), dragging.tracks);
								break;
								case 'trash':
									if(scope.source.id) Playlists.removeTracks(scope.source, dragging.tracks);
									else Music.removeTracks(dragging.tracks);
								break;
							}
							drop.element.removeClass('dropping');
							drop = null;
							
							dragging.element.remove();
							dragging = null;

							scope.$apply();
						} else {
							var pos = {x: e.clientX, y: e.clientY},
								dx = initPos.x - pos.x,
								dy = initPos.y - pos.y,
								angle = Math.atan2(dx, dy),
								sinAngle = Math.sin(angle),
								cosAngle = Math.cos(angle),
								distance = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2)),
								step = 0,
								last,
								animate = function(time) {
									!last && (last = time - (1000 / 60));
									var delta = 1 / (time - last);
									last = time;
									if((step += delta) > 1) {
										dragging.element.remove();
										dragging = null;
										return;
									}
									$window.requestAnimationFrame(animate);
									setPos({
										x: pos.x + sinAngle * distance * step,
										y: pos.y + cosAngle * distance * step
									});
								};

							$window.requestAnimationFrame(animate);
						}

						body.removeClass('dragging');
					};

				setPos(pos);

				$window.addEventListener('mousemove', mousemove);
				$window.addEventListener('mouseup', mouseup);

				body.addClass('dragging');
				body.append(dragging.element);
			});
		}
	}
})
.directive('drag', function($window) {
	return {
		restrict: 'A',
		scope: {
			data: '=drag'
		},
		link: function(scope, element, attrs) {
			var startPos,
				mousemove = function(e) {
					var pos = {
							x: e.clientX,
							y: e.clientY
						},
						o = 5;

					if(pos.x < startPos.x - o || pos.x > startPos.x + o || pos.y < startPos.y - o || pos.y > startPos.y + o) {
						click(e);
						mouseup();
						scope.$emit('dragInit', pos);
					}
				},
				click = function(e) {
					scope.$emit('dragClick', {
						id: scope.data.id,
						shiftKey: e.shiftKey,
						metaKey: e.ctrlKey || e.metaKey
					});
				},
				mouseup = function() {
					$window.removeEventListener('mousemove', mousemove);
					$window.removeEventListener('mouseup', mouseup);
				};

			element.on('mousedown', function(e) {
				startPos = {
					x: e.clientX,
					y: e.clientY
				};
				$window.addEventListener('mousemove', mousemove);
				$window.addEventListener('mouseup', mouseup);
			});
			element.on('click', click);
			scope.$on('destroy', mouseup);
		}
	}
})
.directive('focusandselect', function($window) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			scope.$watch(attrs.ngShow, function(shown) {
				if(!shown) return;
				$window.setTimeout(function() {
					element[0].focus();
					element[0].select();
				}, 0);
			});
		}
	};
});
