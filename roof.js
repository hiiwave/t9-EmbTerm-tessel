var climate, servo, servo1, wifiAgent;
var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var roof = {
  init: function() {
    this.configure(function(err) {
      console.log("Start!");
      roof.measure();
      roof.heartbeat();
      roof.mytest();
    });
    this.bindEvents();
  },
  mytest: function() {
  	// var b = false;
  	// (function turnForever() {
  	// 	b = !b;
  	// 	roof.turn(b, turnForever);
  	// })();
  },
  threshold: 60,
  measure: function() {
    console.log("Humidity threshold = " + roof.threshold + "..");
    setInterval(function () {
      climate.readHumidity(function (err, humid) {
        if (err)  console.error(err);
        // console.log('- Humidity:', humid.toFixed(4) + '%RH');
        if (!roof.turning) {
        	// sendStatus has much overhead, affect turning
        	roof.sendStatus(humid);	
        }      
        if (humid >= roof.threshold && roof.turnstate == false) {
          roof.turn("on");
        } else if (humid < roof.threshold - 1 && roof.turnstate == true) {
          roof.turn("off");
        }  
      });
    }, 1000);
  },
  heartbeat: function() {
  },
  configure: function(cb) {
    servo.configure(servo1, 0.055, 0.10, function(err) {
      if (err)  console.error(err);
      roof.turnstate = false;
      servo.move(servo1, 1, cb());
    });
  },
  turnstate: false,
  turning: false,
  turn: function(b, cb) {
    if (roof.turning)  return
    if (b == "on") {
      b = true;
    } else if (b == "off") {
      b = false;
    }
    console.log("Turn " + (b? "on": "off") + " start");
    roof.turning = true;
    roof.turnstate = b;
    var pos = b? 1 : 0;
    var period = 2.0;
    var delta = 0.03;
    (function gradMove() {
      if ((b && pos > 0) || (!b && pos < 1)) {
        pos += b? -delta: delta;
        servo.move(servo1, pos, function() {
          setTimeout(gradMove, period * delta * 1000);
        });
      } else {
        console.log("Turn " + (b? "on": "off") + " success");
        roof.turning = false;      
        if(cb) {
        	cb();
        } 
      }      
    })();
  },
  bindEvents: function() {
    servo.on('error', function(err) {
      console.log('error connecting module', err);
    });
    climate.on('error', function(err) {
      console.log('error connecting module', err);
    });
  },
  sendReady : true,
  sendStatus: function(humi_) {
    if (!roof.sendReady)  return;
    if (wifiAgent.state ) {
      // console.log("Send a packet");
      var packet = {
        humi: humi_
      };
      roof.postData(JSON.stringify(packet));
    } else {
      console.log("Wifi has not been ready")
    }
  },
  postData: function(data) {
    roof.sendReady = false;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://192.168.1.13:5001/feedhumi');
    // xhr.open('POST', 'https://t9-roofserver.herokuapp.com/feedhumi');
    xhr.onreadystatechange = function(oEvent) {
      if (xhr.readyState == 4) {
        if (xhr.status == 200) {
          // console.log('Got response: ' + xhr.responseText);
          roof.sendReady = true;
        } else {
          console.error("Error: " + xhr.statusText + ", retry 60s later..");
    			setTimeout(function() {
          	roof.sendReady = true;
    			}, 60000);
        }
      }
    };
    xhr.send(data);
  }
}

var wifi = require('wifi-cc3000'); 
var wifiAgent = {
  init : function() {
    this.bindEvents();

    // Auto connection seems problematic, pls connect by hand using command "tessel wifi .."
    // this.connect();  
  },
  state : false,
  connect : function() {
    var network = 'esys305-Dlink';
    var pass = '305305abcd';
    var security = 'wpa2';
    var timeouts = 20;
    wifi.connect({
      security: security,
      ssid: network,
      password: pass,
      timeout: 10 // in seconds
    });
  },
  bindEvents : function() {
    wifi.on('connect', function(data) {
      console.log("connect emitted", data);
      wifiAgent.state = true;
      // wifiAgent.testConnection();
    });
    wifi.on('disconnect', function(data) {
      console.log("disconnect emitted", data);
      wifiAgent.state = false;
    })
    wifi.on('timeout', function(err) {
      console.log("timeout emitted");
      timeouts++;
      if (timeouts > 2) {
        // reset the wifi chip if we've timed out too many times
        wifiAgent.powerCycle();
      } else {
        wifiAgent.connect();
      }
    });
    wifi.on('error', function(err) {
      // one of the following happened
      // 1. tried to disconnect while not connected
      // 2. tried to disconnect while in the middle of trying to connect
      // 3. tried to initialize a connection without first waiting for a timeout or a disconnect
      console.log("error emitted", err);
    });    
  },
  powerCycle : function() {
    // when the wifi chip resets, it will automatically try to reconnect
    // to the last saved network
    wifi.reset(function() {
      timeouts = 0; // reset timeouts
      console.log("done power cycling");
      // give it some time to auto reconnect
      setTimeout(function() {
        if (!wifi.isConnected()) {
          // try to reconnect
          wifiAgent.connect();
        }
      }, 20 * 1000); // 20 seconds wait
    })
  },
  testConnection: function() {
    var http = require('http');
    var statusCode = 200;
    var count = 1;

    setImmediate(function start () {
      console.log('http request #' + (count++))
      http.get("http://httpstat.us/" + statusCode, function (res) {
        console.log('# statusCode', res.statusCode)

        var bufs = [];
        res.on('data', function (data) {
          bufs.push(new Buffer(data));
          console.log('# received', new Buffer(data).toString());
        })
        res.on('close', function () {
          console.log('done.');
          setImmediate(start);
        })
      }).on('error', function (e) {
        console.log('not ok -', e.message, 'error event')
        setImmediate(start);
      });
    });
  }
}
wifiAgent.init();


require('tesselate') ({
  modules: {
    A: ['climate-si7020', 'climate'],
    B: ['servo-pca9685', 'servo']
  }
}, function (tessel, modules) {  // Function called when all modules are ready
  climate = modules.climate;
  servo = modules.servo;
  servo1 = 1;  // We have a servo plugged in at position 1

  roof.init();
});
