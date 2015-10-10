var config, Paparazzo, http, url, cameraConfig, cameras, images;

config = require('config');
Paparazzo = require('paparazzo');
http = require('http');
url = require('url');

cameraConfig = config.get('Cameras');

var imageUpdate = function (_this) {
    return function(image) {
        _this = image;
        return console.log("Downloaded " + image.length + " bytes");
    };
};
var imageError = function (_this) {
    return function (error) {
        return console.log("Error: " + error.message);
    };
};

cameras = {};
images = {};

for (var camera in cameraConfig) {
    cameras[camera] = new Paparazzo(cameraConfig[camera]);

    cameras[camera].on("update", imageUpdate(images[camera]));
    cameras[camera].on("error", imageError(images[camera]));
    cameras[camera].start();
}

http.createServer(function (req, res) {
    var data, path, cam;
    data = '';
    path = url.parse(req.url).pathname;
    cam = path.substring(1);

    if ((typeof images[cam] !== undefined) && images[cam] !== null) {
        data = images[cam];
        console.log("Will serve image of " + data.length + " bytes");
    }

    res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': data.length
    });

    res.write(data, 'binary');
    return res.end();

}).listen(3000);
