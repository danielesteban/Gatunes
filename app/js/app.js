'use strict';

/* App & Routes */
angular.module('Gatunes', [
	'ngRoute',
	'ngDialog',
	'Gatunes.controllers',
	'Gatunes.directives',
	'Gatunes.filters',
	'Gatunes.i18n',
	'Gatunes.services'
	/*,'Gatunes.templates'*/
])
.config(function($routeProvider, $locationProvider) {
	$routeProvider.when('/artist/:name', {controller: 'artist', templateUrl: 'views/artist.html'});
	$routeProvider.when('/downloads', {controller: 'downloads', templateUrl: 'views/downloads.html'});
	$routeProvider.when('/music', {controller: 'music', templateUrl: 'views/music.html'});
	$routeProvider.when('/discover', {controller: 'discover', templateUrl: 'views/discover.html'});
	$routeProvider.when('/discover/:page', {controller: 'discover', templateUrl: 'views/discover.html'});
	$routeProvider.when('/search/:query', {controller: 'search', templateUrl: 'views/search.html'});
	$routeProvider.when('/search/:query/:page', {controller: 'search', templateUrl: 'views/search.html'});
	$routeProvider.when('/playlist/:id', {controller: 'playlist', templateUrl: 'views/playlist.html'});
	$routeProvider.when('/preferences', {controller: 'preferences', templateUrl: 'views/preferences.html'});
	$routeProvider.otherwise({redirectTo: '/music'});
})
.run(function($rootScope, $location, $window, ngDialog, Autoupdater, i18n, Music, Torrents, Storage) {
	var remote = require('remote'),
		win = remote.getCurrentWindow();

	win.on('close', function() {
		win.hide();
		remote.globalShortcut.unregisterAll();
		Torrents.destroy(function() {
			win.removeAllListeners('close');
			win.close();
			remote.app.quit();
		});
	});

	/* Menu */
	var template = [{"label":"Edit","submenu":[{"label":"Undo","accelerator":"CmdOrCtrl+Z","role":"undo"},{"label":"Redo","accelerator":"Shift+CmdOrCtrl+Z","role":"redo"},{"type":"separator"},{"label":"Cut","accelerator":"CmdOrCtrl+X","role":"cut"},{"label":"Copy","accelerator":"CmdOrCtrl+C","role":"copy"},{"label":"Paste","accelerator":"CmdOrCtrl+V","role":"paste"},{"label":"Select All","accelerator":"CmdOrCtrl+A","role":"selectall"}]},{"label":"Window","role":"window","submenu":[{"label":"Minimize","accelerator":"CmdOrCtrl+M","role":"minimize"},{"label":"Close","accelerator":"CmdOrCtrl+W","role":"close"}]}];

	if(process.platform === 'darwin') {
		var name = remote.app.getName();
		template.unshift({
			label: name,
			submenu: [
				{
					label: 'About ' + name,
					role: 'about'
				},
				{
					type: 'separator'
				},
				{
					label: 'Services',
					role: 'services',
					submenu: []
				},
				{
					type: 'separator'
				},
				{
					label: 'Hide ' + name,
					accelerator: 'Command+H',
					role: 'hide'
				},
				{
					label: 'Hide Others',
					accelerator: 'Command+Alt+H',
					role: 'hideothers'
				},
				{
					label: 'Show All',
					role: 'unhide'
				},
				{
					type: 'separator'
				},
				{
					label: 'Quit',
					accelerator: 'Command+Q',
					click: function() { win.close(); }
				},
			]
		});
		
		/* Window menu. */
		template[2].submenu.push({
			type: 'separator'
		},
		{
			label: 'Bring All to Front',
			role: 'front'
		});
	}

	var menu = remote.Menu.buildFromTemplate(template);
	remote.Menu.setApplicationMenu(menu);

	if(!$window.localStorage.getItem('Gatunes:AcceptedTerms')) {
		ngDialog.open({
			template: 'dialogs/terms.html',
			controller: 'terms',
			showClose: false,
			closeByDocument: false,
			closeByEscape: false
		});
	}

	if(!Music.tracks.length) $location.path('/discover');

	$rootScope.i18n = i18n;
	$rootScope.loaded = true;

	Autoupdater.run();

	console.log("\n\n,---.<-.(`-\')  (`-\')  _ (`-\')  _ _  (`-\')                          (`-\')     ,---. \n|   | __( OO)  ( OO).-/ ( OO).-/ \\-.(OO )         .->        .->   ( OO).->  |   | \n|   |\ƒ-\'. ,--.(,------.(,------. _.\'    \\    (`-\')----. ,--.(,--.  /    \'._  |   | \n|   ||  .\'   / |  .---\' |  .---\'(_...--\'\'    ( OO).-.  \'|  | |(`-\')|\'--...__)|   | \n|  .\'|      /)(|  \'--. (|  \'--. |  |_.\' |    ( _) | |  ||  | |(OO )`--.  .--\'|  .\' \n`--\' |  .   \'  |  .--\'  |  .--\' |  .___.\'     \\|  |)|  ||  | | |  \\   |  |   `--\'  \n.--. |  |\\   \\ |  `---. |  `---.|  |           \'  \'-\'  \'\\  \'-\'(_ .\'   |  |   .--.  \n`--\' `--\' \'--\' `------\' `------\'`--\'            `-----\'  `-----\'      `--\'   `--\'  \n\nYou shouldn't be here!\n'A great power comes with a great responsibility'\n\nProceed with caution...\n\n\n");
});
