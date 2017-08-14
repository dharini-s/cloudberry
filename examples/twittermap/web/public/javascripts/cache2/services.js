/*
 * Module to cache the result data. Common service communicates with this module
 * instead of middleware
 */
'use strict';
angular.module('cloudberry.cache2', ['cloudberry.common'])
  .service('CacheResults', function ($window, $http, $timeout, cloudberryConfig) {

    var geoIds;
    var timeInterval;
    var keyword;
    // var filter;
    // var ws = new WebSocket(cloudberryConfig.ws);
    // var allGeoIdsExist;
    // var data;

    this.cacheMiss = function (keywords, timeInterval, geoIds) {
      // clearStorage();
      var miss = false;
      console.log('Local keyword in cacheMiss() is: ' + this.keyword);

      if(this.keyword === undefined)
        miss = true;
      else if (keywords.toString() != this.keyword.toString())
        miss = true;
      for (var i = 0; i < geoIds.length; ++i) {
        if (store.get(geoIds[i]) === undefined)
          return true;
      }
      return miss;
    };

    this.getResultsFromCache = function (geoIds, mapResult) {
      console.log('In getResultsFromCache()');
      var j = 0;

      for (var i = 0; i < geoIds.length; ++i) {
          if(store.get(geoIds[i] !== {})) {
              angular.copy(store.get(geoIds[i]), mapResult[j]);
              // mapResult[j].count = store.get(geoIds[i]).count;
              // mapResult[j].county = store.get(geoIds[i]).county;
              // mapResult[j].population = store.get(geoIds[i]).population;
              ++j;
          }
      }
    };

    this.updateStore = function (mapResult, geoLevel, geoIds, keywords) {
      console.log('In update store');

      if(geoLevel === 'county') {
          this.keyword = keywords.slice();
          // console.log('Geo Ids in update store are:');
          // console.log(geoIds.toString());
          console.log('Local keyword in updateStore() is: ' + this.keyword);

          for (var i = 0; i < mapResult.length; ++i) {
              store.set(mapResult[i].county, mapResult[i]);
          }
          for (var i = 0; i < geoIds.length; ++i) {
              if (store.get(geoIds[i]) === undefined)
                  store.set(geoIds[i], {});
          }
          // store.each(function(value, key) {
          //     console.log(key, '==', value)
          // });

          // for(var j = 0; j < geoIds.length; ++j) {
          //     if(store.get(geoIds[j]) !== {}) {
          //         console.log('Geo data is:');
          //         var object = store.get(geoIds[j]);
          //         console.log(object.toString());
          //     }
          // }
      }
    };

    function clearStorage() {
        store.clearAll();
    }
  });