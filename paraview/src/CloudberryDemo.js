/* global document */
import CompositeClosureHelper from 'paraviewweb/src/Common/Core/CompositeClosureHelper';
import FieldProvider from 'paraviewweb/src/InfoViz/Core/FieldProvider';
import LegendProvider from 'paraviewweb/src/InfoViz/Core/LegendProvider';
import Histogram1DProvider from 'paraviewweb/src/InfoViz/Core/Histogram1DProvider';
import HistogramBinHoverProvider from 'paraviewweb/src/InfoViz/Core/HistogramBinHoverProvider';
import ScoresProvider from 'paraviewweb/src/InfoViz/Core/ScoresProvider';
import SelectionProvider from 'paraviewweb/src/InfoViz/Core/SelectionProvider';
import HistogramSelector from 'paraviewweb/src/InfoViz/Native/HistogramSelector';
import FieldSelector from 'paraviewweb/src/InfoViz/Native/FieldSelector';

var asterixDBHost = "http://textdb.ics.uci.edu:19002/query/service";
var cloudberryHost = "ws://localhost:9000/ws"
var dataSource = "cloudberry";
var dataModel = { fields: { byTimeResult: { }, byGeoResult: { } }, histogram1D_storage: { 32: { byTimeResult: { }, byGeoResult: { } } }, dirty: true };
var xhttpState = "waiting";
var Server;

var t0;
var t1;

var JSONbig = require('json-bigint');

var defaultNonSamplingDayRange = 1500;
var defaultSamplingDayRange = 1500;
var defaultSamplingSize = 10;

// select a start date for the query
var startDate = new Date(2015, 10, 22, 0, 0, 0, 0);

var countRequest = JSON.stringify({
  dataset: 'twitter.ds_tweet',
  global: {
    globalAggregate: {
      field: '*',
      apply: {
        name: 'count',
      },
      as: 'count',
    },
  },
  estimable: true,
  transform: {
    wrap: {
      key: 'totalCount',
    },
  },
});

function getLevel(level) {
  switch (level) {
    case 'state': return 'stateID';
    case 'county': return 'countyID';
    case 'city': return 'cityID';
    default:
      break;
  }
  return 'good';
}

function mkString(array, delimiter) {
  var s = '';
  function myconcat(item) {
    s += item.toString() + delimiter;
  }
  array.forEach(myconcat);
  return s.substring(0, s.length - 1);
}

function getFilter(parameters, maxDay) {
  var spatialField = getLevel(parameters.geoLevel);
  var keywords = [];
  var queryStartDate = new Date(parameters.timeInterval.end);
  var i;
  for (i = 0; i < parameters.keywords.length; i++) {
    keywords.push(parameters.keywords[i].replace('\'', '').trim());
  }
  queryStartDate.setDate(queryStartDate.getDate() - maxDay);
  queryStartDate = parameters.timeInterval.start > queryStartDate ? parameters.timeInterval.start : queryStartDate;

  return [
    {
      field: 'geo_tag.'.concat(spatialField),
      relation: 'in',
      values: parameters.geoIds,
    }, {
      field: 'create_at',
      relation: 'inRange',
      values: [queryStartDate.toISOString(), parameters.timeInterval.end.toISOString()],
    }, {
      field: 'text',
      relation: 'contains',
      values: [mkString(keywords, ',')],
    },
  ];
}

function byGeoRequest(parameters) {
  return {
    dataset: parameters.dataset,
    filter: getFilter(parameters, defaultNonSamplingDayRange),
    group: {
      by: [{
        field: 'geo',
        apply: {
          name: 'level',
          args: {
            level: parameters.geoLevel,
          },
        },
        as: parameters.geoLevel,
      }],
      aggregate: [{
        field: '*',
        apply: {
          name: 'count',
        },
        as: 'count',
      }],
    },
  };
}

function byTimeRequest(parameters) {
  return {
    dataset: parameters.dataset,
    filter: getFilter(parameters, defaultNonSamplingDayRange),
    group: {
      by: [{
        field: 'create_at',
        apply: {
          name: 'interval',
          args: {
            unit: parameters.timeBin,
          },
        },
        as: parameters.timeBin,
      }],
      aggregate: [{
        field: '*',
        apply: {
          name: 'count',
        },
        as: 'count',
      }],
    },
  };
}

function prepareSendButton() {
    if (dataSource == "cloudberry"){
    	// Prepare function to send query to cloudberry
        document.getElementById('cntBtn').onclick = function send() {
            var parameters = {
            dataset: 'twitter.ds_tweet',
            keywords: document.getElementById('query').value.trim().split(/\s+/),
            timeInterval: {
                start: startDate,
                end: new Date(),
            },
            timeBin: 'day',
            geoLevel: 'state',
            geoIds: [37, 51, 24, 11, 10, 34, 42, 9, 44, 48, 35, 4, 40, 6, 20, 32, 8, 49, 12, 22, 28, 1, 13, 45, 5, 47, 21, 29, 54, 17, 18, 39, 19, 55, 26, 27, 31, 56, 41, 46, 16, 30, 53, 38, 25, 36, 50, 33, 23, 2],
            };

            var sampleJson = (JSON.stringify({
            dataset: parameters.dataset,
            filter: getFilter(parameters, defaultSamplingDayRange),
            select: {
                order: ['-create_at'],
                limit: defaultSamplingSize,
                offset: 0,
                field: ['create_at', 'id', 'user.id', 'favorite_count', 'retweet_count'],
            },
            transform: {
                wrap: {
                key: 'sample',
                },
            },
            }));

            var batchJson = (JSON.stringify({
            batch: [byTimeRequest(parameters), byGeoRequest(parameters)],
            option: {
                sliceMillis: 2000,
            },
            transform: {
                wrap: {
                key: 'batch',
                },
            },
            }));

            // Server.send(sampleJson);
            Server.send(batchJson);
            t0 = performance.now();
        };
    }
    else if (dataSource == "asterixDB"){
    	// Prepare function to send query to asterixDB
        document.getElementById('cntBtn').onclick = function send() {
            if (xhttpState == "waiting"){
            	xhttpState = "time_query_pending";
                var keyword = document.getElementById('query').value.trim().split(/\s+/);
                var params = "statement=select day, count(*) as count from twitter.ds_tweet t where ftcontains(t.text, ['" + keyword + "']) group by get_interval_start_datetime(interval_bin(t.create_at, datetime('1990-01-01T00:00:00.000Z'), day_time_duration('P1D') )) as day";
                xhttp.open("POST", asterixDBHost, true);
                xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
                xhttp.send(params)
                t0 = performance.now();
            }
        }
    }
}

function prepareSwitchButton(){
    document.getElementById('cntBtn2').onclick = function change_source(){
        if (dataSource == "cloudberry"){
            dataSource = "asterixDB";
        }
        else {
            dataSource = "cloudberry";
        }
        document.getElementById('source').innerHTML = dataSource;
        prepareSendButton();
    }
}

function onload_process(){
    prepareSendButton();
    prepareSwitchButton();
}

function dateDiffInDays(a, b) {
  var timeDiff = Math.abs(b.getTime() - a.getTime());
  var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return diffDays;
}

var xhttp = new XMLHttpRequest();
xhttp.onreadystatechange = function() {
    if (this.readyState == 4 && this.status == 200) {
        // Typical action to be performed when the document is ready:
        var response = JSONbig.parse(xhttp.responseText);
        
        if (xhttpState == "time_query_pending"){
            // Processing time query result
            var width = dateDiffInDays(startDate, new Date()) + 1;
            var valuesTime = new Array(width);
            valuesTime.fill(0.0001);

            var tweetCount = 0;
            for (var i = 0; i < response.results.length; i++) {
                valuesTime[dateDiffInDays(startDate, new Date(response.results[i].day))] = response.results[i].count;
                tweetCount += response.results[i].count;
            }
            document.getElementById('queryCount').innerHTML = tweetCount;
            dataModel.fields.byTimeResult = { name: 'byTimeResult', range: [0.0, 1.0], active: true, id: 0 };
            dataModel.histogram1D_storage['32'].byTimeResult = { max: 1.0, counts: valuesTime, name: 'byTimeResult', min: 0.0 };
            
            var keyword = document.getElementById('query').value.trim().split(/\s+/);
            var params = "statement=select stateID, count(*) as count from twitter.ds_tweet t where ftcontains(t.text, ['" + keyword + "']) group by geo_tag.stateID as stateID";
            xhttp.open("POST", asterixDBHost, true);
            xhttp.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            xhttp.send(params);
            
            xhttpState = "geo_query_pending";            
        }
        else if (xhttpState == "geo_query_pending"){
            // Processing geo query result
            var valuesGeo = new Array(52);
            valuesGeo.fill(0.0001);

            for (var i = 0; i < response.results.length; i++) {
                valuesGeo[parseInt(response.results[i].stateID, 10)] = parseInt(response.results[i].count, 10);
            }
            dataModel.fields.byGeoResult = { name: 'byGeoResult', range: [0, 52], active: true, id: 1 };
            dataModel.histogram1D_storage['32'].byGeoResult = { max: 52, counts: valuesGeo, name: 'byGeoResult', min: 0 };

            updateHistogram(dataModel);
            
            t1 = performance.now();
            document.getElementById('queryTime').innerHTML = (t1 - t0) + " milliseconds."
            
            xhttpState = "waiting";
        }
    }
};

window.onload = onload_process();
document.getElementById('source').innerHTML = dataSource;

const bodyElt = document.querySelector('body');
// '100vh' is 100% of the current screen height
const defaultHeight = '100vh';

const histogramSelectorContainer = document.createElement('div');
histogramSelectorContainer.style.position = 'relative';
histogramSelectorContainer.style.width = '52%';
histogramSelectorContainer.style.height = defaultHeight;
histogramSelectorContainer.style.float = 'left';
bodyElt.appendChild(histogramSelectorContainer);

const fieldSelectorContainer = document.createElement('div');
fieldSelectorContainer.style.position = 'relative';
fieldSelectorContainer.style.width = '48%';
fieldSelectorContainer.style.height = defaultHeight;
fieldSelectorContainer.style.float = 'left';
fieldSelectorContainer.style['font-size'] = '10pt';
bodyElt.appendChild(fieldSelectorContainer);

function updateHistogram(dataModel) {
  const provider = CompositeClosureHelper.newInstance((publicAPI, model, initialValues = {}) => {
    Object.assign(model, initialValues);
    FieldProvider.extend(publicAPI, model, initialValues);
    Histogram1DProvider.extend(publicAPI, model, initialValues);
    HistogramBinHoverProvider.extend(publicAPI, model);
    LegendProvider.extend(publicAPI, model, initialValues);
    ScoresProvider.extend(publicAPI, model, initialValues);
    SelectionProvider.extend(publicAPI, model, initialValues);
  })(dataModel);

  // set provider behaviors
  provider.setFieldsSorted(true);
  provider.getFieldNames().forEach((name) => {
    provider.addLegendEntry(name);
  });
  provider.assignLegend(['colors', 'shapes']);

  // activate scoring gui
  const scores = [
    { name: 'No', color: '#FDAE61', value: -1 },
    { name: 'Maybe', color: '#FFFFBF', value: 0 },
    { name: 'Yes', color: '#A6D96A', value: 1 },
  ];
  provider.setScores(scores);
  provider.setDefaultScore(1);

  // Create histogram selector
  const histogramSelector = HistogramSelector.newInstance({
    provider,
    container: histogramSelectorContainer,
    // defaultScore: 1,
  });
  // set a target number per row.
  histogramSelector.requestNumBoxesPerRow(4);
  // Or show a single variable as the focus, possibly disabling switching to other vars.
  // histogramSelector.displaySingleHistogram(provider.getFieldNames()[5], true);
  // and maybe set a scoring annotation:
  // histogramSelector.setDefaultScorePartition(provider.getFieldNames()[5]);
  // test reset:
  // window.setTimeout(() => {
  //   histogramSelector.requestNumBoxesPerRow(4);
  // }, 5000);

  // Create field selector
  const fieldSelector = FieldSelector.newInstance({ provider, container: fieldSelectorContainer });

  histogramSelector.resize();
  fieldSelector.resize();
}

function connect() {
  Server = new WebSocket(cloudberryHost);

  function requestLiveCounts() {
    if (Server.readyState === Server.OPEN) {
      Server.send(countRequest);
    }
  }
  setInterval(requestLiveCounts, 1000);

  Server.onmessage = function msghandler(event) {
    var result = JSONbig.parse(event.data);
    var i;
    var width = dateDiffInDays(startDate, new Date()) + 1;
    var valuesTime = new Array(width);
    var valuesGeo = new Array(52);
    valuesTime.fill(0.0001);
    valuesGeo.fill(0.0001);

    switch (result.key) {
      case 'sample':
        // transform query result to csv format and print it to the console
        var items = result.value[0]
        var replacer = (key, value) => value === null ? '' : value // specify how you want to handle null values here
        var header = Object.keys(items[0])
        let csv = items.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
        csv.unshift(header.join(','))
        csv = csv.join('\r\n')
        console.log(csv)
        
        break;
      case 'batch':
        // transform the query result to the JSON format required by ParaviewWeb
        var tweetCount = 0;
        for (i = 0; i < result.value[0].length; i++) {
          valuesTime[dateDiffInDays(startDate, new Date(result.value[0][i].day))] = parseInt(result.value[0][i].count, 10);
          tweetCount += parseInt(result.value[0][i].count, 10);
        }
        document.getElementById('queryCount').innerHTML = tweetCount;
        dataModel.fields.byTimeResult = { name: 'byTimeResult', range: [0.0, 1.0], active: true, id: 0 };
        dataModel.histogram1D_storage['32'].byTimeResult = { max: 1.0, counts: valuesTime, name: 'byTimeResult', min: 0.0 };

        for (i = 0; i < result.value[1].length; i++) {
          valuesGeo[parseInt(result.value[1][i].state, 10)] = parseInt(result.value[1][i].count, 10);
        }
        dataModel.fields.byGeoResult = { name: 'byGeoResult', range: [0, 52], active: true, id: 1 };
        dataModel.histogram1D_storage['32'].byGeoResult = { max: 52, counts: valuesGeo, name: 'byGeoResult', min: 0 };

        updateHistogram(dataModel);
        
        t1 = performance.now();
        document.getElementById('queryTime').innerHTML = (t1 - t0) + " milliseconds."
        
        break;
      case 'totalCount':
        document.getElementById('totalCount').innerHTML = result.value[0][0].count;
        break;
      case 'error':
        // console.error(result);
        break;
      case 'done':
        break;
      default:
        console.error('ws get unknown data: ', result);
        break;
    }
  };
}

connect();
