/*
 * Module to cache the result data. Common services module communicates with
 * middleware and updates cache2 module.
 */
'use strict';
angular.module('cloudberry.cache2', ['cloudberry.common'])
  .service('CacheResults', function ($window, $http, $timeout) {

    var map = new HashMap();
    var keyword;
    var timeRange = {};
    // Adding prefix only for city because overlap is only between county and city IDs
    const cityPrefix = 'C';

    // Check keyword, time range and the cache store
    this.cacheMiss = function (keywords, timeInterval, geoIds, geoLevel) {
      var miss = false;

      if(this.keyword === undefined || keywords.toString() != this.keyword.toString()
        || angular.equals(this.timeRange, {}) || !angular.equals(this.timeRange, timeInterval)) {
        miss = true; //cache miss happens if no keyword or keyword is different
        map.clear();
      }
      if(geoLevel === 'city') {
        for (var i = 0; i < geoIds.length; i++) {
          if (!map.has(cityPrefix + geoIds[i])) {
            //cache miss happens if any of the geoIds is not present
            miss = true;
            break;
          }
        }
      }
      else  {
        for (i = 0; i < geoIds.length; i++) {
          if (!map.has(geoIds[i])) {
            miss = true;
            break;
          }
        }
      }

      return miss;
    };

    // Retrieve mapResults from cache
    this.getResultsFromCache = function (geoIds, geoLevel) {
      var mapResult = [];

      if (geoLevel === 'state' || geoLevel === 'county') {
        for (var i = 0; i < geoIds.length; i++) {
          if(map.has(geoIds[i]) && !angular.equals(map.get(geoIds[i]), {})) {
            mapResult.push(map.get(geoIds[i]));
          }
        }
      }
      else  {
        for (i = 0; i < geoIds.length; i++) {
          if(map.has(cityPrefix + geoIds[i]) &&
            !angular.equals(map.get(cityPrefix + geoIds[i]), {})) {
            mapResult.push(map.get(cityPrefix + geoIds[i]));
          }
        }
      }

      return mapResult;
    };

    // Update store with mapResult each time middleware responds to batchJson query
    this.updateStore = function (mapResult, parameters) {
      console.log('In update store');

      this.keyword = parameters.keywords.slice();
      this.timeRange = angular.copy(parameters.timeInterval);

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
      else if (parameters.geoLevel === 'county') {
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
      else  {
        for (i = 0; i < mapResult.length; i++) {
          map.set(cityPrefix + mapResult[i].city, mapResult[i]);
        }
        for (i = 0; i < parameters.geoIds.length; i++) {
          if (map.has(cityPrefix + parameters.geoIds[i])) continue;
          else {
            map.set(cityPrefix + parameters.geoIds[i], {});
          }
        }
      }
    };

  });