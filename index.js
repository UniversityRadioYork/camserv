var config, Paparazzo, http, url, cameraConfig, cameras, images;

require('coffee-script/register');

config = require('config');
Paparazzo = require('paparazzo');
http = require('http');
url = require('url');

cameraConfig = config.get('Cameras');

cameras = {};
images = {};

var imageUpdate = function (camera) {
    return function(image) {
        images[camera] = image;
//        return console.log('Downloaded ' + image.length + ' bytes');
    };
};
var imageError = function (camera) {
    return function (error) {
        return console.log('Error: ' + error.message);
    };
};

var imageServer = function (req, res) {
    var data, path, cam;
    data = '';
    path = url.parse(req.url).pathname;
    cam = path.substring(1);

    if ((typeof images[cam] !== 'undefined') && images[cam] !== null) {
        data = images[cam];
        console.log('Will serve image of ' + data.length + ' bytes');

        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': data.length
        });
    } else {
        res.writeHead(404);
    }

    res.write(data, 'binary');
    return res.end();
};

for (var camera in cameraConfig) {
    cameras[camera] = new Paparazzo(cameraConfig[camera]);
    images[camera] = '';

    cameras[camera].on('update', imageUpdate(camera));
    cameras[camera].on('error', imageError(camera));
    cameras[camera].start();
}

http.createServer(imageServer).listen(3000);
