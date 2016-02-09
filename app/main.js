'use strict';

const electron = require('electron');

electron.app.on('ready', function() {
	var mainWindow = new electron.BrowserWindow({
		title: 'Gatunes',
		icon: __dirname + '/icon.png',
		frame: false,
		width: 1024,
		height: 600,
		minWidth: 800,
		minHeight: 600
	});
	mainWindow.loadURL('file://' + __dirname + '/index.html');
	mainWindow.on('close', function(e) {
		e.preventDefault();
	});
});

