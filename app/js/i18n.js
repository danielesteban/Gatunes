'use strict';

/* i18n (Internationalization) */
angular.module('Gatunes.i18n', [])
.factory('i18n', function($window) {
	/* Localized literals */
	var L = {
		en: {
			music: 'Music',
			downloads: 'Downloads',
			discover: 'Discover',
			recentSearches: 'Recent searches',
			searchTorrents: 'Search torrents...',
			fetchingMetadata: 'Fetching torrent metadata',
			noSupportedFiles: 'There aren\'t any supported audio files in this torrent',
			more: 'More',
			noMusic: 'You haven\'t downloaded any music yet',
			noMusicDiscover: 'Discover some artists',
			noMusicSearch: 'Search for some torrrents',
			download: 'Download',
			cancelDownload: 'Cancel download',
			trash: 'Remove',
			similarArtists: 'Similar artists',
			playlists: 'Playlists',
			addPlaylist: 'Add playlist',
			newPlaylist: 'New playlist',
			termsTitle: 'Terms of service',
			termsAccept: 'I accept',
			termsCancel: 'Leave',
			updatedTitle: 'Gatunes has been updated',
			updatedCopy: 'The new version is',
			updatedButton: 'Restart the application',
			storage: 'Storage',
			language: 'Language',
			version: 'Version',
			database: 'Database',
			backupDB: 'Backup',
			restoreDB: 'Restore',
			restoringDB: 'Restoring the database',
			resetDB: 'Reset',
			areYouSure: 'Are you sure?',
			confirm: 'Confirm',
			cancel: 'Cancel',
			addMusic: 'Add Music from your computer'
		},
		es: {
			music: 'Música',
			downloads: 'Descargas',
			discover: 'Descubrir',
			recentSearches: 'Búsquedas recientes',
			searchTorrents: 'Buscar torrents...',
			fetchingMetadata: 'Cargando metadatos del torrent',
			noSupportedFiles: 'No hay ningún archivo de audio compatible en este torrent',
			more: 'Más',
			noMusic: 'Aún no te has descargado ninguna música',
			noMusicDiscover: 'Descubre unos artistas',
			noMusicSearch: 'Busca unos torrrents',
			download: 'Descargar',
			cancelDownload: 'Cancelar descarga',
			trash: 'Eliminar',
			similarArtists: 'Artistas similares',
			playlists: 'Playlists',
			addPlaylist: 'Añadir playlist',
			newPlaylist: 'Nueva playlist',
			termsTitle: 'Términos y condiciones',
			termsAccept: 'Yo acepto',
			termsCancel: 'Salir',
			updatedTitle: 'Gatunes se ha actualizado',
			updatedCopy: 'La nueva versión es',
			updatedButton: 'Reiniciar la aplicación',
			storage: 'Almacenamiento',
			language: 'Idioma',
			version: 'Versión',
			database: 'Base de datos',
			backupDB: 'Copia de seguridad',
			restoreDB: 'Restaurar',
			restoringDB: 'Restaurando la base de datos',
			resetDB: 'Reiniciar',
			areYouSure: '¿Estás seguro?',
			confirm: 'Confirmar',
			cancel: 'Cancelar',
			addMusic: 'Añadir Musica de tu ordenador'
		}
	};

	var i18n = {},
		defaultLocale = 'en',
		reset = function(locale) {
			(!locale || !L[locale]) && (locale = defaultLocale);
			for(var id in i18n) delete i18n[id];
			for(var id in L[locale]) i18n[id] = L[locale][id];
			i18n.locale = locale;
			i18n.reset = function(locale, store) {
				reset(locale);
				store && $window.localStorage.setItem('Gatunes:locale', locale);
			};
		};

	/* Locale auto-detection & setup */
	var browserLocale = (navigator.userLanguage || navigator.language).split('-'),
		storedLocale = $window.localStorage.getItem('Gatunes:locale'),
		locale = defaultLocale;

	if(L[storedLocale]) locale = storedLocale;    
	else if(L[browserLocale[0].toLowerCase()]) locale = browserLocale[0].toLowerCase();
	else if(browserLocale[1] && L[browserLocale[1].toLowerCase()]) locale = browserLocale[1].toLowerCase();
	reset(locale);

	return i18n;
});
