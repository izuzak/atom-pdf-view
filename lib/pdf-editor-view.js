"use babel";

let {$, ScrollView} = require('atom-space-pen-views');
let {Point, TextEditor} = require('atom');
let fs = require('fs-plus');
let path = require('path');
let _ = require('underscore-plus');
let {File, Disposable, CompositeDisposable} = require('atom');
let {Function} = require('loophole');
global.Function = Function;

global.PDFJS = {workerSrc: "temp", cMapUrl:"temp", cMapPacked:true};
require('./../node_modules/pdfjs-dist/build/pdf.js');
PDFJS.workerSrc = "file://" + path.resolve(__dirname, "../node_modules/pdfjs-dist/build/pdf.worker.js");
PDFJS.cMapUrl = "file://" + path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps")+"/";

let {exec, execFile} = require('child_process');

export default class PdfEditorView extends ScrollView {
  static content() {
    this.div({class: 'pdf-view', tabindex: -1}, () => {
      this.div({outlet: 'container'});
    });
  }

  constructor(filePath) {
    super();

    this.currentScale = 1.5;
    this.defaultScale = 1.5;
    this.scaleFactor = 10.0;

    this.filePath = filePath;
    this.file = new File(this.filePath);
    this.canvases = [];

    this.updatePdf();

    this.currentPageNumber = 0;
    this.totalPageNumber = 0;
    this.centersBetweenPages = [];
    this.pageHeights = [];
    this.scrollTopBeforeUpdate = 0;
    this.scrollLeftBeforeUpdate = 0;
    this.updating = false;

    let disposables = new CompositeDisposable();

    let onFileChangeCallback = _.debounce(() => {
      if (this.updating) {
        this.fileChanged = true;
      } else {
        this.updatePdf();
      }
    }, 100);

    disposables.add(this.file.onDidChange(onFileChangeCallback));

    let moveLeftCallback = (() => this.scrollLeft(this.scrollLeft() - $(window).width() / 20));
    let moveRightCallback = (() => this.scrollRight(this.scrollRight() + $(window).width() / 20));
    let scrollCallback = (() => this.onScroll());
    let resizeHandler = (() => this.setCurrentPageNumber());

    let elem = this;

    atom.commands.add('.pdf-view', {
      'core:move-left': moveLeftCallback,
      'core:move-right': moveRightCallback
    });

    elem.on('scroll', scrollCallback);
    disposables.add(new Disposable(() => $(window).off('scroll', scrollCallback)));

    $(window).on('resize', resizeHandler);
    disposables.add(new Disposable(() => $(window).off('resize', resizeHandler)));

    atom.commands.add('atom-workspace', {
      'pdf-view:zoom-in': () => {
        if (atom.workspace.getActivePaneItem() === this) {
          this.zoomIn();
        }
      },
      'pdf-view:zoom-out': () => {
        if (atom.workspace.getActivePaneItem() === this) {
          this.zoomOut();
        }
      },
      'pdf-view:reset-zoom': () => {
        if (atom.workspace.getActivePaneItem() === this) {
          this.resetZoom();
        }
      }
    });

    this.dragging = null;

    this.onMouseMove = (e) => {
      if (this.dragging) {
        this.simpleClick = false;

        this.scrollTop(this.dragging.scrollTop - (e.screenY - this.dragging.y));
        this.scrollLeft(this.dragging.scrollLeft - (e.screenX - this.dragging.x));
        e.preventDefault();
      }
    };

    this.onMouseUp = (e) => {
      this.dragging = null;
      $(document).unbind('mousemove', this.onMouseMove);
      $(document).unbind('mouseup', this.onMouseUp);
      e.preventDefault();
    };

    this.on('mousedown', (e) => {
      this.simpleClick = true;
      atom.workspace.paneForItem(this).activate();
      this.dragging = {x: e.screenX, y: e.screenY, scrollTop: this.scrollTop(), scrollLeft: this.scrollLeft()};
      $(document).on('mousemove', this.onMouseMove);
      $(document).on('mouseup', this.onMouseUp);
      e.preventDefault();
    });

    this.on('mousewheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.originalEvent.wheelDelta > 0) {
          this.zoomIn();
        } else if (e.originalEvent.wheelDelta < 0) {
          this.zoomOut();
        }
      }
    });
  }

  onCanvasClick(page, e) {
    if (this.simpleClick && atom.config.get('pdf-view.enableSyncTeX')) {
      e.preventDefault();
      this.pdfDocument.getPage(page).then((pdfPage) => {
        let viewport = pdfPage.getViewport(this.currentScale);
        [x,y] = viewport.convertToPdfPoint(e.offsetX, $(this.canvases[page - 1]).height() - e.offsetY);

        let callback = ((error, stdout, stderr) => {
          if (!error) {
            stdout = stdout.replace(/\r\n/g, '\n');
            let attrs = {};
            for (let line of stdout.split('\n')) {
              let m = line.match(/^([a-zA-Z]*):(.*)$/)
              if (m) {
                attrs[m[1]] = m[2];
              }
            }

            let file = attrs.Input;
            let line = attrs.Line;

            if (file && line) {
              let editor = null;
              let pathToOpen = path.normalize(attrs.Input);
              let lineToOpen = +attrs.Line;
              let done = false;
              for (let editor of atom.workspace.getTextEditors()) {
                if (editor.getPath() === pathToOpen) {
                  let position = new Point(lineToOpen-1, -1);
                  editor.scrollToBufferPosition(position, {center: true});
                  editor.setCursorBufferPosition(position);
                  editor.moveToFirstCharacterOfLine();
                  let pane = atom.workspace.paneForItem(editor);
                  pane.activateItem(editor);
                  pane.activate();
                  done = true;
                  break;
                }
              }

              if (!done) {
                atom.workspace.open(pathToOpen, {initialLine: lineToOpen, initialColumn: 0})
              }
            }
          }
        });

        let synctexPath = atom.config.get('pdf-view.syncTeXPath');
        let clickspec = [page, x, y, this.filePath].join(':');

        if (synctexPath) {
          execFile(synctexPath, ["edit", "-o", clickspec], callback);
        } else {
          let cmd = `synctex edit -o "${clickspec}"`;
          exec(cmd, callback);
        }
      });
    }
  }

  onScroll() {
    if (!this.updating) {
      this.scrollTopBeforeUpdate = this.scrollTop();
      this.scrollLeftBeforeUpdate = this.scrollLeft();
    }

    this.setCurrentPageNumber();
  }

  setCurrentPageNumber() {
    if (!this.pdfDocument) {
      return;
    }

    let center = (this.scrollBottom() + this.scrollTop())/2.0
    this.currentPageNumber = 1

    if (this.centersBetweenPages.length === 0 && this.pageHeights.length === this.pdfDocument.numPages)
      for (let pdfPageNumber of _.range(1, this.pdfDocument.numPages+1)) {
        this.centersBetweenPages.push(this.pageHeights.slice(0, pdfPageNumber).reduce(((x,y) => x + y), 0) + pdfPageNumber * 20 - 10);
      }

    for (let pdfPageNumber of _.range(2, this.pdfDocument.numPages+1)) {
      if (center >= this.centersBetweenPages[pdfPageNumber-2] && center < this.centersBetweenPages[pdfPageNumber-1]) {
        this.currentPageNumber = pdfPageNumber;
      }
    }

    atom.views.getView(atom.workspace).dispatchEvent(new Event('pdf-view:current-page-update'));
  }

  finishUpdate() {
    this.updating = false;
    if (this.fileChanged) {
      this.updatePdf();
    }
  }

  updatePdf() {
    this.fileChanged = false;

    if (!fs.existsSync(this.filePath)) {
      return;
    }

    let pdfData = null;

    try {
      pdfData = new Uint8Array(fs.readFileSync(this.filePath));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
    }

    this.updating = true;
    this.container.find("canvas").remove();
    this.canvases = [];

    PDFJS.getDocument(pdfData).then((pdfDocument) => {
      this.pdfDocument = pdfDocument;
      this.totalPageNumber = this.pdfDocument.numPages;

      for (let pdfPageNumber of _.range(1, this.pdfDocument.numPages+1)) {
        let canvas = $("<canvas/>", {class: "page-container"}).appendTo(this.container)[0];
        this.canvases.push(canvas);
        $(canvas).on('click', (e) => this.onCanvasClick(pdfPageNumber, e));
      }

      this.renderPdf();
    }, () => this.finishUpdate());
  }

  renderPdf(scrollAfterRender = true) {
    this.centersBetweenPages = [];
    this.pageHeights = [];

    for (let pdfPageNumber of _.range(1, this.pdfDocument.numPages+1)) {
      let canvas = this.canvases[pdfPageNumber-1];

      this.pdfDocument.getPage(pdfPageNumber).then((pdfPage) => {
        let viewport = pdfPage.getViewport(this.currentScale);
        let context = canvas.getContext('2d');

        let outputScale = window.devicePixelRatio;
        canvas.height = Math.floor(viewport.height) * outputScale;
        canvas.width = Math.floor(viewport.width) * outputScale;

        if (outputScale != 1) {
          context._scaleX = outputScale;
          context._scaleY = outputScale;
          context.scale(outputScale, outputScale);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';
        }

        this.pageHeights.push(Math.floor(viewport.height));

        pdfPage.render({canvasContext: context, viewport: viewport});

        if (pdfPage.pageNumber === this.pdfDocument.numPages && scrollAfterRender) {
          this.scrollTop(this.scrollTopBeforeUpdate);
          this.scrollLeft(this.scrollLeftBeforeUpdate);
          this.setCurrentPageNumber();
          this.finishUpdate();
        }
      }, () => this.finishUpdate());
    }
  }

  zoomOut() {
    return this.adjustSize(100 / (100 + this.scaleFactor));
  }

  zoomIn() {
    return this.adjustSize((100 + this.scaleFactor) / 100);
  }

  resetZoom() {
    return this.adjustSize(this.defaultScale / this.currentScale);
  }

  computeZoomedScrollTop(oldScrollTop, oldPageHeights) {
    let pixelsToZoom = 0;
    let spacesToSkip = 0;
    let zoomedPixels = 0;

    for (let pdfPageNumber of _.range(0, this.pdfDocument.numPages)) {
      if (pixelsToZoom + spacesToSkip + oldPageHeights[pdfPageNumber] > oldScrollTop) {
        zoomFactorForPage = this.pageHeights[pdfPageNumber] / oldPageHeights[pdfPageNumber];
        let partOfPageAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip);
        zoomedPixels += Math.round(partOfPageAboveUpperBorder * zoomFactorForPage);
        pixelsToZoom += partOfPageAboveUpperBorder;
        break;
      } else {
        pixelsToZoom += oldPageHeights[pdfPageNumber];
        zoomedPixels += this.pageHeights[pdfPageNumber];
      }

      if (pixelsToZoom + spacesToSkip + 20 > oldScrollTop) {
        let partOfPaddingAboveUpperBorder = oldScrollTop - (pixelsToZoom + spacesToSkip);
        spacesToSkip += partOfPaddingAboveUpperBorder;
        break;
      } else {
        spacesToSkip += 20;
      }
    }

    return zoomedPixels + spacesToSkip;
  }

  adjustSize(factor) {
    if (!this.pdfDocument) {
      return;
    }

    let oldScrollTop = this.scrollTop();
    let oldPageHeights = this.pageHeights.slice(0);
    this.currentScale = this.currentScale * factor;
    this.renderPdf(false);

    process.nextTick(() => {
      let newScrollTop = this.computeZoomedScrollTop(oldScrollTop, oldPageHeights);
      this.scrollTop(newScrollTop);
    });

    process.nextTick(() => {
      let newScrollLeft = this.scrollLeft() * factor;
      this.scrollLeft(newScrollLeft);
    });
  }

  getCurrentPageNumber() {
    return this.currentPageNumber;
  }

  getTotalPageNumber() {
    return this.totalPageNumber;
  }

  scrollToPage(pdfPageNumber) {
    if (!this.pdfDocument || isNaN(pdfPageNumber)) {
      return;
    }

    pdfPageNumber = Math.min(pdfPageNumber, this.pdfDocument.numPages);
    pageScrollPosition = (this.pageHeights.slice(0, (pdfPageNumber-1)).reduce(((x,y) => x+y), 0)) + (pdfPageNumber - 1) * 20

    return this.scrollTop(pageScrollPosition);
  }

  serialize() {
    return {filePath: this.filePath, deserializer: 'PdfEditorDeserializer'};
  }

  getTitle() {
    if (this.filePath) {
      return path.basename(this.filePath);
    } else {
      return 'untitled';
    }
  }

  getURI() {
    return this.filePath;
  }

  getPath() {
    return this.filePath;
  }

  destroy() {
    return this.detach();
  }

  onDidChangeTitle() {
    return new Disposable(() => null);
  }

  onDidChangeModified() {
    return new Disposable(() => null);
  }
}
