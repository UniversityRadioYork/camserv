
// Load coffee-script for Paparazzo
require('coffee-script/register');

// Load in modules
var config = require('config');
var Paparazzo = require('paparazzo');
var http = require('http');
var Router = require('router');
var finalhandler = require('finalhandler');
var compression = require('compression');
var url = require('url');
var Promise = require('bluebird');
var request = require('request-promise');

var cameraConfig = config.get('Cameras');
var defaultCam = config.get('DefaultCam');
var serverConfig = config.get('Server');
var apiConfig = config.get('API');

var cameras = {};
var images = {};

var camLive = defaultCam;
var camMan = {
    cam: '',
    time: 0,
    show: 0
};

// Store downloaded image for serving
var imageUpdate = function (camera) {
    return function(image) {
        images[camera] = image;
    };
};
var imageError = function (camera) {
    return function (error) {
        return console.log('Error: ' + error.message);
    };
};

// Check that camera is in config
var isValid = function (cam) {
    return cameraConfig.hasOwnProperty(cam);
};

// Find the camera from the given roomID
var roomToCam = function (roomID) {
    for (var camera in cameraConfig) {
        if (cameraConfig[camera].room === roomID) {
            return camera;
        }
    }
    return defaultCam;
};

// Make an API GET request and return promise
var getAPI = function (path) {

    var options = {
        uri: path,
        baseUrl: apiConfig.protocol + '://' + apiConfig.hostname + apiConfig.basePath,
        qs: {
            api_key: apiConfig.key
        },
        json: true
    };

    return request(options);
};

// Return a promise of the camera that *should* be live
var getCurrentCam = function () {

    var cam = defaultCam;

    return Promise.join(getAPI('/show/currentshow'), getAPI('/selector/studioattime'),
        function (show, studio) {
            show = show.payload;
            studio = studio.payload;

            if ((show === null) || (show.show_id !== camMan.show)) {
                if (typeof studio !== 'undefined') {
                    cam = roomToCam(studio);
                }
            } else {
                cam = camMan.cam;
            }

        })
        .then(function () {
            return {
                camera: cam,
                room: cameraConfig[cam].room
            };
        })
        .catch(function () {
            return {
                camera: cam,
                room: cameraConfig[cam].room
            };
        });

};

// Set camMan with requested camera and return a promise of updateCam
var setCurrentCam = function (cam) {

    if (isValid(cam)) {
        return getAPI('/show/currentshow')
            .then(function (data) {
                var show = data.payload;

                camMan.show = show.show_id;
            })
            .catch(function (err) {
                camMan.show = 0;
            })
            .finally(function () {
                camMan.cam = cam;
                camMan.time = Date.now();
            })
            .then(function () {
                console.log('Set live camera to ' + cam);
                return updateCam();
            });
    } else {
        return updateCam();
    }

};

// Update camLive with the camera that *should* be live
var updateCam = function () {
    return getCurrentCam()
        .then(function (cam) {
            camLive = cam.camera;
        });
};

// Respond to http request with image from requested camera
var imageServer = function (req, res) {
    var data = '';
    var cam = req.params.cam;

    if ((typeof images[cam] !== 'undefined') && images[cam] !== null) {
        data = images[cam];
        //console.log('Will serve image of ' + data.length + ' bytes');

        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': data.length
        });

        res.write(data, 'binary');
        res.end();

    } else {
        finalhandler(req, res);
    }
};

// initialise the router & server and add final callback for dealing with other requests
var router = Router();
var server = http.createServer(function onRequest (req, res) {
    router(req, res, finalhandler(req, res));
});

// use middleware to compress all responses
router.use(compression());

// handle GET requests to `/current`
router.get('/current', function (req, res) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    getCurrentCam()
        .then(function (data) {
            res.end(JSON.stringify(data));
        });
});

// handle POST requests to `/set/:cam`
router.post('/set/:cam', function (req, res) {
    res.statusCode = 204;
    res.setHeader('Content-Type', 'application/json');
    setCurrentCam(req.params.cam)
        .finally(function () {
            res.end();
        });
});

// handle POST requests to `/update`
router.post('/update', function (req, res) {
    res.statusCode = 204;
    res.setHeader('Content-Type', 'application/json');
    updateCam()
        .finally(function () {
            res.end();
        });
});

// Setup a seperate base router for view-ing cameras
var view = Router();
router.use('/view/', view);

view.get('/live', function (req, res) {
    req.params.cam = camLive;
    imageServer(req, res);
});

view.get('/:cam', function (req, res) {
    imageServer(req, res);
});

// Setup Paparazzo cameras
for (var camera in cameraConfig) {
    cameras[camera] = new Paparazzo(cameraConfig[camera]);
    images[camera] = '';

    cameras[camera].on('update', imageUpdate(camera));
    cameras[camera].on('error', imageError(camera));
    cameras[camera].start();
}

// Update every 1 min to make sure right cam is on air
setInterval(update, 60000);

// Launch the server
server.listen(serverConfig.port, function () {
    console.log('CamServer is now running with ' + Object.keys(cameras).length + ' cameras.');
});
