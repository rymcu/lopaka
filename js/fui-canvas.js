const fuiCanvasComponent = {
  template: `<div class="canvas-wrapper">
    <div class="fui-grid">
        <canvas id="screen"
            :width="canvasWidth"
            :height="canvasHeight"
            :style="style"
            ref="screen"
            :class="canvasClassNames"
            @mousedown="canvasMouseDown"
            @mousemove="canvasMouseMove"
            @mouseleave="canvasMouseLeave"
            @dragover="(e) => { e.preventDefault() }"
            @drop="canvasOnDrop"
        />
        </div>
    </div>`,
  props: {
    display: String,
    layerIndex: Number,
    activeTool: String,
    screenElements: Array,
    currentLayer: Object,
    fuiImages: Array,
    imageDataCache: Object,
  },
  data() {
    return {
      CTX: undefined,
      imageCanvasCTX: undefined,
      mouseClick_x: 0,
      mouseClick_y: 0,
      mouseClick_dx: 0,
      mouseClick_dy: 0,
      oX: 0,
      oY: 0,
      isMoving: false,
      isDrawing: false,
      scale: 4,
    };
  },
  computed: {
    canvasSize() {
      return this.display.split("×");
    },
    canvasClassNames() {
      return {
        "fui-canvas_select": this.activeTool === "select",
        "fui-canvas_moving": this.isMoving,
      };
    },
    canvasWidth() {
      return parseInt(this.canvasSize[0]);
    },
    canvasHeight() {
      return parseInt(this.canvasSize[1]);
    },
    canvasBoundX() {
      return this.canvasWidth * this.scale;
    },
    canvasBoundY() {
      return this.canvasHeight * this.scale;
    },
    style() {
      return `width: ${this.canvasBoundX}px; height: ${this.canvasBoundY}px;`;
    },
  },
  mounted() {
    this.CTX = this.$refs.screen.getContext("2d", { willReadFrequently: true });

    this.CTX.strokeWidth = 1;
    this.CTX.textRendering = "optimizeSpeed";

    document.addEventListener("mouseup", this.canvasMouseUp);
    this.$refs.screen.addEventListener("contextmenu", (event) => {
      if (this.isDrawing || this.isMoving) {
        event.preventDefault();
      }
    });
    document.addEventListener("keydown", this.keyDownHandler);

    this.redrawCanvas(this.screenElements);
    this.$emit("updateCode");
  },
  unmounted() {
    document.removeEventListener("mouseup", this.canvasMouseUp);
    document.removeEventListener("keydown", this.keyDownHandler);
  },
  methods: {
    async canvasOnDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      const [offsetSrcImgX, offsetSrcImgY] = e.dataTransfer.getData("offset")
        ? e.dataTransfer.getData("offset").split(",")
        : [0, 0];
      const offsetTargetX = scaleDown(e.offsetX - offsetSrcImgX);
      const offsetTargetY = scaleDown(e.offsetY - offsetSrcImgY);
      let name = e.dataTransfer.getData("name");

      if (!name) {
        const file = e.dataTransfer.files[0];
        name = file.name.substr(0, file.name.lastIndexOf(".")) || file.name; // remove file extension
        const fileResult = await readFileAsync(file);
        const image = await loadImageAsync(fileResult);
        this.$emit("updateFuiImages", {
          name: name,
          width: image.width,
          height: image.height,
          element: image,
          isCustom: true,
        });
      }
      this.addImageToCanvas(name, offsetTargetX, offsetTargetY);
    },
    canvasMouseDown(e) {
      e.preventDefault();
      if (e.button !== 0 || this.isDrawing || this.isMoving) {
        return;
      }
      this.$emit("updateCurrentLayer", undefined);
      const [x, y] = [e.offsetX, e.offsetY];
      this.mouseClick_x = x - (x % this.scale);
      this.mouseClick_y = y - (y % this.scale);
      this.isDrawing = true;

      const layerProps = {
        name: "",
        type: this.activeTool,
        index: this.layerIndex,
        x: scaleDown(x),
        y: scaleDown(y),
      };

      if (["frame", "box", "dot", "circle", "disc"].includes(this.activeTool)) {
        this.$emit("updateCurrentLayer", {
          ...layerProps,
          width: 1,
          height: 1,
          radius: 0,
        });
        this.$emit("addScreenLayer");
      } else if (this.activeTool === "line") {
        this.$emit("updateCurrentLayer", {
          ...layerProps,
          x2: scaleDown(x),
          y2: scaleDown(y),
          width: 0,
          height: 0,
        });
        this.$emit("addScreenLayer");
      } else if (this.activeTool === "str") {
        this.$emit("updateCurrentLayer", {
          ...layerProps,
          yy: scaleDown(y) - textContainerHeight[defaultFont],
          text: DEFAULT_STRING,
          width: getTextWidth(DEFAULT_STRING, defaultFont),
          height: textContainerHeight[defaultFont],
          font: defaultFont,
        });
        this.$emit("addScreenLayer");
        this.$emit("setActiveTool", "select");
      } else {
        // Moving otherwise
        const current = getElementByOffset(this.screenElements, x, y);
        if (current) {
          this.isMoving = true;
          this.$emit("updateCurrentLayer", current);
          const currentX = scaleUp(current.x);
          const currentY = scaleUp(current.y);
          this.mouseClick_dx = this.mouseClick_x - currentX;
          this.mouseClick_dy = this.mouseClick_y - currentY;
        }
      }
    },
    canvasMouseMove(e) {
      e.preventDefault();
      if (!this.currentLayer || !this.isDrawing) {
        return;
      }
      let x =
        this.mouseClick_x > this.canvasBoundX
          ? this.canvasBoundX
          : this.mouseClick_x;
      let y =
        this.mouseClick_y > this.canvasBoundY
          ? this.canvasBoundY
          : this.mouseClick_y;
      const offsetX = scaleDown(e.offsetX);
      const offsetY = scaleDown(e.offsetY);
      const layerProps = {};
      if (
        ["line", "frame", "box", "circle", "disc", "str"].includes(this.activeTool) &&
        e.offsetX >= 0 &&
        e.offsetY >= 0 &&
        e.offsetX < this.canvasBoundX &&
        e.offsetY < this.canvasBoundY
      ) {
        if (this.activeTool === "frame") {
          x =
            x >= this.canvasBoundX - this.scale
              ? this.canvasBoundX - this.scale
              : x;
          y =
            y >= this.canvasBoundY - this.scale
              ? this.canvasBoundY - this.scale
              : y;
        }

        if (["line"].includes(this.activeTool)) {
          layerProps.x2 = offsetX;
          layerProps.y2 = offsetY;
        }
        if (["frame", "box"].includes(this.activeTool)) {
          const width = e.offsetX - this.mouseClick_x;
          const height = e.offsetY - this.mouseClick_y;
          layerProps.width = scaleSize(width);
          layerProps.height = scaleSize(height);
        }
        if (["circle", "disc"].includes(this.activeTool)) {
          let width = e.offsetX - this.mouseClick_x;
          let height = e.offsetY - this.mouseClick_y;

          const absWidth = Math.abs(width);
          const absHeight = Math.abs(height);

          let diameter = absWidth > absHeight ? absWidth : absHeight;
          if (width < 0) {
            layerProps.x = scaleDown(this.mouseClick_x - diameter);
          }
          if (height < 0) {
            layerProps.y = scaleDown(this.mouseClick_y - diameter);
          }

          layerProps.width = scaleSize(diameter);
          layerProps.height = scaleSize(diameter);
          layerProps.radius = scaleSize(Math.abs(diameter) / 2);
        } else {
          layerProps.x = scaleDown(x);
          layerProps.y = scaleDown(y);
        }
      } else if (this.activeTool === "dot") {
        layerProps.x = offsetX;
        layerProps.y = offsetY;
      } else {
        x = e.offsetX - this.mouseClick_dx;
        y = e.offsetY - this.mouseClick_dy;
        // moving text and line layers
        if (["str"].includes(this.currentLayer.type)) {
          layerProps.yy =
            scaleDown(y) - textContainerHeight[this.currentLayer.font];
        }
        if (["line"].includes(this.currentLayer.type)) {
          const { x: x1, y: y1, x2, y2 } = this.currentLayer;
          const width = Math.abs(x2 - x1);
          const height = Math.abs(y2 - y1);
          if (x2 > x1) {
            layerProps.x2 = scaleDown(x) + width;
          } else {
            layerProps.x2 = scaleDown(x) - width;
          }
          if (y2 > y1) {
            layerProps.y2 = scaleDown(y) + height;
          } else {
            layerProps.y2 = scaleDown(y) - height;
          }
        }
        // moving the rest
        layerProps.x = scaleDown(x);
        layerProps.y = scaleDown(y);
      }
      this.$emit("updateCurrentLayer", layerProps);
      this.redrawCanvas(this.screenElements);
    },
    canvasMouseLeave(e) {
      e.preventDefault();
      if (this.activeTool === "select") {
        this.isDrawing = false;
        this.stopDrawing(e);
      }
      this.isMoving = false;
    },
    canvasMouseUp(e) {
      if (this.isDrawing || this.isMoving) {
        this.$emit("updateCode");
        this.$emit("saveLayers");
        this.isMoving = false;
      }
      if (this.isDrawing) {
        e.preventDefault();
        this.stopDrawing(e);
        this.redrawCanvas(this.screenElements);
        this.isDrawing = false;
      }
    },
    stopDrawing() {
      if (this.currentLayer) {
        if (["frame", "box"].includes(this.activeTool)) {
          const layerProps = {};
          if (this.currentLayer.width < 0) {
            layerProps.width = Math.abs(this.currentLayer.width);
            layerProps.x = this.currentLayer.x - layerProps.width;
          }
          if (this.currentLayer.height < 0) {
            layerProps.height = Math.abs(this.currentLayer.height);
            layerProps.y = this.currentLayer.y - layerProps.height;
          }
          this.$emit("updateCurrentLayer", layerProps);
        }
      }
    },
    addImageToCanvas(name, x = 0, y = 0) {
      if (!this.imageDataCache[name]) {
        this.imageDataCache[name] = imgToCanvasData(
          this.fuiImages[name].element
        );
      }
      const { isCustom, width, height } = this.fuiImages[name];
      const layer = {
        type: "icon",
        name: name,
        index: this.layerIndex,
        x: x,
        y: y,
        width: width,
        height: height,
        isOverlay: false,
        isCustom: isCustom,
      };
      this.$emit("updateCurrentLayer", layer);
      this.$emit("addScreenLayer", layer);
      this.$emit("setActiveTool", "select");
      this.$emit("updateCode");
      this.$emit("saveLayers");
    },
    redrawCanvas(screenElements) {
      this.CTX.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.CTX.save();
      for (let screenElement of screenElements) {
        const imgData = this.CTX.getImageData(
          0,
          0,
          this.canvasWidth,
          this.canvasHeight
        );
        const {
          name,
          x,
          y,
          x2,
          y2,
          width,
          height,
          radius,
          type,
          text,
          font,
          isOverlay,
        } = screenElement;
        switch (type) {
          case "frame":
            this.CTX.strokeRect(x + 0.5, y + 0.5, width, height);
            break;
          case "box":
            this.CTX.fillRect(x, y, width, height);
            break;
          case "dot":
            this.CTX.fillRect(x, y, 1, 1);
            break;
          case "icon":
            const data = this.imageDataCache[name];
            if (isOverlay) {
              putImageDataWithAlpha(this.CTX, data, x, y, 0.75);
            } else {
              const newImageData = maskAndMixImageData(imgData, data, x, y);
              this.CTX.putImageData(
                newImageData,
                0,
                0
              );
            }
            break;
          case "line":
            drawLine(
              imgData,
              x,
              y,
              x2,
              y2,
              this.canvasWidth,
              this.canvasHeight,
              this.scale
            );
            this.CTX.putImageData(imgData, 0, 0);
            break;
          case "circle":
            drawCircle(
              imgData,
              x + radius,
              y + radius,
              radius,
              this.canvasWidth,
              this.canvasHeight
            );
            this.CTX.putImageData(imgData, 0, 0);
            break;
          case "disc":
            drawDisc(
              imgData,
              x + radius,
              y + radius,
              radius,
              this.canvasWidth,
              this.canvasHeight
            );
            this.CTX.putImageData(imgData, 0, 0);
            break;
          case "str":
            const fontSize = fontSizes[font];
            this.CTX.font = `${fontSize}px ${font}`;
            this.CTX.fillText(text, x, y);
            break;
          default:
            // Handle the case when 'type' doesn't match any cases
            break;
        }
      }
      this.CTX.restore();
    },
    keyDownHandler(event) {
      if (event.isComposing) {
        return;
      }
      if (this.currentLayer && Object.values(KEYS).includes(event.keyCode)) {
        event.preventDefault();
        switch (event.keyCode) {
          case KEYS.UP:
            this.currentLayer.y -= 1;
            break;
          case KEYS.DOWN:
            this.currentLayer.y += 1;
            break;
          case KEYS.LEFT:
            this.currentLayer.x -= 1;
            break;
          case KEYS.RIGHT:
            this.currentLayer.x += 1;
            break;
          default:
            break;
        }
        this.$emit("updateCurrentLayer", this.currentLayer);
        this.redrawCanvas(this.screenElements);
        this.$emit("saveLayers");
      }
    }
  },
};
