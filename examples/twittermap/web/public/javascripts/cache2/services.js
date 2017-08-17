/*
 * Module to cache the result data. Common service communicates with this module
 * instead of middleware
 */
'use strict';
angular.module('cloudberry.cache2', ['cloudberry.common'])
  .service('CacheResults', function ($window, $http, $timeout, cloudberryConfig) {

    var map = new HashMap();
    var keyword;
    var timeRange = {};

    this.cacheMiss = function (keywords, timeInterval, geoIds) {
      var miss = false;
      console.log('Local keyword in cacheMiss() is: ' + this.keyword);

      if(this.keyword === undefined || keywords.toString() != this.keyword.toString()
        || angular.equals(this.timeRange, {}) || !angular.equals(this.timeRange, timeInterval)) {
        miss = true; //cache miss happens if no keyword or keyword is different
        map.clear();
      }

      for (var i = 0; i < geoIds.length; i++) {
        if (!map.has(geoIds[i])) {
          //cache miss happens if any of the geoIds is not present
          miss = true;
          break;
        }
      }

      return miss;
    };

    this.getResultsFromCache = function (geoIds, geoLevel) {
      console.log('In getResultsFromCache()');
      var mapResult = [];

      if (geoLevel === 'state' || geoLevel === 'county') {
        for (var i = 0; i < geoIds.length; i++) {
          if(map.has(geoIds[i]) && !angular.equals(map.get(geoIds[i]), {})) {
            mapResult.push(map.get(geoIds[i]));
          }
        }
      }

      console.log('MapResult in cache is: ');
      var str = JSON.stringify(mapResult);
      console.log(str);
      //console.log(mapResult.toString());
      console.log('Returning mapresult');
      return mapResult;
    };

    this.updateStore = function (mapResult, parameters) {
      console.log('In update store');

      this.keyword = parameters.keywords.slice();
      this.timeRange = angular.copy(parameters.timeInterval);
      console.log('Local keyword in updateStore() is: ' + this.keyword);

      if (parameters.geoLevel === 'state') {
        for (var i = 0; i < mapResult.length; i++) {
          map.set(mapResult[i].state, mapResult[i]);
        }
        for (i = 0; i < parameters.geoIds.length; i++) {
          if (map.has(parameters.geoIds[i])) continue;
          else {
            map.set(parameters.geoIds[i], {});
          }
        }
      }
      if (parameters.geoLevel === 'county') {
        for (i = 0; i < mapResult.length; i++) {
          map.set(mapResult[i].county, mapResult[i]);
        }
        for (i = 0; i < parameters.geoIds.length; i++) {
          if (map.has(parameters.geoIds[i])) continue;
          else {
            map.set(parameters.geoIds[i], {});
          }
        }
      }
    };

  });