angular.module('cloudberry.common', ['cloudberry.cache2'])
  .factory('cloudberryConfig', function(){
    return {
      ws: config.wsURL,
      sentimentEnabled: config.sentimentEnabled,
      sentimentUDF: config.sentimentUDF,
      removeSearchBar: config.removeSearchBar,
      predefinedKeywords: config.predefinedKeywords,
      normalizationUpscaleFactor: 1000 * 1000,
      normalizationUpscaleText: "/M",
      sentimentUpperBound: 4,
      getPopulationTarget: function(parameters){
        switch (parameters.geoLevel) {
          case "state":
            return {
              joinKey: ["state"],
              dataset: "twitter.dsStatePopulation",
              lookupKey: ["stateID"],
              select: ["population"],
              as: ["population"]
            };
          case "county":
            return {
              joinKey: ["county"],
              dataset: "twitter.dsCountyPopulation",
              lookupKey: ["countyID"],
              select: ["population"],
              as: ["population"]
            };
          case "city":
            return {
              joinKey: ["city"],
              dataset: "twitter.dsCityPopulation",
              lookupKey: ["cityID"],
              select: ["population"],
              as: ["population"]
            };
        }
      }
    };
  })
  .service('cloudberry', function($http, $timeout, $location, cloudberryConfig, CacheResults) {
    var startDate = config.startDate;
    var endDate = config.endDate;
    var defaultNonSamplingDayRange = 1500;
    var defaultSamplingDayRange = 1;
    var defaultSamplingSize = 10;
    var ws = new WebSocket(cloudberryConfig.ws);

    var countRequest = JSON.stringify({
      dataset: "twitter.ds_tweet",
      global: {
        globalAggregate: {
          field: "*",
          apply: {
            name: "count"
          },
          as: "count"
        }},
      estimable : true,
      transform: {
        wrap: {
          key: "totalCount"
        }
      }
    });

    function requestLiveCounts() {
      if(ws.readyState === ws.OPEN){
        ws.send(countRequest);
      }
    }
    var myVar = setInterval(requestLiveCounts, 1000);

    function getLevel(level){
      switch(level){
        case "state" : return "stateID";
        case "county" : return "countyID";
        case "city" : return "cityID";
      }
    }

    function getFilter(parameters, maxDay) {
      var spatialField = getLevel(parameters.geoLevel);
      var keywords = [];
      for(var i = 0; i < parameters.keywords.length; i++){
        keywords.push(parameters.keywords[i].replace("\"", "").trim());
      }
      var queryStartDate = new Date(parameters.timeInterval.end);
      queryStartDate.setDate(queryStartDate.getDate() - maxDay);
      queryStartDate = parameters.timeInterval.start > queryStartDate ? parameters.timeInterval.start : queryStartDate;

      return [
        {
          field: "geo_tag." + spatialField,
          relation: "in",
          values: parameters.geoIds
        }, {
          field: "create_at",
          relation: "inRange",
          values: [queryStartDate.toISOString(), parameters.timeInterval.end.toISOString()]
        }, {
          field: "text",
          relation: "contains",
          values: keywords
        }
      ];
    }

    function byGeoRequest(parameters) {
      if (cloudberryConfig.sentimentEnabled) {
        return {
          dataset: parameters.dataset,
          append: [{
            field: "text",
            definition: cloudberryConfig.sentimentUDF,
            type: "Number",
            as: "sentimentScore"
          }],
          filter: getFilter(parameters, defaultNonSamplingDayRange),
          group: {
            by: [{
              field: "geo",
              apply: {
                name: "level",
                args: {
                  level: parameters.geoLevel
                }
              },
              as: parameters.geoLevel
            }],
            aggregate: [{
              field: "*",
              apply: {
                name: "count"
              },
              as: "count"
            }, {
              field: "sentimentScore",
              apply: {
                name: "sum"
              },
              as: "sentimentScoreSum"
            }, {
              field: "sentimentScore",
              apply: {
                name: "count"
              },
              as: "sentimentScoreCount"
            }],
            lookup: [
              cloudberryConfig.getPopulationTarget(parameters)
            ]
          }
        };
      } else {
        return {
          dataset: parameters.dataset,
          filter: getFilter(parameters, defaultNonSamplingDayRange),
          group: {
            by: [{
              field: "geo",
              apply: {
                name: "level",
                args: {
                  level: parameters.geoLevel
                }
              },
              as: parameters.geoLevel
            }],
            aggregate: [{
              field: "*",
              apply: {
                name: "count"
              },
              as: "count"
            }],
            lookup: [
              cloudberryConfig.getPopulationTarget(parameters)
            ]
          }
        };
      }
    }

    function byTimeRequest(parameters) {
      return {
        dataset: parameters.dataset,
        filter: getFilter(parameters, defaultNonSamplingDayRange),
        group: {
          by: [{
            field: "create_at",
            apply: {
              name: "interval",
              args: {
                unit: parameters.timeBin
              }
            },
            as: parameters.timeBin
          }],
          aggregate: [{
            field: "*",
            apply: {
              name: "count"
            },
            as: "count"
          }]
        }
      };
    }

    function byHashTagRequest(parameters) {
      return {
        dataset: parameters.dataset,
        filter: getFilter(parameters, defaultNonSamplingDayRange),
        unnest: [{
          hashtags: "tag"
        }],
        group: {
          by: [{
            field: "tag"
          }],
          aggregate: [{
            field: "*",
            apply: {
              name: "count"
            },
            as: "count"
          }]
        },
        select: {
          order: ["-count"],
          limit: 50,
          offset: 0
        }
      };
    }

    var cloudberryService = {

      totalCount: 0,
      startDate: startDate,
      parameters: {
        dataset: "twitter.ds_tweet",
        keywords: [],
        timeInterval: {
          start: startDate,
          end: endDate ?  endDate : new Date()
        },
        timeBin : "day",
        geoLevel: "state",
        geoIds : [37,51,24,11,10,34,42,9,44,48,35,4,40,6,20,32,8,49,12,22,28,1,13,45,5,47,21,29,54,17,18,39,19,55,26,27,31,56,41,46,16,30,53,38,25,36,50,33,23,2]
      },

      queryType: "search",

      mapResult: [],
      timeResult: [],
      hashTagResult: [],
      errorMessage: null,

      query: function(parameters, queryType) {
        var sampleJson = (JSON.stringify({
          dataset: parameters.dataset,
          filter: getFilter(parameters, defaultSamplingDayRange),
          select: {
            order: ["-create_at"],
            limit: defaultSamplingSize,
            offset: 0,
            field: ["create_at", "id", "user.id"]
          },
          transform: {
            wrap: {
              key: "sample"
            }
          }
        }));

        var batchJson = (JSON.stringify({
          batch: [byTimeRequest(parameters), byGeoRequest(parameters), byHashTagRequest(parameters)],
          option: {
            sliceMillis: 2000
          },
          transform: {
            wrap: {
              key: "batch"
            }
          }
        }));

        if (cloudberryService.parameters.geoLevel === 'city') {
          ws.send(sampleJson);
          ws.send(batchJson);
        } else {
          if (CacheResults.cacheMiss(cloudberryService.parameters.keywords,cloudberryService.parameters.timeInterval,
            cloudberryService.parameters.geoIds)) {
            //miss is true
            console.log('Querying from middleware');
            ws.send(sampleJson);
            ws.send(batchJson);
          } else {
            var temp = CacheResults.getResultsFromCache(cloudberryService.parameters.geoIds, cloudberryService.parameters.geoLevel);
            var tempstr = JSON.stringify(temp);
            console.log('Temp is: ');
            console.log(tempstr);
            console.log('Received mapresult');
            cloudberryService.mapResult = temp;
            var str = JSON.stringify(cloudberryService.mapResult);
            console.log('CloudberryService.mapResult is: ');
            console.log(str);
          }
        }
      }
    };

    ws.onmessage = function(event) {
      $timeout(function() {
        var result = JSONbig.parse(event.data);
        switch (result.key) {

          case "sample":
            cloudberryService.tweetResult = result.value[0];
            break;
          case "batch":
            cloudberryService.timeResult = result.value[0];
            cloudberryService.mapResult = result.value[1];
            console.log("Map result:");
            console.log(cloudberryService.mapResult);
            cloudberryService.hashTagResult = result.value[2];
            if (cloudberryService.parameters.geoLevel === 'county' ||
              cloudberryService.parameters.geoLevel === 'state')
              CacheResults.updateStore(cloudberryService.mapResult, cloudberryService.parameters);
            break;
          case "totalCount":
            cloudberryService.totalCount = result.value[0][0].count;
            console.log("Reached totalcount common services.js");
            break;
          case "error":
            console.error(result);
            cloudberryService.errorMessage = result.value;
            break;
          case "done":
            break;
          default:
            console.error("ws get unknown data: ", result);
            cloudberryService.errorMessage = "ws get unknown data: " + result.toString();
            break;
        }
      });
    };


    return cloudberryService;
  });
