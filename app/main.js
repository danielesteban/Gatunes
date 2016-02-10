'use strict';

const electron = require('electron');

electron.app.on('ready', function() {
	/* Launch the App */
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

	/* AutoUpdater */
	const path = require('path');
	const appPath = electron.app.getAppPath();
	if(path.extname(appPath) !== '.asar') return;
	const fs = require('fs');
	const request = require('request');
	const progress = require('request-progress');
	
	request({
		url: 'http://gatunes.com/latest.json',
		json: true
	}, function(err, response, update) {
		if(err || response.statusCode !== 200) return;
		var versionCompare = function(left, right) {
				if(typeof left + typeof right !== 'stringstring') return false;

				var a = left.split('.'),
					b = right.split('.'),
					i = 0, len = Math.max(a.length, b.length);

				for(; i < len; i++) {
					if((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) return 1;
					else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) return -1;
				}

				return 0;
			};

		if(versionCompare(electron.app.getVersion(), update.version) >= 0) return;

		win.removeAllListeners('close');
		win.on('close', function(e) {
			e.preventDefault();
		});

		win.loadURL('file://' + __dirname + '/autoupdater.html');
		win.setSize(800, 230);

		var error = function() {
			win.removeAllListeners('close');
			win.webContents.executeJavaScript('error()');
			win.on('close', function(e) {
				electron.app.quit();
			});
		};

		win.webContents.on('did-finish-load', function() {
			progress(request({
				url: update.url,
				encoding: null
			}, function(err, response, asar) {
				if(err || response.statusCode !== 200 || require('crypto').createHash('sha256').update(asar).digest('hex') !== update.signature) return error();
				process.noAsar = true;
				fs.writeFile(appPath, asar, function(err) {
					if(err) return error();
					win.removeAllListeners('close');
					win.webContents.executeJavaScript('done("' + update.version + '")');
					win.on('close', function(e) {
						electron.app.quit();
					});

					if(process.platform === 'darwin') {
						var plistPath = path.join(path.dirname(appPath), '..', 'Info.plist'),
							xml = fs.readFileSync(plistPath, 'utf-8'),
							key = 'CFBundleShortVersionString</key>\n\t<string>',
							index = xml.indexOf(key) + key.length,
							plist = xml.substr(0, index) + 'Version ' + update.version + '</string>\n\t<key>CFBundleVersion</key>\n\t<string>' + update.version;

						plist += xml.substr(xml.indexOf('</string>', xml.indexOf('</string>', index) + 1));
						fs.writeFileSync(plistPath, plist);
					}
				});
			}))
			.on('progress', function(state) {
				win.webContents.executeJavaScript('progress(' + state.percentage + ')');
			})
			.on('error', function(err) {
				error();
			});
		});
	});
});
