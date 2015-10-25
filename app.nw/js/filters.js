'use strict';

/* Filters */
angular.module('Gatunes.filters', [])
.filter('bytes', function() {
	return function(input) {
		var kbs = Math.round(parseInt(input || 0, 10) / 1024);
		if(kbs < 1024) return kbs + 'kb';
		else return (Math.round(kbs * 100 / 1024) / 100) + 'mb';
	}
})
.filter('addzero', function() {
	return function(input) {
		return (input = (input || 0) + '').length < 2 ? '0' + input : input;
	}
})
.filter('duration', function(addzeroFilter) {
	return function(input) {
		input = parseFloat(input || 0);
		return addzeroFilter(Math.floor(input / 60)) + ':' + addzeroFilter(Math.round(input % 60));
	}
})
.filter('filename', function() {
	return function(input) {
		return ((input || '') + '').replace(/\?/g, '').replace(/\//g, '-').replace(/\\/g, '-');
	}
})
.filter('searchable', function() {
	return function(input) {
		input = (input || '').toLowerCase();
		input.substr(0, 4) === 'the ' && (input = input.substr(4));
		return input;
	}
});
