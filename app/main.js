'use strict';

const electron = require('electron');

electron.app.on('ready', function() {
	electron.Menu.setApplicationMenu(new electron.Menu());
	var win = new electron.BrowserWindow({
		title: 'Gatunes',
		icon: __dirname + '/icon.png',
		frame: false,
		width: 1024,
		height: 600,
		minWidth: 800,
		minHeight: 600
	});
	win.loadURL('file://' + __dirname + '/index.html');
	win.on('close', function(e) {
		e.preventDefault();
	});
});
