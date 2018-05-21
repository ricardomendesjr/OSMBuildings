
class Feature {

  constructor (type, url, options = {}, callback = function () {}) {
    this.type = type;
    this.url = url;
    this.options = options;
    this.callback = callback;

    this.id = options.id;
    this.color = options.color;

    this.matrix = new GLX.Matrix();
    this.translate(0, 0, options.elevation || 0);
    this.scale(options.scale || 1);
    this.rotate(options.rotation || 0);

    this.minZoom = Math.max(parseFloat(options.minZoom || MIN_ZOOM), APP.minZoom);
    this.maxZoom = Math.min(parseFloat(options.maxZoom || MAX_ZOOM), APP.maxZoom);

    if (this.maxZoom < this.minZoom) {
      this.minZoom = MIN_ZOOM;
      this.maxZoom = MAX_ZOOM;
    }

    this.load();
  }

  load () {
    APP.workers.get(worker => {
      worker.onMessage(res => {
        if (res === 'error') {
          this.callback();
          worker.free();
          return;
        }

        if (res === 'load') {
          this.callback();
          return;
        }

        this.onLoad(res);
        worker.free();
      });

      worker.postMessage({ type: this.type, url: this.url, options: this.options });
    });
  }

  onLoad (res) {

    this.position = res.position;
    this.prevX = 0;
    this.prevY = 0;

    //****** init buffers *********************************

    this.items = res.items;

    // this cascade ralaxes rendering a lot when new tile data arrives
    this.vertexBuffer = new GLX.Buffer(3, res.vertices);
    setTimeout(() => {
      this.normalBuffer = new GLX.Buffer(3, res.normals);
      setTimeout(() => {
        this.colorBuffer = new GLX.Buffer(3, res.colors);
        setTimeout(() => {
          this.texCoordBuffer = new GLX.Buffer(2, res.texCoords);
          setTimeout(() => {
            this.heightBuffer = new GLX.Buffer(1, res.heights);
            setTimeout(() => {
              this.pickingBuffer = new GLX.Buffer(3, res.pickingColors);
              setTimeout(() => {
                this.applyTintAndZScale();
                APP.features.add(this);
                this.fade = 0;
                this.isReady = true;
              }, 20);
            }, 20);
          }, 20);
        }, 20);
      }, 20);
    }, 20);
  }

  translate (x = 0, y = 0, z = 0) {
    this.matrix.translate(x, y, z);
  }

  scale (scaling) {
    this.matrix.scale(scaling, scaling, scaling);
  }

  rotate (angle) {
    this.matrix.rotateZ(-angle);
  }

  getMatrix () {
    const
      currX = (this.position.longitude - APP.position.longitude),
      currY = (this.position.latitude - APP.position.latitude),
      dx = currX - this.prevX,
      dy = currY - this.prevY;

    // TODO: calc this once per renderFrame()
    const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos(APP.position.latitude / 180 * Math.PI);

    this.matrix.translate(dx * metersPerDegreeLongitude, -dy * METERS_PER_DEGREE_LATITUDE, 0);

    this.prevX = currX;
    this.prevY = currY;

    return this.matrix;
  }

  getFade () {
    if (this.fade >= 1) {
      return 1;
    }

    render.speedUp();

    const fade = this.fade;
    this.fade += 1 / (1 * 60); // (duration * fps)

    return fade;
  }

  applyTintAndZScale () {
    const tintColors = [];
    const tintCallback = APP.features.tintCallback;
    const zScales = [];
    const zScaleCallback = APP.features.zScaleCallback;

    this.items.forEach(item => {
      const f = { id: item.id, properties: item.properties }; // perhaps pass center/bbox as well
      const tintColor = tintCallback(f);
      const col = tintColor ? [...Qolor.parse(tintColor).toArray(), 1] : [0, 0, 0, 0];
      const hideFlag = zScaleCallback(f);
      for (let i = 0; i < item.vertexCount; i++) {
        tintColors.push(...col);
        zScales[i] = hideFlag ? 0 : 1;
      }
    });

    // perhaps mix colors in JS and transfer just one color buffer
    this.tintBuffer = new GLX.Buffer(4, new Float32Array(tintColors));
    this.zScaleBuffer = new GLX.Buffer(1, new Float32Array(zScales));
  }

  destroy () {
    APP.features.remove(this);

    // if (this.request) {
    //   this.request.abort(); // TODO: signal to workers
    // }

    this.items = [];

    if (this.isReady) {
      this.isReady = false;
      this.vertexBuffer.destroy();
      this.normalBuffer.destroy();
      this.colorBuffer.destroy();
      this.texCoordBuffer.destroy();
      this.heightBuffer.destroy();
      this.pickingBuffer.destroy();
    }
  }
}